// Data-access layer. Every read/write of user data is scoped by user_id, so changing an ID in a URL can never reach another user's rows.
import { getPool } from "./client.js";
const q = (text, params) => getPool().query(text, params);
const one = (r) => r.rows[0] ?? null;

export const upsertUser = async ({ googleId, email, name, avatarUrl }) => one(await q(
  `INSERT INTO users (google_id,email,name,avatar_url) VALUES ($1,$2,$3,$4)
   ON CONFLICT (google_id) DO UPDATE SET email=EXCLUDED.email,name=EXCLUDED.name,avatar_url=EXCLUDED.avatar_url,updated_at=now() RETURNING *`,
  [googleId, email, name, avatarUrl]));

export const createDocument = async (userId, d) => one(await q(
  `INSERT INTO documents (user_id,title,original_filename,file_type,source_type,file_size,character_count,line_count,estimated_tokens)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
  [userId, d.title, d.originalFilename ?? null, d.fileType, d.sourceType, d.fileSize, d.chars, d.lines, d.tokens]));

export const createAnalysis = async (userId, documentId, mode, hash) => one(await q(
  `INSERT INTO analyses (user_id,document_id,analysis_mode,input_hash)
   SELECT $1,id,$3,$4 FROM documents WHERE id=$2 AND user_id=$1 RETURNING *`, [userId, documentId, mode, hash]));

export const updateAnalysis = (userId, id, { status, stage, chunksDone, chunksTotal, error }) => q(
  `UPDATE analyses SET status=COALESCE($3,status), stage=COALESCE($4,stage), chunks_done=COALESCE($5,chunks_done), chunks_total=COALESCE($6,chunks_total),
   error_message=COALESCE($7,error_message), started_at=CASE WHEN $3='running' AND started_at IS NULL THEN now() ELSE started_at END,
   completed_at=CASE WHEN $3 IN ('completed','failed') THEN now() ELSE completed_at END WHERE id=$1 AND user_id=$2`,
  [id, userId, status ?? null, stage ?? null, chunksDone ?? null, chunksTotal ?? null, error ?? null]);

const SECTIONS = [["overview", "Overview", "overview"], ["key_points", "Key Insights"], ["topics", "Topics"], ["people", "People & Entities"], ["dates", "Timeline"],
  ["decisions", "Decisions"], ["actions", "Action Items"], ["questions", "Questions"], ["contradictions", "Contradictions"], ["conclusion", "Conclusion"]];

/** Saves report + non-empty sections atomically. */
export async function saveReport(userId, analysisId, report) {
  const c = await getPool().connect();
  try {
    await c.query("BEGIN");
    const r = one(await c.query(
      `INSERT INTO reports (analysis_id,user_id,title,executive_summary,report_data)
       SELECT $1,$2,$3,$4,$5 FROM analyses WHERE id=$1 AND user_id=$2 RETURNING *`, [analysisId, userId, report.title, report.overview, report]));
    if (!r) throw Object.assign(new Error("Analysis not found"), { code: "NOT_FOUND" });
    let pos = 0;
    for (const [key, title] of SECTIONS) {
      const v = report[key]; if (!v || (Array.isArray(v) && !v.length)) continue;
      await c.query("INSERT INTO report_sections (report_id,section_type,title,content,position) VALUES ($1,$2,$3,$4,$5)", [r.id, key, title, JSON.stringify(v), pos++]);
    }
    await c.query("COMMIT"); return r;
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}

export const listReports = async (userId, limit = 30) => (await q(
  `SELECT r.id,r.title,r.is_favorite,left(r.executive_summary,200) AS preview,r.created_at,a.analysis_mode,d.original_filename,d.source_type,d.estimated_tokens,d.line_count
   FROM reports r JOIN analyses a ON a.id=r.analysis_id JOIN documents d ON d.id=a.document_id
   WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT $2`, [userId, limit])).rows;

export const getReport = async (userId, id) => {
  const r = one(await q("SELECT * FROM reports WHERE id=$1 AND user_id=$2", [id, userId]));
  if (!r) return null;
  r.sections = (await q("SELECT id,section_type,title,content,position FROM report_sections WHERE report_id=$1 ORDER BY position", [id])).rows;
  return r;
};
export const renameReport = async (userId, id, title) => one(await q("UPDATE reports SET title=$3,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id,title", [id, userId, title]));
export const deleteReport = async (userId, id) => (await q("DELETE FROM reports WHERE id=$1 AND user_id=$2", [id, userId])).rowCount > 0;

export const findCached = async (userId, hash) => one(await q("SELECT r.id FROM reports r JOIN analyses a ON a.id=r.analysis_id WHERE r.user_id=$1 AND a.input_hash=$2 LIMIT 1", [userId, hash]));
export const saveNotes = (userId, analysisId, notes) => q("UPDATE analyses SET notes=$3 WHERE id=$1 AND user_id=$2", [analysisId, userId, JSON.stringify(notes)]);
export const getNotes = async (userId, reportId) => one(await q("SELECT a.notes FROM reports r JOIN analyses a ON a.id=r.analysis_id WHERE r.id=$1 AND r.user_id=$2", [reportId, userId]))?.notes ?? null;
export const setFavorite = async (userId, id, v) => one(await q("UPDATE reports SET is_favorite=$3 WHERE id=$1 AND user_id=$2 RETURNING id,is_favorite", [id, userId, !!v]));
export const setShare = async (userId, id, enabled, token) => one(await q("UPDATE reports SET share_token=$3 WHERE id=$1 AND user_id=$2 RETURNING share_token", [id, userId, enabled ? token : null]));
export const getShared = async (token) => {
  const r = one(await q("SELECT id,title,created_at FROM reports WHERE share_token=$1", [token])); if (!r) return null;
  r.sections = (await q("SELECT id,section_type,title,content,position FROM report_sections WHERE report_id=$1 ORDER BY position", [r.id])).rows; delete r.id; return r;
};
export const getSection = async (userId, reportId, sid) => one(await q("SELECT s.id,s.section_type,s.title FROM report_sections s JOIN reports r ON r.id=s.report_id WHERE s.id=$3 AND r.id=$2 AND r.user_id=$1", [userId, reportId, sid]));
export const updateSection = async (userId, reportId, sid, content) => one(await q("UPDATE report_sections s SET content=$4 FROM reports r WHERE s.id=$3 AND s.report_id=r.id AND r.id=$2 AND r.user_id=$1 RETURNING s.id,s.section_type,s.title,s.content", [userId, reportId, sid, JSON.stringify(content)]));
