// Provider abstraction: pipeline code only calls getProvider().generateJSON().
// Supports OpenRouter model chain fallback on 503/429/etc and per-call timeouts.

class Sem { constructor(n) { this.n = n; this.q = []; }
  async run(fn) { if (this.n <= 0) await new Promise((r) => this.q.push(r)); else this.n--; try { return await fn(); } finally { const nx = this.q.shift(); nx ? nx() : this.n++; } } }
const gate = new Sem(Number(process.env.AI_MAX_CONCURRENCY || 1)); // strict sequential bottleneck
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

const SAFE_REQUEST_TOKEN_BUDGET = 6000;

function validateSchema(schemaObj) {
  const check = (node) => {
    if (node.type === "object") {
      if (node.required) {
        for (const req of node.required) {
          if (!node.properties || !node.properties[req]) {
            throw new Error(`SCHEMA_CONFIGURATION_ERROR: required field "${req}" is missing from properties`);
          }
        }
      }
      if (node.properties) {
        for (const k in node.properties) check(node.properties[k]);
      }
    } else if (node.type === "array") {
      if (!node.items || typeof node.items !== "object") {
        throw new Error("SCHEMA_CONFIGURATION_ERROR: array items missing or invalid");
      }
      check(node.items);
    }
  };
  check(schemaObj.schema);
}

/** Canonical Groq Request Builder */
async function buildAndSendGroqRequest(model, system, data, instruction, maxTokens, jsonSchema, attempt, useStructuredOutput = true) {
  const payload = {
    model: model,
    max_tokens: maxTokens, // FIXED: Groq uses max_tokens, not max_completion_tokens
    temperature: 0.2,
    messages: [
      { role: "system", content: system + "\n\nCRITICAL OUTPUT REQUIREMENTS:\n1. OUTPUT ONLY JSON.\n2. Your response MUST strictly match the requested JSON schema.\n3. Every required property MUST be present. For an empty collection, return [] instead of omitting the property." },
      { role: "user", content: instruction + "\n\n<document_data>\n" + data + "\n</document_data>" }
    ]
  };

  if (useStructuredOutput) {
    payload.response_format = { type: "json_schema", json_schema: jsonSchema };
  } else {
    payload.response_format = { type: "json_object" };
    payload.messages[0].content += `\n\nREQUIRED JSON SCHEMA:\n${JSON.stringify(jsonSchema.schema)}`;
  }

  const timeoutMs = process.env.AI_CALL_TIMEOUT_MS ? Number(process.env.AI_CALL_TIMEOUT_MS) : 45000;

  console.log(`[Groq] request validation\nmodel=${model}\noutputBudget=${maxTokens}\nschema=${jsonSchema.name}`);
  
  const startTime = Date.now();
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify(payload),
    });
    
    return { res, elapsed: Date.now() - startTime, payload };
  } catch (e) {
    const elapsed = Date.now() - startTime;
    if (e.name === "TimeoutError") throw Object.assign(new Error("provider timeout"), { code: "NETWORK_ERROR", elapsed });
    throw Object.assign(new Error("network error: " + e.message), { code: "NETWORK_ERROR", elapsed });
  }
}

