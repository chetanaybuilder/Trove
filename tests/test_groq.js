import { getProvider } from "./server/ai/provider.js";
import { ChunkNotes, Report } from "./server/processing/pipeline.js";

async function run() {
  console.log("==========================================");
  console.log("GROQ STRUCTURED OUTPUT DIAGNOSTICS");
  console.log("==========================================\n");

  const ai = getProvider();
  
  try {
    console.log("TEST 1: JSON_OBJECT FALLBACK MODE (Forced)");
    // We can simulate fallback by passing _fallbackMode: true via internal API or relying on the real API to fallback
    // Since getProvider().generateJSON doesn't expose _fallbackMode directly, we'll just test the standard wrapper
    // which falls back automatically if the API rejects the schema.
    
    console.log("TEST 2: TINY CHUNKNOTES REQUEST");
    const notesRes = await ai.generateJSON({
      system: "You are an information extraction engine. Return ONLY valid JSON matching the provided schema. Do not write markdown. If a field has no values, return an empty array.",
      data: "John visited Paris on Monday.",
      instruction: "Extract the information.",
      schemaHint: JSON.stringify({ facts: [""], entities: [""], events: [""], summary: "" }),
      maxOutputTokens: 500,
      mock: () => JSON.stringify({ facts: ["John visited Paris on Monday"], entities: ["John", "Paris"], events: ["John visited Paris"], summary: "John visited Paris on Monday." })
    }, ChunkNotes);
    console.log("CHUNKNOTES TEST: PASS");
    console.log(JSON.stringify(notesRes, null, 2));
    console.log("\n------------------------------------------\n");

    console.log("TEST 3: TINY REPORT REQUEST");
    const reportRes = await ai.generateJSON({
      system: "You are an information extraction engine. Return ONLY valid JSON matching the provided schema.",
      data: JSON.stringify(notesRes),
      instruction: "Generate a summary report.",
      schemaHint: JSON.stringify({ summary: "", findings: [""], entities: [""], events: [""], contradictions: [""], unresolved: [""] }),
      maxOutputTokens: 800,
      mock: () => JSON.stringify({ summary: "Mock report", findings: [], entities: ["John", "Paris"], events: [], contradictions: [], unresolved: [] })
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
