import { getProvider } from "./server/ai/provider.js";
import { ChunkNotes, Report } from "./server/processing/pipeline.js";

async function run() {
  console.log("==========================================");
  console.log("GROQ STRUCTURED OUTPUT DIAGNOSTICS");
  console.log("==========================================\n");

  const ai = getProvider();
  
  try {
    console.log("TEST A: TINY CHUNKNOTES REQUEST");
    const notesRes = await ai.generateJSON({
      system: "You are an information extraction engine. Return ONLY valid JSON matching the provided schema. Do not write markdown. If a field has no values, return an empty array.",
      data: "Mira arrived in 2026. Arun discovered the blue door.",
      instruction: "Extract facts and entities.",
      schemaHint: JSON.stringify({ facts: [""], entities: [""], events: [""], contradictions: [""] }),
      maxOutputTokens: 500,
      mock: () => JSON.stringify({ facts: ["Mira arrived in 2026"], entities: ["Mira", "Arun"], events: ["Arun discovered blue door"], contradictions: [] })
    }, ChunkNotes);
    console.log("CHUNKNOTES TEST: PASS");
    console.log(JSON.stringify(notesRes, null, 2));
    console.log("\n------------------------------------------\n");

    console.log("TEST B: TINY REPORT REQUEST");
    const reportRes = await ai.generateJSON({
      system: "You are an information extraction engine. Return ONLY valid JSON matching the provided schema.",
      data: JSON.stringify(notesRes),
      instruction: "Generate a summary report.",
      schemaHint: JSON.stringify({ summary: "", findings: [""], entities: [""], events: [""], contradictions: [""], unresolved: [""] }),
      maxOutputTokens: 800,
      mock: () => JSON.stringify({ summary: "Mock report", findings: [], entities: ["Mira"], events: [], contradictions: [], unresolved: [] })
    }, Report);
    console.log("REPORT TEST: PASS");
    console.log(JSON.stringify(reportRes, null, 2));
    console.log("\n------------------------------------------\n");

    console.log("ALL PROVIDER TESTS COMPLETED SUCCESSFULLY.");
  } catch (err) {
    console.error("\n[!] PROVIDER TEST FAILED");
    console.error("Code:", err.code);
    console.error("Message:", err.message);
    if (err.details) console.error("Details:", err.details);
    process.exit(1);
  }
}

run();