/** Call Groq API. Handles strict validation, error classification, and safe fallback. */
async function callGroq({ system, data, instruction, schemaHint, maxOutputTokens = 1500, _fallbackMode = false }, attempt = 0) {
  if (Date.now() < downUntil) {
    throw Object.assign(new Error("circuit breaker open"), { code: "PROVIDER_REJECTED_REQUEST" });
  }

  const model = process.env.GROQ_MODEL || process.env.AI_MODEL || "openai/gpt-oss-120b";
  
  // HARD ADMISSION CONTROL
  const estimatedInputTokens = Math.ceil((system.length + data.length + instruction.length) / 4);
  const estimatedTotal = estimatedInputTokens + maxOutputTokens;
  
  if (estimatedTotal > SAFE_REQUEST_TOKEN_BUDGET) {
    throw Object.assign(new Error(`Token budget exceeded: ${estimatedTotal} > ${SAFE_REQUEST_TOKEN_BUDGET}`), { code: "REQUEST_TOO_LARGE" });
  }
  
  const schemaName = schemaHint.includes("topics") ? "Report" : "ChunkNotes";
  const jsonSchema = createStrictSchema(schemaHint, schemaName);
  
  try {
    validateSchema(jsonSchema);
  } catch (e) {
    console.error(`[Groq] SCHEMA INVALID\nreason=${e.message}`);
    throw Object.assign(e, { code: "SCHEMA_INVALID" });
  }
  
  let result;
  try {
    result = await buildAndSendGroqRequest(model, system, data, instruction, maxOutputTokens, jsonSchema, attempt, !_fallbackMode);
  } catch (err) {
    if (err.code === "NETWORK_ERROR" && attempt < 2) {
      console.warn(`Groq network error, retrying (${attempt + 1})...`);
      return callGroq({ system, data, instruction, schemaHint, maxOutputTokens, _fallbackMode }, attempt + 1);
    }
    recordFailure();
    throw err;
  }

  const { res, elapsed, payload } = result;

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    console.error(`[Groq] REQUEST FAILED\nstatus=${res.status}\nmessage=${errText.slice(0, 300)}`);
    
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error("auth failed"), { code: "AUTH_ERROR" });
    if (res.status === 404) throw Object.assign(new Error("model missing"), { code: "MODEL_ERROR" });
    
    // 413: Request too large. Never retry identical payload.
    if (res.status === 413) throw Object.assign(new Error("payload too large"), { code: "REQUEST_TOO_LARGE" });
    
    if (res.status === 400) {
      let errObj = {};
      try { errObj = JSON.parse(errText); } catch(e) {}
      
      const isJsonValidation = errObj?.error?.code === "json_validate_failed" || errText.includes("json_validate_failed");
      
      if (isJsonValidation) {
        const failedGen = errObj?.error?.failed_generation || "";
        console.error(`[Groq] JSON VALIDATION FAILURE\nschema=${schemaName}\nfailedGenerationLength=${failedGen.length}\nfailedGenerationPreview="${failedGen.slice(0, 300)}"\nproviderMessage=${errObj?.error?.message || errText}`);
        
        if (!_fallbackMode) {
          console.warn(`[Groq] Native validation failed. Falling back to json_object...`);
          return callGroq({ system, data, instruction, schemaHint, maxOutputTokens, _fallbackMode: true }, 0);
        }
        throw Object.assign(new Error("provider rejected model JSON"), { code: "PROVIDER_JSON_VALIDATION_ERROR", details: errText });
      }

      // If the provider rejects structured outputs configuration natively, fallback to json_object safely.
      if (!_fallbackMode && (errText.includes("response_format") || errText.includes("json_schema") || errText.includes("schema") || errText.includes("max_tokens") || errText.includes("max_completion_tokens"))) {
        console.warn(`[Groq] Provider rejected strict payload. Falling back to json_object...`);
        return callGroq({ system, data, instruction, schemaHint, maxOutputTokens, _fallbackMode: true }, 0);
      }
      
      // Do NOT retry malformed requests unchanged.
      throw Object.assign(new Error("malformed request: " + errText), { code: "MALFORMED_REQUEST", details: errText });
    }
    
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 2) {
        const retryAfter = res.headers.get("retry-after");
        const delay = retryAfter ? (isNaN(Number(retryAfter)) ? 1000 : Number(retryAfter) * 1000) : 1000 * Math.pow(2, attempt);
        await sleep(delay);
        return callGroq({ system, data, instruction, schemaHint, maxOutputTokens, _fallbackMode }, attempt + 1);
      }
      recordFailure();
      if (res.status === 429) throw Object.assign(new Error(`rate limited`), { code: "RATE_LIMITED", status: res.status });
      throw Object.assign(new Error(`provider error ${res.status}`), { code: "PROVIDER_REJECTED_REQUEST", status: res.status });
    }
    
    recordFailure();
    throw Object.assign(new Error("unknown provider error"), { code: "UNKNOWN_PROVIDER_ERROR", status: res.status });
  }
  
  failures = 0;
  const j = await res.json();
  
  if (j.choices?.[0]?.finish_reason === "length") {
    if (attempt === 0) {
      return callGroq({ system, data, instruction, schemaHint, maxOutputTokens, _fallbackMode }, 1);
    }
  }

  return j.choices?.[0]?.message?.content ?? "";
}

export function getProvider() {
  if (!process.env.AI_API_KEY && !process.env.TROVE_MOCK) throw Object.assign(new Error("not configured"), { code: "CONFIG" });
  
  return {
    async generateJSON(args, schema) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const raw = process.env.TROVE_MOCK ? args.mock() : await gate.run(() => callGroq(args));
        try { 
          return schema.parse(JSON.parse(String(raw).replace(/^```json|```$/g, "").trim())); 
        } catch (e) { 
          if (attempt === 1) {
            console.error(`[Groq] JSON PARSE FAILED\npreview=${String(raw).slice(0, 300)}`);
          }
        }
      }
      throw Object.assign(new Error("malformed JSON output"), { code: "MALFORMED_JSON_OUTPUT" });
    },
  };
}
