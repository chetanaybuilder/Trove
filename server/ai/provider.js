// Provider abstraction: pipeline code only calls getProvider().generateJSON().
class Sem { constructor(n) { this.n = n; this.q = []; }
  async run(fn) { if (this.n <= 0) await new Promise((r) => this.q.push(r)); else this.n--; try { return await fn(); } finally { const nx = this.q.shift(); nx ? nx() : this.n++; } } }
const gate = new Sem(Number(process.env.AI_MAX_CONCURRENCY || 8)); // global cap on simultaneous provider calls
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn) {
  for (let a = 0; ; a++) {
    try { return await fn(); }
    catch (e) {
      if (a >= 6 || (e.code && !["RATE_LIMIT", "PROVIDER"].includes(e.code))) {
        throw Object.assign(e, { code: e.code || "PROVIDER" });
      }
      await sleep(2000 * 2 ** a + Math.random() * 1000);
    }
  }
}
const providers = {
  async gemini({ system, data, instruction, schemaHint }) {
    const model = process.env.AI_MODEL || "gemini-3.8-flash";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", signal: AbortSignal.timeout(90000),
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.AI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        // Instructions and untrusted document data travel in separate parts.
        contents: [{ role: "user", parts: [{ text: instruction + "\nReturn JSON shaped like: " + schemaHint }, { text: "<document_data>\n" + data + "\n</document_data>" }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    });
    if (res.status === 429) throw Object.assign(new Error("rate limit"), { code: "RATE_LIMIT" });
    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      console.error(`Gemini API Error: ${res.status} - ${errText}`);
      throw Object.assign(new Error("provider error"), { code: "PROVIDER" });
    }
    const j = await res.json();
    return j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  },
};

export function getProvider() {
  const impl = providers[process.env.AI_PROVIDER || "gemini"];
  if (!impl) throw new Error("Unknown AI_PROVIDER");
  if (!process.env.AI_API_KEY && !process.env.TROVE_MOCK) throw Object.assign(new Error("not configured"), { code: "CONFIG" });
  return {
    // Validates against a zod schema; retries once on malformed output.
    async generateJSON(args, schema) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const raw = process.env.TROVE_MOCK ? args.mock() : await gate.run(() => withRetry(() => impl(args)));
        try { return schema.parse(JSON.parse(String(raw).replace(/^```json|```$/g, "").trim())); } catch { /* retry */ }
      }
      throw Object.assign(new Error("malformed"), { code: "MALFORMED" });
    },
  };
}
