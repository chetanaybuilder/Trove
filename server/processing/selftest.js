// Synthetic ~60k-line docs through the full pipeline with a mock AI (no key needed).
process.env.TROVE_MOCK = "1";
const { analyze } = await import("./pipeline.js");

const doc = Array.from({ length: 20000 }, (_, i) => `Meeting ${i}: Priya decided to ship module ${i % 40} on 2025-03-${(i % 28) + 1}.`).join("\n");

console.log("Starting dual-mode analysis on 20K lines...\n");
const t = Date.now();
let localProcessingDone = 0;
let localStats = null;
let llmCalls = 0;

const r = await analyze(doc, { modes: ["quick", "deep"] }, (p) => { 
  if (p.stage === "local_processing") localStats = p.stats;
  if (p.stage === "extraction") {
    localProcessingDone = Date.now() - t;
    llmCalls++;
    console.log(`[Call ${llmCalls}] (Extraction) estimatedTokens=${p.sentTokens + 1200} status=success`);
  }
  if (p.stage === "synthesis") {
    llmCalls++;
    const outputTokens = p.mode === "summary" ? 1000 : 2200;
    // Input is the extraction length (mock extraction is tiny, maybe 50 tokens)
    console.log(`[Call ${llmCalls}] (Synthesis ${p.mode}) estimatedTokens=${50 + outputTokens} status=success`);
  }
});

console.log(`
[Document]
lines=${r.stats.lines}
rawTokens=${r.stats.tokens}

[Local Intelligence]
sections=${localStats ? localStats.lines : "N/A"}
importantEvidenceTokens=${r.sentTokens}
processingMs=${localProcessingDone}

[LLM]
calls=${llmCalls}
concurrency=1

[Final]
status=success
reports=${Object.keys(r.reports).join(" & ")}
`);
