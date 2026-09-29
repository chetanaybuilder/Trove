import { z } from "zod";
import { getProvider } from "../ai/provider.js";
import { estimateTokens, normalize, buildDocumentIntelligenceMap, buildCompactEvidenceMap } from "./indexer.js";
import { globalBudget } from "./budget.js";
import { getIntelligence, setIntelligence, getEvidence, setEvidence, getReport, setReport } from "./cache.js";
import crypto from "crypto";

const S = z.array(z.string()).default([]);

export const Report = z.object({
  summary: z.string().default(""),
  findings: z.array(z.string()).default([]),
  entities: z.array(z.string()).default([]),
  events: z.array(z.string()).default([]),
  contradictions: z.array(z.string()).default([]),
  unresolved: z.array(z.string()).default([]),
  sectionInsights: z.array(z.object({
    lines: z.string(),
    title: z.string(),
    meaning: z.string(),
    connections: z.string(),
    evidence: z.string()
  })).default([])
});

const SummaryReport = z.object({
  summary: z.string().default(""),
  findings: z.array(z.string()).default([]),
  entities: z.array(z.string()).default([])
});

const SYSTEM = `You are Trove, an expert document intelligence engine. 
Return ONLY valid JSON matching the provided schema.
Do not write markdown, explanations, commentary, introductory text, or conclusions outside the JSON.
Every required field MUST be present. If a field has no values, return an empty array or empty string.
If information is uncertain, preserve uncertainty inside the field rather than inventing facts.`;

const REPORT_HINT = JSON.stringify({ summary: "", findings: [""], entities: [""], events: [""], contradictions: [""], unresolved: [""], sectionInsights: [{ lines: "", title: "", meaning: "", connections: "", evidence: "" }] });
const SUMMARY_REPORT_HINT = JSON.stringify({ summary: "", findings: [""], entities: [""] });

const OVERALL_DEADLINE_MS = Number(process.env.ANALYSIS_DEADLINE_MS || 90000);
const MAX_COMPRESSED_TOKENS = 3000;

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
    
    const docHash = crypto.createHash('sha256').update(text).digest('hex');
    const ai = getProvider();
    
    const reports = {};
    let dim = getIntelligence(docHash);
    let evidenceJson = getEvidence(docHash);

    if (!dim) {
      onProgress({ stage: "local_processing", msg: "Indexing document locally" });
      const t0 = Date.now();
      dim = buildDocumentIntelligenceMap(text);
      dim.localProcessingMs = Date.now() - t0;
      setIntelligence(docHash, dim);
      
      evidenceJson = buildCompactEvidenceMap(dim, MAX_COMPRESSED_TOKENS);
      setEvidence(docHash, evidenceJson);
    } else {
      onProgress({ stage: "local_processing", msg: "Using cached document index" });
    }

    const st = dim.statistics;
    const sentTokens = estimateTokens(evidenceJson);
    const estimatedRequestCost = sentTokens + 3000; // rough budget

    const llmDisabled = process.env.LLM_DISABLED === "true";

    // Final Synthesis - Shared Analysis Result
    if (modes.includes("quick") || modes.includes("summary")) {
      const cached = getReport(docHash, "summary");
      if (cached) {
        reports.quick = cached;
      } else if (llmDisabled) {
        onProgress({ stage: "synthesis", mode: "summary", msg: "Local Only Mode (Skipped LLM)" });
        reports.quick = {
          summary: "Local Extraction Only (LLM Disabled)",
          findings: dim.decisions.slice(0, 5).map(d => d.text) || [],
          entities: dim.entities.slice(0, 10)
        };
        setReport(docHash, "summary", reports.quick);
      } else {
        try {
          globalBudget.reserveTokens(estimatedRequestCost);
          onProgress({ stage: "synthesis", mode: "summary" });
          reports.quick = await ai.generateJSON({ 
            system: SYSTEM, data: evidenceJson, schemaHint: SUMMARY_REPORT_HINT, maxOutputTokens: 1000,
            mock: () => JSON.stringify({ summary: "Mock Summary", findings: [], entities: [] }),
            instruction: `FINAL SYNTHESIS (SUMMARY MODE): Generate a compact summary report from this evidence map. Focus on the overview, major points, important entities, and conclusion.${focus ? " Focus: " + focus : ""}` 
          }, SummaryReport);
          setReport(docHash, "summary", reports.quick);
        } catch (e) {
          if (e.code === "BUDGET_EXHAUSTED" || e.code === "RATE_LIMITED" || e.code === "PROVIDER_REJECTED_REQUEST") {
            reports.quick = { error: "LLM synthesis unavailable", localDataAvailable: true, msg: e.message };
          } else throw e;
        }
      }
    }
    
    if (modes.includes("deep")) {
      const cached = getReport(docHash, "deep");
      if (cached) {
        reports.deep = cached;
      } else if (llmDisabled) {
        onProgress({ stage: "synthesis", mode: "deep", msg: "Local Only Mode (Skipped LLM)" });
        reports.deep = {
          summary: "Local Extraction Only (LLM Disabled)",
          findings: dim.decisions.map(d => d.text) || [],
          entities: dim.entities || [],
          events: dim.events.map(e => e.text).slice(0, 10),
          contradictions: dim.contradictions.map(c => c.text),
          unresolved: dim.unresolved.map(u => u.text),
          sectionInsights: [{ lines: "All", title: "Local Extracted Data", meaning: "LLM synthesis was disabled.", connections: "", evidence: "" }]
        };
        setReport(docHash, "deep", reports.deep);
      } else {
        try {
          globalBudget.reserveTokens(estimatedRequestCost);
          onProgress({ stage: "synthesis", mode: "deep" });
          reports.deep = await ai.generateJSON({ 
            system: SYSTEM, data: evidenceJson, schemaHint: REPORT_HINT, maxOutputTokens: 3000,
            mock: () => JSON.stringify({ summary: "Mock Deep", findings: [], entities: [], events: [], contradictions: [], unresolved: [], sectionInsights: [{ lines: "1-100", title: "Mock", meaning: "Mock", connections: "", evidence: "" }] }),
            instruction: `FINAL SYNTHESIS (DEEP MODE): Generate a comprehensive intelligence report from this evidence map. Include key findings, entity relationships, timeline, contradictions, and unresolved mysteries. \n\nCrucially, populate the 'sectionInsights' array by grouping related lines into sections and analyzing the deep meaning, importance, implications, connections to other sections, and explicitly referencing source lines as evidence.${focus ? " Focus: " + focus : ""}` 
          }, Report);
          setReport(docHash, "deep", reports.deep);
        } catch (e) {
          if (e.code === "BUDGET_EXHAUSTED" || e.code === "RATE_LIMITED" || e.code === "PROVIDER_REJECTED_REQUEST") {
            reports.deep = { error: "LLM synthesis unavailable", localDataAvailable: true, msg: e.message };
          } else throw e;
        }
      }
    }

    const primaryReport = reports.deep || reports.quick || Object.values(reports)[0];
    onProgress({ stage: "done" });
    
    return { 
      report: primaryReport, 
      reports, 
      stats: st, 
      chunks: 1, 
      sentTokens,
      localProcessingMs: dim.localProcessingMs,
      notes: [dim] // Expose local map instead of ChunkNotes LLM output
    };
  }

  return withDeadline(guardedAnalyze(), remaining(), "analysis pipeline");
}
