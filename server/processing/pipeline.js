import { z } from "zod";
import { getProvider } from "../ai/provider.js";
import { compress, estimateTokens, normalize, stats } from "./chunker.js";

const S = z.array(z.string()).default([]);

// Extremely compact representation. No giant text blocks.
export const ChunkNotes = z.object({
  entities: z.array(z.object({ name: z.string(), type: z.string() })).default([]),
  events: z.array(z.object({ date: z.string(), description: z.string(), importance: z.number().default(5) })).default([]),
  facts: z.array(z.string()).default([]),
  contradictions: z.array(z.string()).default([])
});

export const Report = z.object({
  document_type: z.string().default("unknown"),
  title: z.string(), overview: z.string(), key_points: S,
  events: z.array(z.object({ name: z.string(), detail: z.string() })).default([]),
  topics: z.array(z.object({ name: z.string(), detail: z.string() })).default([]),
  people: S, relationships: S, dates: S, decisions: S, actions: S, questions: S,
  unresolved: S, contradictions: S, evidence: S, themes: S,
  conclusion: z.string(), confidence: z.string().default(""),
});

const SummaryReport = z.object({
  document_type: z.string().default("unknown"), title: z.string(), overview: z.string(), key_points: S,
  events: z.array(z.object({ name: z.string(), detail: z.string() })).default([]),
  people: S, conclusion: z.string(), confidence: z.string().default("")
});

const SYSTEM = `You are Trove, a professional document intelligence engine. 
Distinguish carefully between FACT (directly stated), INFERENCE (reasonably deduced), and CLAIM (alleged by a source). 
Do not invent facts, causality, or false certainty. 
Maintain entity resolution (note if identities might be the same).`;

const NOTES_HINT = JSON.stringify({ entities: [{ name: "", type: "" }], events: [{ date: "", description: "", importance: 5 }], facts: [""], contradictions: [""] });
const REPORT_HINT = JSON.stringify({ document_type: "", title: "", overview: "", key_points: [""], events: [{ name: "", detail: "" }], topics: [{ name: "", detail: "" }], people: [""], relationships: [""], dates: [""], decisions: [""], actions: [""], questions: [""], unresolved: [""], contradictions: [""], evidence: [""], themes: [""], conclusion: "", confidence: "" });
const SUMMARY_REPORT_HINT = JSON.stringify({ document_type: "", title: "", overview: "", key_points: [""], events: [{ name: "", detail: "" }], people: [""], conclusion: "", confidence: "" });

const OVERALL_DEADLINE_MS = Number(process.env.ANALYSIS_DEADLINE_MS || 90000);
const MAX_COMPRESSED_TOKENS = 3000; // Hard cap on local intelligence output

function emptyNotes() {
  return { entities: [], events: [], facts: [], contradictions: [] };
}

function withDeadline(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(`Deadline exceeded: ${label} (${ms}ms)`), { code: "DEADLINE" })), ms); });
  return Promise.race([promise.then((v) => { clearTimeout(timer); return v; }), timeout]);
}

