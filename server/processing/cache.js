// In-memory cache for DocumentIntelligenceMap, EvidenceMap, and Reports

const intelligenceCache = new Map();
const evidenceCache = new Map();
const reportCache = new Map();

export function getIntelligence(hash) { return intelligenceCache.get(hash); }
export function setIntelligence(hash, data) { intelligenceCache.set(hash, data); }

export function getEvidence(hash) { return evidenceCache.get(hash); }
export function setEvidence(hash, data) { evidenceCache.set(hash, data); }

export function getReport(hash, mode) { return reportCache.get(`${hash}_${mode}`); }
export function setReport(hash, mode, data) { reportCache.set(`${hash}_${mode}`, data); }
