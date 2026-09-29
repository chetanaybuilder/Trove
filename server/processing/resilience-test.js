/**
 * Resilience tests for the AI provider + analysis pipeline.
 *
 * Tests:
 *  1. 503 from primary → falls back to secondary model and returns within budget.
 *  2. Both models failing → fails fast (no slow retries).
 *  3. Large-document pipeline stays well under 20s even with mock AI.
 *  4. Primary 503 + fallback 404 (retired) → clear error, fast failure, dead model cached.
 *  5. Model chain with AI_MODEL_CHAIN env var.
 *  6. Dead model cache: a 404'd model is skipped on subsequent calls.
 *
 * Run: node server/processing/resilience-test.js
 */

process.env.TROVE_MOCK = "1"; // most tests use mock; we override for provider-level tests

// ── Helpers ─────────────────────────────────────────────────────────────
function assert(cond, msg) { if (!cond) { console.error(`  ✗ FAIL: ${msg}`); process.exitCode = 1; } else console.log(`  ✓ ${msg}`); }

// ── Test 1: 503 primary → fallback model ────────────────────────────────
async function test503Fallback() {
  console.log("\n━━ Test 1: Primary 503 → fallback model ━━");
  const calledModels = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, _opts) => {
    const model = url.match(/models\/([^:]+)/)?.[1] || "unknown";
    calledModels.push(model);
    if (model.includes("3.8")) {
      return { status: 503, ok: false, text: async () => "overloaded", json: async () => ({}) };
    }
    return {
      status: 200, ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"summary":"fallback ok","facts":[],"people":[],"dates":[],"decisions":[],"actions":[],"questions":[],"quotes":[]}' }] } }] }),
      text: async () => "",
    };
  };

  try {
    delete process.env.TROVE_MOCK;
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gemini-3.8-flash";
    process.env.AI_FALLBACK_MODEL = "gemini-2.5-flash";
    delete process.env.AI_MODEL_CHAIN;

    const { getProvider, _deadModels } = await import("../ai/provider.js?t=1");
    _deadModels.clear();
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
    assert(calledModels.some((m) => m.includes("2.5")), `Fallback model was called`);
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
    process.env.AI_FALLBACK_MODEL = "gemini-2.5-flash";
    delete process.env.AI_MODEL_CHAIN;

    const { getProvider, _deadModels } = await import("../ai/provider.js?t=2");
    _deadModels.clear();
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
    assert(elapsed < 5000, `Mock pipeline finished in ${elapsed}ms (under 5s with mock)`);
  }
}

// ── Test 4: Primary 503 + fallback 404 → clear error, fast ───────────────
async function test503Plus404() {
  console.log("\n━━ Test 4: Primary 503 + fallback 404 (retired model) ━━");
  const calledModels = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, _opts) => {
    const model = url.match(/models\/([^:]+)/)?.[1] || "unknown";
    calledModels.push(model);
    if (model.includes("3.8")) {
      return { status: 503, ok: false, text: async () => "overloaded", json: async () => ({}) };
    }
    // Fallback returns 404 (retired)
    return { status: 404, ok: false, text: async () => "model not found: gemini-2.0-flash is no longer available", json: async () => ({}) };
  };

  try {
    delete process.env.TROVE_MOCK;
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gemini-3.8-flash";
    process.env.AI_FALLBACK_MODEL = "gemini-2.0-flash";
    delete process.env.AI_MODEL_CHAIN;

    const { getProvider, _deadModels } = await import("../ai/provider.js?t=4");
    _deadModels.clear();
    const { ChunkNotes } = await import("./pipeline.js?t=4");

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
      assert(elapsed < 5000, `Failed fast in ${elapsed}ms (not waiting out deadline)`);
      // The error should be PROVIDER or RATE_LIMIT (all-failed), NOT TIMEOUT
      assert(e.code !== "TIMEOUT" && e.code !== "DEADLINE", `Error code is "${e.code}" (not TIMEOUT/DEADLINE — surfaces real cause)`);
      assert(e.message.includes("all models failed"), `Error message describes all-models-failed: "${e.message.slice(0, 80)}"`);
    }
    assert(caught, "Error was thrown");
    // Verify the 404 model is now in the dead cache
    assert(_deadModels.has("gemini-2.0-flash"), "gemini-2.0-flash is cached as dead");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.TROVE_MOCK = "1";
    delete process.env.AI_API_KEY;
  }
}

