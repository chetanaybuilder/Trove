// Provider abstraction: pipeline code only calls getProvider().generateJSON().
// Supports OpenRouter model chain fallback on 503/429/etc and per-call timeouts.

class Sem { constructor(n) { this.n = n; this.q = []; }
  async run(fn) { if (this.n <= 0) await new Promise((r) => this.q.push(r)); else this.n--; try { return await fn(); } finally { const nx = this.q.shift(); nx ? nx() : this.n++; } } }
const gate = new Sem(Number(process.env.AI_MAX_CONCURRENCY || 5)); // global cap on simultaneous provider calls
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
let downUntil = 0;

function recordFailure() {
  failures++;
  if (failures >= 3) {
    downUntil = Date.now() + 60000;
    failures = 0;
  }
}

const FALLBACK_MODELS = [
  process.env.GROQ_MODEL || process.env.AI_MODEL,
  "deepseek-r1-distill-llama-70b",
  "llama-3.3-70b-specdec",
  "llama-3.3-70b-versatile",
  "llama-3.2-90b-vision-preview",
  "llama-3.1-8b-instant",
  "gemma2-9b-it",
  "mixtral-8x7b-32768",
  "llama3-8b-8192",
  "llama3-70b-8192"
];

/** Call Groq API. Handles retries and circuit breaker. */
async function callGroq({ system, data, instruction, schemaHint }, attempt = 0, modelIndex = 0) {
  if (Date.now() < downUntil) {
    throw Object.assign(new Error("circuit breaker open"), { code: "PROVIDER" });
  }

  // Deduplicate the array so we don't try the same configured model twice if it matches a fallback
  const uniqueModels = Array.from(new Set(FALLBACK_MODELS)).filter(Boolean);
  const model = uniqueModels[modelIndex];
  
  if (!model) {
    throw Object.assign(new Error("model not found"), { code: "MODEL_ERROR" });
  }
  
  // Base 15s + ~1s per 1000 tokens, capped at ~30s
  const estTokens = (system.length + data.length + instruction.length) / 4;
  const dynamicTimeout = Math.round(Math.min(30000, 15000 + (estTokens / 1000) * 1000));
  const timeoutMs = process.env.AI_CALL_TIMEOUT_MS ? Number(process.env.AI_CALL_TIMEOUT_MS) : dynamicTimeout;
  
  let res;
  const startTime = Date.now();
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", 
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${process.env.AI_API_KEY}` 
      },
      body: JSON.stringify({
        model: model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: instruction + "\nReturn JSON shaped like: " + schemaHint + "\n\n<document_data>\n" + data + "\n</document_data>" }
        ],
        temperature: 0.2
      }),
    });
  } catch (e) {
    const elapsed = Date.now() - startTime;
    if (e.name === "TimeoutError") {
      console.warn(`Groq API call timed out after ${elapsed}ms (configured limit: ${timeoutMs}ms). Model: ${model}, Size: ~${estTokens} tokens.`);
      if (attempt === 0) {
        return callGroq({ system, data, instruction, schemaHint }, attempt + 1, modelIndex);
      }
      recordFailure();
      throw Object.assign(new Error("timed out"), { code: "TIMEOUT" });
    }
    console.error(`Groq network error after ${elapsed}ms:`, e.message, `Model: ${model}, Size: ~${estTokens} tokens.`);
    recordFailure();
    throw Object.assign(new Error("provider error"), { code: "PROVIDER" });
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      // Auth failed, do not retry
      throw Object.assign(new Error("auth failed"), { code: "AUTH" });
    }
    
    // Read the error text now because we need it for 400 and 429 logic
    const errText = await res.text().catch(() => "unknown");
    
    // If it's a 404 (model not found) OR a 400 that says decommissioned, we trigger the array fallback
    if (res.status === 404 || (res.status === 400 && (errText.includes("decommissioned") || errText.includes("model_not_found")))) {
      if (modelIndex < uniqueModels.length - 1) {
        console.warn(`Groq model '${model}' not found/decommissioned (${res.status}). Falling back to '${uniqueModels[modelIndex + 1]}'.`);
        return callGroq({ system, data, instruction, schemaHint }, attempt, modelIndex + 1);
      }
      throw Object.assign(new Error("model not found"), { code: "MODEL_ERROR" });
    }
    
    if (res.status === 429 || res.status === 503) {
      if (attempt === 0) {
        const retryAfter = res.headers.get("retry-after");
        const delay = retryAfter ? (isNaN(Number(retryAfter)) ? 500 : Number(retryAfter) * 1000) : 500;
        await sleep(delay);
        return callGroq({ system, data, instruction, schemaHint }, attempt + 1, modelIndex);
      }
      console.warn(`Groq returned ${res.status}: ${errText.slice(0, 200)}`);
      recordFailure();
      throw Object.assign(new Error(`rate/overloaded ${res.status}`), { code: "OVERLOAD", status: res.status });
    }
    
    console.error(`Groq API Error: ${res.status} - ${errText}`);
    recordFailure();
    throw Object.assign(new Error("provider error"), { code: "PROVIDER", status: res.status });
  }
  
  failures = 0; // reset on success
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? "";
}

export function getProvider() {
  if (!process.env.AI_API_KEY && !process.env.TROVE_MOCK) throw Object.assign(new Error("not configured"), { code: "CONFIG" });
  
  return {
    // Validates against a zod schema; retries once on malformed output.
    async generateJSON(args, schema) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const raw = process.env.TROVE_MOCK ? args.mock() : await gate.run(() => callGroq(args));
        try { 
          return schema.parse(JSON.parse(String(raw).replace(/^```json|```$/g, "").trim())); 
        } catch (e) { 
          if (attempt === 1) console.error("JSON parse/validation error on attempt 2", e);
        }
      }
      throw Object.assign(new Error("malformed"), { code: "MALFORMED" });
    },
  };
}
