/**
 * Resilience tests for the AI provider + analysis pipeline.
 *
 * Tests:
 *  1. 503 from primary → falls back to secondary model and returns within budget.
 *  2. Both models failing → fails fast (no slow retries).
 *  3. Large-document pipeline stays well under 20s even with mock AI.
 *
 * Run: node server/processing/resilience-test.js
 */

process.env.TROVE_MOCK = "1"; // most tests use mock; we override for provider-level tests

// ── Helpers ─────────────────────────────────────────────────────────────
function assert(cond, msg) { if (!cond) { console.error(`  ✗ FAIL: ${msg}`); process.exitCode = 1; } else console.log(`  ✓ ${msg}`); }

// ── Test 1: 503 primary → fallback model ────────────────────────────────
async function test503Fallback() {
  console.log("\n━━ Test 1: Primary 503 → fallback model ━━");
  // We test the callWithFallback path by mocking global fetch.
  const calledModels = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, _opts) => {
    const model = url.match(/models\/([^:]+)/)?.[1] || "unknown";
    calledModels.push(model);
    if (model.includes("3.8")) {
      // Primary always returns 503
      return { status: 503, ok: false, text: async () => "overloaded", json: async () => ({}) };
    }
    // Fallback succeeds
    return {
      status: 200, ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"summary":"fallback ok","facts":[],"people":[],"dates":[],"decisions":[],"actions":[],"questions":[],"quotes":[]}' }] } }] }),
      text: async () => "",
    };
  };

  try {
    // Temporarily disable mock so we hit the real provider path
    delete process.env.TROVE_MOCK;
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gemini-3.8-flash";
    process.env.AI_FALLBACK_MODEL = "gemini-2.0-flash";

    // Re-import provider to get a fresh instance
    const { getProvider } = await import("../ai/provider.js?t=1");
    const { ChunkNotes } = await import("./pipeline.js?t=1");

    const t0 = Date.now();
    const result = await getProvider().generateJSON({
      system: "test", data: "test data", instruction: "test instruction",
      schemaHint: '{"summary":"","facts":[]}',
      mock: () => '{"summary":"mock","facts":[]}',
    }, ChunkNotes);
    const elapsed = Date.now() - t0;

    assert(result.summary === "fallback ok", `Got result from fallback model (summary="${result.summary}")`);
    assert(calledModels.filter((m) => m.includes("3.8")).length === 2, `Primary model attempted twice (got ${calledModels.filter((m) => m.includes("3.8")).length})`);
    assert(calledModels.some((m) => m.includes("2.0")), `Fallback model was called`);
    assert(elapsed < 3000, `Completed in ${elapsed}ms (under 3s budget)`);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.TROVE_MOCK = "1";
    delete process.env.AI_API_KEY;
  }
}

// ── Test 2: Both models fail → fast failure ──────────────────────────────
async function testBothModelsFail() {
  console.log("\n━━ Test 2: Both models fail → fast failure ━━");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, _opts) => {
    return { status: 503, ok: false, text: async () => "overloaded", json: async () => ({}) };
  };

  try {
    delete process.env.TROVE_MOCK;
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gemini-3.8-flash";
    process.env.AI_FALLBACK_MODEL = "gemini-2.0-flash";

    const { getProvider } = await import("../ai/provider.js?t=2");
    const { ChunkNotes } = await import("./pipeline.js?t=2");

    const t0 = Date.now();
    let caught = false;
    try {
      await getProvider().generateJSON({
        system: "test", data: "test data", instruction: "test instruction",
        schemaHint: '{"summary":"","facts":[]}',
        mock: () => '{"summary":"mock","facts":[]}',
      }, ChunkNotes);
    } catch (e) {
      caught = true;
      const elapsed = Date.now() - t0;
      assert(e.code === "RATE_LIMIT" || e.code === "MALFORMED", `Error code is retriable-class ("${e.code}")`);
      assert(elapsed < 5000, `Failed fast in ${elapsed}ms (under 5s)`);
    }
    assert(caught, "Error was thrown when both models fail");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.TROVE_MOCK = "1";
    delete process.env.AI_API_KEY;
  }
}

// ── Test 3: Large-document pipeline under 20s ────────────────────────────
async function testLargeDocumentPipeline() {
  console.log("\n━━ Test 3: Large-document pipeline timing ━━");
  const { analyze } = await import("./pipeline.js");
  // Generate a ~60k-line document (same as selftest.js)
  const doc = Array.from({ length: 5000 }, (_, i) =>
    Array.from({ length: 11 }, (_, j) => `Meeting ${i} line ${j}: Priya decided to ship module ${i % 40} on 2025-03-${(i % 28) + 1}.`).join("\n")
  ).join("\n\n");

  for (const [name, text, mode] of [["quick", doc, "quick"], ["deep", doc, "deep"], ["quick, no blank lines", doc.replace(/\n\n/g, "\n"), "quick"]]) {
    const t = Date.now();
    let chunkCount = 0;
    const r = await analyze(text, { mode }, (p) => { if (p.stage === "chunked") chunkCount = p.total; });
    const elapsed = Date.now() - t;

    const maxChunks = mode === "deep" ? 8 : 4;
    console.log(`  ${name}: ${r.stats.lines} lines, sent≈${r.sentTokens} tokens in ${chunkCount} chunks (${elapsed}ms)`);
    assert(chunkCount <= maxChunks, `Chunk count ${chunkCount} ≤ ${maxChunks} cap`);
    assert(elapsed < 20000, `Completed in ${elapsed}ms (under 20s deadline)`);
    // With mock AI it should be dramatically faster
    assert(elapsed < 5000, `Mock pipeline finished in ${elapsed}ms (under 5s with mock)`);
  }
}

// ── Run all tests ────────────────────────────────────────────────────────
async function main() {
  console.log("🔧 Trove resilience tests\n");
  await test503Fallback();
  await testBothModelsFail();
  await testLargeDocumentPipeline();
  console.log(`\n${process.exitCode ? "❌ Some tests failed" : "✅ All tests passed"}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
