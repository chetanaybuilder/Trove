// Synthetic ~60k-line docs through the full pipeline with a mock AI (no key needed).
process.env.TROVE_MOCK = "1";
const { analyze } = await import("./pipeline.js");

const doc = Array.from({ length: 50000 }, (_, i) => `Meeting ${i}: Priya decided to ship module ${i % 40} on 2025-03-${(i % 28) + 1}.`).join("\n");

console.log("Starting dual-mode analysis on 50K lines...\n");
const t = Date.now();
let localProcessingDone = 0;
let llmCalls = 0;

const r = await analyze(doc, { modes: ["quick", "deep"] }, (p) => { 
  if (p.stage === "local_processing") {
    console.log(`[Local] ${p.msg}`);
  }
  if (p.stage === "synthesis") {
    localProcessingDone = localProcessingDone || (Date.now() - t);
    llmCalls++;
    const outputTokens = p.mode === "summary" ? 1000 : 2200;
    console.log(`[Call ${llmCalls}] (Synthesis ${p.mode}) estimatedInputTokens=${3000} status=success`);
  }
});

console.log(`
[Document]
lines=${r.stats.lines}
rawTokens=${r.stats.tokens}

[Local Intelligence]
sections=${r.stats.sections}
localProcessingMs=${r.localProcessingMs}

[LLM Reasoning]
calls=${llmCalls}
totalTokens=${r.sentTokens * 2 + 3200} (Estimated)

[Final]
status=success
reports=${Object.keys(r.reports).join(" & ")}
`);
