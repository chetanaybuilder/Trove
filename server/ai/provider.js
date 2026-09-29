// Provider abstraction: pipeline code only calls getProvider().generateJSON().
// Supports OpenRouter model chain fallback on 503/429/etc and per-call timeouts.

class Sem { constructor(n) { this.n = n; this.q = []; }
  async run(fn) { if (this.n <= 0) await new Promise((r) => this.q.push(r)); else this.n--; try { return await fn(); } finally { const nx = this.q.shift(); nx ? nx() : this.n++; } } }
const gate = new Sem(Number(process.env.AI_MAX_CONCURRENCY || 2)); // global cap on simultaneous provider calls
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PER_CALL_TIMEOUT = Number(process.env.AI_CALL_TIMEOUT_MS || 8000);

/** Parse OPENROUTER_MODELS env var to get priority model array */
function getModels() {
  if (process.env.OPENROUTER_MODELS) {
    return process.env.OPENROUTER_MODELS.split(",").map((m) => m.trim()).filter(Boolean);
  }
  return ["openrouter/free"]; // default
}

/** Call OpenRouter API. Handles built-in fallbacks via models array. */
async function callOpenRouter({ system, data, instruction, schemaHint }) {
  const models = getModels();
  
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", 
    signal: AbortSignal.timeout(PER_CALL_TIMEOUT),
    headers: { 
      "Content-Type": "application/json", 
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}` 
    },
    body: JSON.stringify({
      models: models,
      messages: [
        { role: "system", content: system },
        { role: "user", content: instruction + "\nReturn JSON shaped like: " + schemaHint + "\n\n<document_data>\n" + data + "\n</document_data>" }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    }),
  });

  if (!res.ok) {
    if (res.status === 429 || res.status === 503) {
      const errText = await res.text().catch(() => "unknown");
      console.warn(`OpenRouter returned ${res.status}: ${errText.slice(0, 200)}`);
      throw Object.assign(new Error(`rate/overloaded ${res.status}`), { code: "RATE_LIMIT", status: res.status });
    }
    const errText = await res.text().catch(() => "unknown");
    console.error(`OpenRouter API Error: ${res.status} - ${errText}`);
    throw Object.assign(new Error("provider error"), { code: "PROVIDER", status: res.status });
  }
  
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? "";
}

export function getProvider() {
  if (!process.env.OPENROUTER_API_KEY && !process.env.TROVE_MOCK) throw Object.assign(new Error("not configured"), { code: "CONFIG" });
  
  return {
    // Validates against a zod schema; retries once on malformed output.
    async generateJSON(args, schema) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const raw = process.env.TROVE_MOCK ? args.mock() : await gate.run(() => callOpenRouter(args));
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
