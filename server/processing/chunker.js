// Normalization, token estimation and semantic chunking. No AI here.
export const estimateTokens = (s) => Math.ceil(s.length / 4);
export function normalize(raw) {
  return raw.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").replace(/[ \t]+$/gm, "").replace(/\n{4,}/g, "\n\n\n").trim();
}
export function stats(text) { return { chars: text.length, lines: text.split("\n").length, tokens: estimateTokens(text) }; }

// Split on the strongest boundary available: blank lines > lines > sentences.
function units(text) {
  const out = [];
  for (const b of text.split(/\n{2,}/)) {
    if (b.length <= 6000) { out.push(b); continue; }
    let cur = "";
    const push = (s) => { if (cur.length + s.length > 6000) { out.push(cur); cur = ""; } cur += s; };
    for (const line of b.split("\n")) {
      if (line.length > 6000) for (const s of line.split(/(?<=[.!?])\s+/)) push(s + " "); else push(line + "\n");
    }
    if (cur.trim()) out.push(cur);
  }
  return out.filter((u) => u.trim());
}

/** Greedy pack of semantic units into ~targetTokens chunks, with a small overlap for continuity. */
export function chunk(text, { targetTokens = 6000, overlapUnits = 1 } = {}) {
  const chunks = []; let cur = [], curTok = 0;
  for (const u of units(text)) {
    const t = estimateTokens(u);
    if (curTok + t > targetTokens && cur.length) {
      chunks.push(cur.join("\n\n"));
      cur = cur.slice(-overlapUnits); curTok = cur.reduce((a, x) => a + estimateTokens(x), 0);
    }
    cur.push(u); curTok += t;
  }
  if (cur.length) chunks.push(cur.join("\n\n"));
  return chunks;
}

const STOP = new Set("the and for are was were with that this from have has not but you your they their will would there what when which about into than then them been also".split(" "));
const words = (s) => (s.toLowerCase().match(/[a-z0-9']{3,}/g) ?? []).filter((w) => !STOP.has(w));
const KEY_CAUSAL = /\b(decid|action|must|risk|warning|agree|approv|conclusion|summary|todo|important|cost|budget|because|therefore|however|although|suddenly|revealed|discovered|realized|secret|hidden|truth|wait|stop|never|always)\b/i;
const DATE_TIME = /\b(18\d\d|19\d\d|20\d\d|21\d\d|22\d\d|23\d\d|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|yesterday|tomorrow|today|morning|evening|night|day|year|month)\b/i;

export function dedupeLines(text) {
  const seen = new Set();
  return text.split("\n").filter((l) => { const k = l.trim().toLowerCase().replace(/\s+/g, " "); if (k.length < 12) return true; if (seen.has(k)) return false; seen.add(k); return true; }).join("\n");
}
// Breaks giant blank-line-free blobs into ~1500-char blocks so they can be scored.
const blocks = (text) => text.split(/\n{2,}/).flatMap((p) => {
  if (p.length < 3000) return [p];
  const out = []; let cur = "";
  for (const l of p.split("\n")) { if (cur.length + l.length > 1500 && cur) { out.push(cur); cur = ""; } cur += l + "\n"; }
  if (cur.trim()) out.push(cur); return out;
});

/** Token saver: drop duplicate lines, then (only if still over budget) keep the most informative blocks from every part of the document, in original order. */
export async function compress(text, budgetTokens) {
  text = dedupeLines(text);
  if (estimateTokens(text) <= budgetTokens) return { text, reduced: false };
  const paras = blocks(text), N = paras.length, df = new Map();
  const ws = paras.map((p) => { const w = new Set(words(p)); w.forEach((x) => df.set(x, (df.get(x) ?? 0) + 1)); return w; });
  
  const items = paras.map((p, i) => { 
    let s = 0; 
    ws[i].forEach((x) => (s += Math.log(1 + N / df.get(x)))); 
    s /= Math.sqrt(ws[i].size + 1); 
    
    // Density scoring
    if (/\d/.test(p)) s += 1; // Numbers
    if (KEY_CAUSAL.test(p)) s += 3; // Causal/Revelatory
    if (DATE_TIME.test(p)) s += 2; // Temporal
    if (/"[^"]+"/.test(p)) s += 1; // Quotes
    if (/\?/.test(p)) s += 1; // Questions
    if (/[A-Z][a-z]+ [A-Z][a-z]+/.test(p)) s += 2; // Names/Entities (Capitalized word pairs)

    // Positional importance: beginning and end of document get massive boosts
    if (i < Math.max(5, N * 0.05)) s += 5; 
    if (i > N - Math.max(5, N * 0.05)) s += 5;
    
    return { i, s, t: estimateTokens(p) }; 
  });
  
  const total = items.reduce((a, x) => a + x.t, 0);
  
  // Estimate average block size to determine how many blocks we can afford
  const avgBlockTokens = items.length > 0 ? total / items.length : 375;
  const affordableBlocks = Math.max(1, Math.floor(budgetTokens / avgBlockTokens));
  
  // Divide document into 'affordableBlocks' segments to ensure even chronological sampling
  const segments = Math.min(affordableBlocks, 60); 
  const per = total / segments;
  const keep = new Set();
  
  let b = [], bt = 0;
  let globalUsed = 0;
  
  const flush = async () => { 
    if (globalUsed >= budgetTokens) { b = []; bt = 0; return; }
    
    // Proportional cap for this specific segment, plus whatever we have left globally
    const cap = Math.min(budgetTokens - globalUsed, budgetTokens * (bt / total)); 
    let localUsed = 0; 
    
    for (const x of b.sort((p, q) => q.s - p.s)) { 
      // Always allow at least ONE block if we haven't hit the global budget,
      // UNLESS the block itself pushes us way over the global budget and we've already used some.
      if (localUsed > 0 && localUsed + x.t > cap) continue; 
      if (globalUsed + x.t > budgetTokens) continue; // Hard global cap
      
      keep.add(x.i); 
      localUsed += x.t;
      globalUsed += x.t;
    } 
    b = []; 
    bt = 0; 
    await new Promise((r) => setImmediate(r)); 
  };
  
  for (const x of items) { b.push(x); bt += x.t; if (bt >= per) await flush(); }
  if (b.length) await flush();
  
  return { text: paras.filter((_, i) => keep.has(i)).join("\n\n"), reduced: true };
}
