// Provider abstraction: pipeline code only calls getProvider().generateJSON().
// Supports model fallback on 503/429 and per-call timeouts.

class Sem { constructor(n) { this.n = n; this.q = []; }
  async run(fn) { if (this.n <= 0) await new Promise((r) => this.q.push(r)); else this.n--; try { return await fn(); } finally { const nx = this.q.shift(); nx ? nx() : this.n++; } } }
const gate = new Sem(Number(process.env.AI_MAX_CONCURRENCY || 2)); // global cap on simultaneous provider calls
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PER_CALL_TIMEOUT = Number(process.env.AI_CALL_TIMEOUT_MS || 8000);

/** Call the Gemini REST API for a single model. Throws with code RATE_LIMIT, PROVIDER, or TIMEOUT. */
async function callGemini(model, { system, data, instruction, schemaHint }) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", signal: AbortSignal.timeout(PER_CALL_TIMEOUT),
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.AI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      // Instructions and untrusted document data travel in separate parts.
      contents: [{ role: "user", parts: [{ text: instruction + "\nReturn JSON shaped like: " + schemaHint }, { text: "<document_data>\n" + data + "\n</document_data>" }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  if (res.status === 429 || res.status === 503) {
    const errText = await res.text().catch(() => "unknown");
    console.warn(`Gemini ${model} returned ${res.status}: ${errText.slice(0, 200)}`);
    throw Object.assign(new Error(`rate/overloaded ${res.status}`), { code: "RATE_LIMIT", status: res.status });
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    console.error(`Gemini API Error (${model}): ${res.status} - ${errText}`);
    throw Object.assign(new Error("provider error"), { code: "PROVIDER" });
  }
  const j = await res.json();
  return j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

/**
 * Try primary model → on 503/429 retry once after ~300ms → fall through to fallback model.
 * Non-retriable errors (400, 401, etc.) propagate immediately.
 * Timeout errors from AbortSignal also propagate immediately.
 */
async function callWithFallback(args) {
  const primary = process.env.AI_MODEL || "gemini-3.8-flash";
  const fallback = process.env.AI_FALLBACK_MODEL || "gemini-2.0-flash";

  // Attempt 1: primary model
  try {
    return await callGemini(primary, args);
  } catch (e) {
    if (e.name === "TimeoutError") throw Object.assign(new Error("timeout"), { code: "TIMEOUT" });
    if (e.code !== "RATE_LIMIT") throw e;
    // 503/429 on primary — quick retry after ~300ms
    console.warn(`Primary model ${primary} hit ${e.status || "rate limit"}, retrying in 300ms…`);
  }

  await sleep(300);

  // Attempt 2: primary model, one quick retry
  try {
    return await callGemini(primary, args);
  } catch (e) {
    if (e.name === "TimeoutError") throw Object.assign(new Error("timeout"), { code: "TIMEOUT" });
    if (e.code !== "RATE_LIMIT") throw e;
    console.warn(`Primary model ${primary} still overloaded, falling back to ${fallback}`);
  }

  // Attempt 3: fallback model
  try {
    return await callGemini(fallback, args);
  } catch (e) {
    if (e.name === "TimeoutError") throw Object.assign(new Error("timeout"), { code: "TIMEOUT" });
    throw e; // propagate whatever error the fallback gives
  }
}

export function getProvider() {
  const providerName = process.env.AI_PROVIDER || "gemini";
  if (providerName !== "gemini") throw new Error("Unknown AI_PROVIDER");
  if (!process.env.AI_API_KEY && !process.env.TROVE_MOCK) throw Object.assign(new Error("not configured"), { code: "CONFIG" });
  return {
    // Validates against a zod schema; retries once on malformed output.
    async generateJSON(args, schema) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const raw = process.env.TROVE_MOCK ? args.mock() : await gate.run(() => callWithFallback(args));
        try { return schema.parse(JSON.parse(String(raw).replace(/^```json|```$/g, "").trim())); } catch { /* retry */ }
      }
      throw Object.assign(new Error("malformed"), { code: "MALFORMED" });
    },
  };
}
