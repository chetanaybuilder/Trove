// Synthetic ~60k-line docs through the full pipeline with a mock AI (no key needed).
process.env.TROVE_MOCK = "1";
const { analyze } = await import("./pipeline.js");
const doc = Array.from({ length: 5000 }, (_, i) => Array.from({ length: 11 }, (_, j) => `Meeting ${i} line ${j}: Priya decided to ship module ${i % 40} on 2025-03-${(i % 28) + 1}.`).join("\n")).join("\n\n");
for (const [name, text, mode] of [["quick", doc, "quick"], ["deep", doc, "deep"], ["quick, no blank lines", doc.replace(/\n\n/g, "\n"), "quick"]]) {
  const t = Date.now(); let chunks = 0;
  const r = await analyze(text, { mode }, (p) => { if (p.stage === "chunked") chunks = p.total; });
  console.log(`${name}: ${r.stats.lines} lines, input≈${r.stats.tokens} tokens -> sent≈${r.sentTokens} tokens in ${chunks} chunks (${Date.now() - t}ms)`);
}
