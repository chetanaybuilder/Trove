import { getProvider } from "./server/ai/provider.js";
import { ChunkNotes } from "./server/processing/pipeline.js";

async function run() {
  console.log("Starting test:groq...");
  try {
    const ai = getProvider();
    const NOTES_HINT = JSON.stringify({ entities: [{ name: "", type: "" }], events: [{ date: "", description: "", importance: 5 }], facts: [""], contradictions: [""] });
    
    const res = await ai.generateJSON({
      system: "You are a test agent.",
      data: "Mira arrived in 2026. The next day, Arun discovered the blue door.",
      instruction: "Extract facts and entities.",
      schemaHint: NOTES_HINT,
      maxOutputTokens: 500
    }, ChunkNotes);
    
    console.log("PROVIDER OK!");
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("PROVIDER FAILED");
    console.error("Code:", err.code);
    console.error("Message:", err.message);
    if (err.status) console.error("Status:", err.status);
    console.error(err.stack);
  }
}

run();
