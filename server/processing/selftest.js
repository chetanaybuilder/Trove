// Synthetic ~60k-line docs through the full pipeline with a mock AI (no key needed).
process.env.TROVE_MOCK = "1";
const { analyze } = await import("./pipeline.js");

const doc = Array.from({ length: 20000 }, (_, i) => `Meeting ${i}: Priya decided to ship module ${i % 40} on 2025-03-${(i % 28) + 1}.`).join("\n");

console.log("Starting dual-mode analysis on 20K lines...");
const t = Date.now();
let chunks = 0;
let mergeGroups = 0;
let levels = 0;

const r = await analyze(doc, { modes: ["quick", "deep"] }, (p) => { 
  if (p.stage === "chunked") chunks = p.total; 
  if (p.stage === "merge") { levels = p.level; mergeGroups += p.groups; }
});

console.log(`\n=== DUAL MODE TEST RESULTS ===`);
console.log(`Input Lines: ${r.stats.lines}`);
console.log(`Raw Input Tokens: ≈${r.stats.tokens}`);
console.log(`Processed Tokens (after compression): ≈${r.sentTokens}`);
console.log(`Chunks created: ${chunks}`);
console.log(`Hierarchical Merge Levels: ${levels}`);
console.log(`Total Merge Group Calls: ${mergeGroups}`);
console.log(`Total Processing Time: ${Date.now() - t}ms`);
console.log(`Reports Generated: ${Object.keys(r.reports).join(" & ")}`);
console.log(`Note: Both reports shared the SAME extraction and reduction pipeline.`);
