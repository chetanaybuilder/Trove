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

function createStrictSchema(hintStr, name) {
  const obj = JSON.parse(hintStr);
  
  function infer(val) {
    if (typeof val === "string") return { type: "string" };
    if (typeof val === "number") return { type: "number" };
    if (typeof val === "boolean") return { type: "boolean" };
    if (Array.isArray(val)) {
      if (val.length === 0) return { type: "array", items: { type: "string" } };
      return { type: "array", items: infer(val[0]) };
    }
    if (typeof val === "object" && val !== null) {
      const props = {};
      for (const k in val) props[k] = infer(val[k]);
      return { type: "object", properties: props, required: Object.keys(val), additionalProperties: false };
    }
    return { type: "string" };
  }

  const properties = {};
  for (const k in obj) properties[k] = infer(obj[k]);

  return {
    name: name,
    strict: true,
    schema: {
      type: "object",
      properties: properties,
      required: Object.keys(obj),
      additionalProperties: false
    }
  };
}

/** Call Groq API. Handles retries and circuit breaker. */
async function callGroq({ system, data, instruction, schemaHint }, attempt = 0) {
  if (Date.now() < downUntil) {
    throw Object.assign(new Error("circuit breaker open"), { code: "PROVIDER" });
  }

  const model = process.env.GROQ_MODEL || process.env.AI_MODEL || "openai/gpt-oss-120b";
  
  const estTokens = (system.length + data.length + instruction.length) / 4;
  const dynamicTimeout = Math.round(Math.min(60000, 15000 + (estTokens / 1000) * 1000));
  const timeoutMs = process.env.AI_CALL_TIMEOUT_MS ? Number(process.env.AI_CALL_TIMEOUT_MS) : dynamicTimeout;
  
  const schemaName = schemaHint.includes("topics") ? "Report" : "ChunkNotes";
  const jsonSchema = createStrictSchema(schemaHint, schemaName);
  
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
        response_format: { type: "json_schema", json_schema: jsonSchema },
        max_completion_tokens: 12192,
        temperature: 0.2,
        messages: [
          { role: "system", content: system + "\n\nCRITICAL OUTPUT REQUIREMENTS:\n1. OUTPUT ONLY JSON. Do not return markdown, ```json, or commentary.\n2. Your response MUST be a JSON object matching the provided schema.\n3. Every required property MUST be present. Never omit a property because there is no information.\n4. For an empty collection, return [] instead of omitting the property.\n5. Do not invent facts to fill an empty section." },
          { role: "user", content: instruction + "\n\n<document_data>\n" + data + "\n</document_data>" }
        ]
      }),
    });
  } catch (e) {
    const elapsed = Date.now() - startTime;
    if (e.name === "TimeoutError") {
      console.warn(`Groq API call timed out after ${elapsed}ms (limit: ${timeoutMs}ms). Model: ${model}.`);
      if (attempt < 2) return callGroq({ system, data, instruction, schemaHint }, attempt + 1);
      recordFailure();
      throw Object.assign(new Error("timed out"), { code: "TIMEOUT" });
    }
    console.error(`Groq network error after ${elapsed}ms:`, e.message);
    recordFailure();
    throw Object.assign(new Error("provider error"), { code: "PROVIDER" });
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error("auth failed"), { code: "AUTH" });
    const errText = await res.text().catch(() => "unknown");
    if (res.status === 404) throw Object.assign(new Error("model/configuration error"), { code: "MODEL_ERROR" });
    
    if (res.status === 400) {
      if (errText.includes("json_validate_failed") || errText.includes("max completion tokens reached") || errText.includes("failed_generation")) {
        console.warn(`[Diagnostics] model=${model} max_completion_tokens=12192 error=json_validate_failed/failed_generation.`);
        // Only perform ONE controlled recovery attempt for schema validation errors
        if (attempt === 0) {
          console.warn(`Recovering JSON generation (attempt 1)...`);
          return callGroq({ system, data, instruction, schemaHint }, 1);
        }
      }
      console.error(`Groq 400 Error (request/schema): ${errText.slice(0, 300)}`);
      throw Object.assign(new Error("request/schema error"), { code: "MALFORMED" });
    }
    
    // Genuinely transient errors (429, 500, 502, 503, 504) get retried with bounded backoff
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 2) {
        const retryAfter = res.headers.get("retry-after");
        const delay = retryAfter ? (isNaN(Number(retryAfter)) ? 1000 : Number(retryAfter) * 1000) : 1000 * Math.pow(2, attempt);
        await sleep(delay);
        return callGroq({ system, data, instruction, schemaHint }, attempt + 1);
      }
      console.warn(`Groq returned ${res.status}: ${errText.slice(0, 200)}`);
      recordFailure();
      if (res.status === 429) throw Object.assign(new Error(`rate limit ${res.status}`), { code: "RATE_LIMIT", status: res.status });
      throw Object.assign(new Error(`provider error ${res.status}`), { code: "PROVIDER", status: res.status });
    }
    
    console.error(`Groq API Error: ${res.status} - ${errText}`);
    recordFailure();
    throw Object.assign(new Error("provider error"), { code: "PROVIDER", status: res.status });
  }
  
  failures = 0; // reset on success
  const j = await res.json();
  
  if (j.choices?.[0]?.finish_reason === "length") {
    if (attempt === 0) {
      console.warn(`[Diagnostics] model=${model} finish_reason=length max_completion_tokens=12192. Retrying...`);
      return callGroq({ system, data, instruction, schemaHint }, 1);
    }
  }

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
