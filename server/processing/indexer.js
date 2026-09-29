import crypto from "crypto";

export function estimateTokens(s) {
  return Math.ceil(s.length / 4);
}

export function normalize(raw) {
  return raw.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").replace(/[ \t]+$/gm, "").trim();
}

function hashString(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

const DATE_TIME = /\b(?:18\d\d|19\d\d|20\d\d|21\d\d|22\d\d|23\d\d|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|yesterday|tomorrow|today)\b/gi;
const NAMES = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
const DECISIONS = /\b(?:decid|approv|agreed|conclud|reject|resolv|voted|chosen|finalized|authorized)[a-z]*\b/gi;
const ACTIONS = /\b(?:implement|execut|start|stop|create|build|destroy|mov|attack|defend|buy|sell)[a-z]*\b/gi;
const CONTRADICTION_CANDIDATES = /\b(?:however|but|on the other hand|conversely|in contrast|conflicts?|disagrees?|inconsistent|impossible)\b/gi;

export function buildDocumentIntelligenceMap(rawText) {
  const text = normalize(rawText);
  const docHash = hashString(text);
  const lines = text.split('\n');
  const sections = [];
  
  let currentSection = { startLine: 1, endLine: 1, content: [], hash: "" };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    currentSection.content.push(line);
    currentSection.endLine = i + 1;
    
    if (currentSection.content.join(" ").length > 800) {
      currentSection.hash = hashString(currentSection.content.join("\n"));
      sections.push(currentSection);
      currentSection = { startLine: i + 2, endLine: i + 2, content: [], hash: "" };
    }
  }
  if (currentSection.content.length > 0) {
    currentSection.hash = hashString(currentSection.content.join("\n"));
    sections.push(currentSection);
  }

  const seenHashes = new Map();
  const dedupedSections = [];
  for (const sec of sections) {
    if (seenHashes.has(sec.hash)) {
      seenHashes.get(sec.hash).occurrences++;
      continue;
    }
    sec.occurrences = 1;
    seenHashes.set(sec.hash, sec);
    dedupedSections.push(sec);
  }

  const entities = new Set();
  const events = [];
  const decisions = [];
  const actions = [];
  const unresolved = [];
  const contradictions = [];
  const timeline = [];
  
  for (const sec of dedupedSections) {
    const content = sec.content.join(" ");
    let importance = 1;
    
    const foundNames = content.match(NAMES) || [];
    for (const n of foundNames) { entities.add(n); importance += 1; }
    
    const foundDates = content.match(DATE_TIME) || [];
    if (foundDates.length > 0) {
      timeline.push({ sourceStart: sec.startLine, sourceEnd: sec.endLine, dates: [...new Set(foundDates.map(d=>d.toLowerCase()))] });
      importance += 2;
    }
    
    if (DECISIONS.test(content)) {
      decisions.push({ sourceStart: sec.startLine, sourceEnd: sec.endLine, text: content });
      importance += 3;
    }
    
    if (ACTIONS.test(content)) {
      actions.push({ sourceStart: sec.startLine, sourceEnd: sec.endLine, text: content });
      importance += 1;
    }
    
    if (/\?/.test(content)) {
      unresolved.push({ sourceStart: sec.startLine, sourceEnd: sec.endLine, text: content });
      importance += 2;
    }
    
    if (CONTRADICTION_CANDIDATES.test(content)) {
      contradictions.push({ sourceStart: sec.startLine, sourceEnd: sec.endLine, text: content });
      importance += 3;
    }
    
    // Positional importance: boost beginning and end
    if (sec.startLine < Math.max(200, lines.length * 0.05)) importance += 5;
    if (sec.endLine > lines.length - Math.max(200, lines.length * 0.05)) importance += 5;

    events.push({
      sourceStart: sec.startLine, 
      sourceEnd: sec.endLine,
      importance,
      occurrences: sec.occurrences,
      text: content
    });
  }

  return {
    documentHash: docHash,
    statistics: { lines: lines.length, chars: text.length, tokens: estimateTokens(text), sections: sections.length },
    entities: Array.from(entities),
    events, timeline, decisions, actions, unresolved, contradictions
  };
}

export function buildCompactEvidenceMap(dim, maxTokens = 3000) {
  const sortedEvents = [...dim.events].sort((a, b) => b.importance - a.importance);
  
  let evidenceTokens = 0;
  const topEvents = [];
  
  for (const e of sortedEvents) {
    const t = estimateTokens(e.text);
    if (evidenceTokens + t > maxTokens * 0.7) break; 
    topEvents.push({ lines: `${e.sourceStart}-${e.sourceEnd}`, score: e.importance, text: e.text });
    evidenceTokens += t;
  }

  return JSON.stringify({
    stats: dim.statistics,
    entities: dim.entities.slice(0, 100),
    timeline: dim.timeline.slice(0, 30),
    topEvents,
    decisions: dim.decisions.slice(0, 20).map(d => ({ lines: `${d.sourceStart}-${d.sourceEnd}`, text: d.text.slice(0, 150) })),
    unresolved: dim.unresolved.slice(0, 20).map(u => ({ lines: `${u.sourceStart}-${u.sourceEnd}`, text: u.text.slice(0, 150) })),
    contradictions: dim.contradictions.slice(0, 20).map(c => ({ lines: `${c.sourceStart}-${c.sourceEnd}`, text: c.text.slice(0, 150) }))
  });
}