export async function analyze(raw, { modes = ["quick"], focus = "" } = {}, onProgress = () => {}) {
  if (arguments[1]?.mode && !arguments[1]?.modes) modes = [arguments[1].mode];
  
  const deadline = Date.now() + OVERALL_DEADLINE_MS;
  const remaining = () => Math.max(0, deadline - Date.now());

  async function guardedAnalyze() {
    const text = normalize(raw);
    if (text.length < 200) throw Object.assign(new Error("too short"), { code: "TOO_SHORT" });
    const ai = getProvider(), st = stats(text);
    
    // 1. LOCAL INTELLIGENCE ENGINE
    // We do NOT send 60 chunks to the LLM. We crush the 100K lines locally down to 3,000 tokens of 
    // the absolute highest-density evidence (names, dates, quotes, contradictions, beginnings/ends).
    onProgress({ stage: "local_processing", stats: st });
    const localMap = await compress(text, MAX_COMPRESSED_TOKENS);
    const body = localMap.text;
    const sentTokens = estimateTokens(body);

    let extraction = emptyNotes();
    let extractionFailed = false;

    // 2. ONE SINGLE LLM EXTRACTION CALL
    // We send the highly compressed 3000 token representation to Groq to extract structured evidence.
    onProgress({ stage: "extraction", sentTokens });
    try {
      extraction = await ai.generateJSON({ 
        system: SYSTEM, data: body, schemaHint: NOTES_HINT, maxOutputTokens: 1200,
        mock: () => JSON.stringify(emptyNotes()),
        instruction: `PASS 1 - DOCUMENT INTELLIGENCE: Analyze this compressed intelligence map. Extract compact structured facts, entities (resolve aliases), temporal events, and candidate contradictions.${focus ? " Focus: " + focus : ""}` 
      }, ChunkNotes);
    } catch (e) {
      console.warn(`Extraction failed:`, e);
      extractionFailed = true;
      if (e.code === "REQUEST_TOO_LARGE") {
        throw Object.assign(new Error("The extracted text was too large for the model to process. Please try a smaller document."), { code: "PROVIDER" });
      }
    }

    // 3. FINAL SYNTHESIS
    // Both Summary and Deep Report share the SAME intermediate extraction graph.
    const finalRepresentation = JSON.stringify(extraction);
    const reports = {};
    
    // Strict output token budgets to stay below 6000-token total request bounds
    if (modes.includes("quick") || modes.includes("summary")) {
      onProgress({ stage: "synthesis", mode: "summary" });
      reports.quick = await ai.generateJSON({ 
        system: SYSTEM, data: finalRepresentation, schemaHint: SUMMARY_REPORT_HINT, maxOutputTokens: 1000,
        mock: () => JSON.stringify({ title: "Mock Summary", overview: "ok", conclusion: "ok", key_points: [], events: [], people: [] }),
        instruction: `FINAL SYNTHESIS (SUMMARY MODE): Generate a compact summary report from this evidence map. Focus on the overview, major points, important entities, and conclusion.${focus ? " Focus: " + focus : ""}` 
      }, SummaryReport);
    }
    
    if (modes.includes("deep")) {
      onProgress({ stage: "synthesis", mode: "deep" });
      reports.deep = await ai.generateJSON({ 
        system: SYSTEM, data: finalRepresentation, schemaHint: REPORT_HINT, maxOutputTokens: 2200,
        mock: () => JSON.stringify({ title: "Mock Deep", overview: "ok", conclusion: "ok", key_points: [], events: [], topics: [], people: [], relationships: [], dates: [], decisions: [], actions: [], questions: [], unresolved: [], contradictions: [], evidence: [], themes: [] }),
        instruction: `FINAL SYNTHESIS (DEEP MODE): Generate a comprehensive intelligence report from this evidence map. Include key findings, entity relationships, timeline, contradictions, and unresolved mysteries.${focus ? " Focus: " + focus : ""}` 
      }, Report);
    }

    const primaryReport = reports.deep || reports.quick || Object.values(reports)[0];
    const indicatesFailure = ["failed", "could not", "no content"].some(phrase => 
      primaryReport.overview?.toLowerCase().includes(phrase) || 
      primaryReport.conclusion?.toLowerCase().includes(phrase)
    );
    const hasData = (primaryReport.key_points && primaryReport.key_points.length > 0) || (primaryReport.people && primaryReport.people.length > 0);
    
    if ((indicatesFailure && !hasData) || extractionFailed) {
      throw Object.assign(new Error("The AI provider could not process this document. Please try again."), { code: "PROVIDER" });
    }

    onProgress({ stage: "done" });
    
    return { report: primaryReport, reports, stats: st, chunks: 1, sentTokens, notes: [extraction] };
  }

  return withDeadline(guardedAnalyze(), remaining(), "analysis pipeline");
}
