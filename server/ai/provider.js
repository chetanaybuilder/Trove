// Provider abstraction: pipeline code only calls getProvider().generateJSON().
// Supports model chain fallback on 503/429, 404 dead-model cache, and per-call timeouts.

class Sem { constructor(n) { this.n = n; this.q = []; }
  async run(fn) { if (this.n <= 0) await new Promise((r) => this.q.push(r)); else this.n--; try { return await fn(); } finally { const nx = this.q.shift(); nx ? nx() : this.n++; } } }
const gate = new Sem(Number(process.env.AI_MAX_CONCURRENCY || 2)); // global cap on simultaneous provider calls
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PER_CALL_TIMEOUT = Number(process.env.AI_CALL_TIMEOUT_MS || 8000);

// In-memory "known bad" cache: models that returned 404 (retired/not found)
// are permanently skipped for the lifetime of this process.
const deadModels = new Map(); // model -> { status, reason, since }

/** Parse AI_MODEL_CHAIN env var or build chain from AI_MODEL + AI_FALLBACK_MODEL. */
function getModelChain() {
  if (process.env.AI_MODEL_CHAIN) {
    return process.env.AI_MODEL_CHAIN.split(",").map((m) => m.trim()).filter(Boolean);
  }
  // Legacy: build chain from individual vars
  const primary = process.env.AI_MODEL || "gemini-3.8-flash";
  const fallback = process.env.AI_FALLBACK_MODEL || "gemini-2.5-flash";
  return primary === fallback ? [primary] : [primary, fallback];
}

/** Call the Gemini REST API for a single model. Throws with code RATE_LIMIT, MODEL_NOT_FOUND, PROVIDER, or TIMEOUT. */
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
    throw Object.assign(new Error(`rate/overloaded ${res.status}`), { code: "RATE_LIMIT", status: res.status, model });
  }
  if (res.status === 404) {
    const errText = await res.text().catch(() => "unknown");
    console.error(`Gemini ${model} returned 404 (retired/not found): ${errText.slice(0, 200)}`);
    // Mark model as permanently dead for this process
    deadModels.set(model, { status: 404, reason: errText.slice(0, 200), since: new Date().toISOString() });
    throw Object.assign(new Error(`model not found: ${model}`), { code: "MODEL_NOT_FOUND", status: 404, model });
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    console.error(`Gemini API Error (${model}): ${res.status} - ${errText}`);
    throw Object.assign(new Error("provider error"), { code: "PROVIDER", status: res.status, model });
  }
  const j = await res.json();
  return j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

/**
 * Walk the model chain: for each model, try it; on 503/429 retry once after
 * ~300ms then move to the next model. 404 (retired model) marks it permanently
 * dead and moves on immediately. Non-retriable errors propagate.
 *
 * When every model in the chain fails, throw with a detailed log of what
 * happened to each model.
 */
async function callWithFallback(args) {
  const chain = getModelChain();
  const failures = []; // { model, code, status, message }

  for (let ci = 0; ci < chain.length; ci++) {
    const model = chain[ci];

    // Skip models that are known dead (404 on a previous call)
    if (deadModels.has(model)) {
      const info = deadModels.get(model);
      failures.push({ model, code: "MODEL_NOT_FOUND", status: 404, message: `skipped (dead since ${info.since})` });
      console.warn(`Skipping dead model ${model} (cached 404 since ${info.since})`);
      continue;
    }

    // Attempt 1
    try {
      return await callGemini(model, args);
    } catch (e) {
      if (e.name === "TimeoutError") {
        failures.push({ model, code: "TIMEOUT", status: 0, message: "timed out" });
        // Timeout on one model — try next without retrying this one
        console.warn(`Model ${model} timed out, trying next in chain…`);
        continue;
      }
      if (e.code === "MODEL_NOT_FOUND") {
        failures.push({ model, code: "MODEL_NOT_FOUND", status: 404, message: "retired/not found" });
        continue; // already marked dead, skip to next
      }
      if (e.code !== "RATE_LIMIT") {
        failures.push({ model, code: e.code, status: e.status, message: e.message });
        throw e; // non-retriable (400, 401, etc.) — propagate immediately
      }
      // 503/429 — quick retry after ~300ms
      failures.push({ model, code: "RATE_LIMIT", status: e.status, message: `attempt 1: ${e.status}` });
      console.warn(`Model ${model} hit ${e.status}, retrying in 300ms…`);
    }

    await sleep(300);

    // Attempt 2 (same model, one quick retry for 503/429)
    try {
      return await callGemini(model, args);
    } catch (e) {
      if (e.name === "TimeoutError") {
        failures.push({ model, code: "TIMEOUT", status: 0, message: "timed out on retry" });
        console.warn(`Model ${model} timed out on retry, trying next in chain…`);
        continue;
      }
      if (e.code === "MODEL_NOT_FOUND") {
        failures.push({ model, code: "MODEL_NOT_FOUND", status: 404, message: "retired/not found" });
        continue;
      }
      if (e.code !== "RATE_LIMIT") throw e;
      failures.push({ model, code: "RATE_LIMIT", status: e.status, message: `attempt 2: ${e.status}` });
      const nextModel = chain[ci + 1];
      if (nextModel) console.warn(`Model ${model} still overloaded, falling back to ${nextModel}`);
      else console.warn(`Model ${model} still overloaded, no more models in chain`);
    }
  }

  // All models in the chain failed — surface the real reasons
  const summary = failures.map((f) => `${f.model} (${f.code}${f.status ? ` ${f.status}` : ""})`).join(", ");
  console.error(`All configured Gemini models are unavailable: ${summary}`);
  // Pick the most informative error code to propagate
  const hasRateLimit = failures.some((f) => f.code === "RATE_LIMIT");
  const code = hasRateLimit ? "RATE_LIMIT" : "PROVIDER";
  throw Object.assign(new Error(`all models failed: ${summary}`), { code, failures });
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

// Exported for testing
export { deadModels as _deadModels };
