process.env.TROVE_MOCK = "1";
const { analyze } = await import("./pipeline.js");

const SIZES = [500, 5000, 20000, 50000, 100000];

async function runTests() {
  console.log("==========================================");
  console.log(" TROVE ARCHITECTURE TEST SUITE");
  console.log("==========================================\n");

  for (const size of SIZES) {
    const doc = Array.from({ length: size }, (_, i) => `Meeting ${i}: Priya decided to ship module ${i % 40} on 2025-03-${(i % 28) + 1}. The cost will be $50,000. Is this a contradiction?`).join("\n");
    
    console.log(`[TEST] Document Size: ${size.toLocaleString()} lines`);
    const t0 = Date.now();
    let firstResult = 0;
    
    const r = await analyze(doc, { modes: ["deep"] }, (p) => {
      if (p.stage === "local_processing" && firstResult === 0) firstResult = Date.now() - t0;
    });
    
    const totalTime = Date.now() - t0;
    
    console.log(`  - Local Time: ${r.localProcessingMs} ms`);
    console.log(`  - Total Time: ${totalTime} ms`);
    console.log(`  - Time to First Progress: ${firstResult} ms`);
    console.log(`  - Local Sections Found: ${r.stats.sections}`);
    console.log(`  - LLM Input Tokens Sent: ${r.sentTokens}`);
    console.log(`  - Estimated LLM Request Cost: ${r.sentTokens + 3000}`);
    console.log(`  - Result: success\n`);
  }
}

runTests();