// ── Test 5: AI_MODEL_CHAIN env var ───────────────────────────────────────
async function testModelChain() {
  console.log("\n━━ Test 5: AI_MODEL_CHAIN comma-separated fallback chain ━━");
  const calledModels = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, _opts) => {
    const model = url.match(/models\/([^:]+)/)?.[1] || "unknown";
    calledModels.push(model);
    if (model === "model-c") {
      return {
        status: 200, ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: '{"summary":"chain ok","facts":[],"people":[],"dates":[],"decisions":[],"actions":[],"questions":[],"quotes":[]}' }] } }] }),
        text: async () => "",
      };
    }
    // model-a and model-b both return 503
    return { status: 503, ok: false, text: async () => "overloaded", json: async () => ({}) };
  };

  try {
    delete process.env.TROVE_MOCK;
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL_CHAIN = "model-a,model-b,model-c";
    delete process.env.AI_MODEL;
    delete process.env.AI_FALLBACK_MODEL;

    const { getProvider, _deadModels } = await import("../ai/provider.js?t=5");
    _deadModels.clear();
    const { ChunkNotes } = await import("./pipeline.js?t=5");

    const t0 = Date.now();
    const result = await getProvider().generateJSON({
      system: "test", data: "test", instruction: "test",
      schemaHint: '{"summary":"","facts":[]}',
      mock: () => '{"summary":"mock","facts":[]}',
    }, ChunkNotes);
    const elapsed = Date.now() - t0;

    assert(result.summary === "chain ok", `Got result from third model in chain`);
    assert(calledModels.includes("model-a"), "Tried model-a");
    assert(calledModels.includes("model-b"), "Tried model-b");
    assert(calledModels.includes("model-c"), "Tried model-c");
    assert(elapsed < 5000, `Completed in ${elapsed}ms (under 5s)`);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.TROVE_MOCK = "1";
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL_CHAIN;
  }
}

// ── Test 6: Dead model cache — 404'd model skipped on repeat calls ───────
async function testDeadModelCache() {
  console.log("\n━━ Test 6: Dead model cache — 404'd model skipped on next call ━━");
  let callCount = 0;
  const originalFetch = globalThis.fetch;

  try {
    delete process.env.TROVE_MOCK;
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL_CHAIN = "dead-model,good-model";
    delete process.env.AI_MODEL;
    delete process.env.AI_FALLBACK_MODEL;

    const { getProvider, _deadModels } = await import("../ai/provider.js?t=6");
    _deadModels.clear();
    const { ChunkNotes } = await import("./pipeline.js?t=6");

    // First call: dead-model returns 404, good-model succeeds
    globalThis.fetch = async (url, _opts) => {
      callCount++;
      const model = url.match(/models\/([^:]+)/)?.[1] || "unknown";
      if (model === "dead-model") {
        return { status: 404, ok: false, text: async () => "not found", json: async () => ({}) };
      }
      return {
        status: 200, ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: '{"summary":"ok","facts":[],"people":[],"dates":[],"decisions":[],"actions":[],"questions":[],"quotes":[]}' }] } }] }),
        text: async () => "",
      };
    };

    await getProvider().generateJSON({
      system: "test", data: "test", instruction: "test",
      schemaHint: '{"summary":"","facts":[]}',
      mock: () => '{"summary":"mock","facts":[]}',
    }, ChunkNotes);

    const callsFirstRound = callCount;
    assert(_deadModels.has("dead-model"), "dead-model is cached as dead after first call");

    // Second call: dead-model should be SKIPPED (no fetch call), go straight to good-model
    callCount = 0;
    await getProvider().generateJSON({
      system: "test", data: "test", instruction: "test",
      schemaHint: '{"summary":"","facts":[]}',
      mock: () => '{"summary":"mock","facts":[]}',
    }, ChunkNotes);

    assert(callCount === 1, `Second call only made ${callCount} fetch call(s) (dead model was skipped, not re-tried)`);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.TROVE_MOCK = "1";
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL_CHAIN;
  }
}

// ── Run all tests ────────────────────────────────────────────────────────
async function main() {
  console.log("🔧 Trove resilience tests\n");
  await test503Fallback();
  await testBothModelsFail();
  await testLargeDocumentPipeline();
  await test503Plus404();
  await testModelChain();
  await testDeadModelCache();
  console.log(`\n${process.exitCode ? "❌ Some tests failed" : "✅ All tests passed"}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
