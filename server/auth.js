import crypto from "node:crypto";
import express from "express";
import { OAuth2Client } from "google-auth-library";
import { upsertUser } from "./db/repo.js";

const secret = () => { if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is not set"); return process.env.SESSION_SECRET; };
const hmac = (b) => crypto.createHmac("sha256", secret()).update(b).digest("base64url");
const sign = (p) => { const b = Buffer.from(JSON.stringify(p)).toString("base64url"); return `${b}.${hmac(b)}`; };
function verify(t) {
  const [b, s] = String(t ?? "").split("."); if (!b || !s) return null;
  const e = hmac(b); if (s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return null;
  try { const p = JSON.parse(Buffer.from(b, "base64url")); return p.exp > Date.now() ? p : null; } catch { return null; }
}
const cookies = (req) => Object.fromEntries((req.headers.cookie ?? "").split(";").map((c) => c.trim().split("=")).filter((x) => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
const appUrl = () => process.env.APP_URL || "http://localhost:5173";
const flags = () => `Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
const oauth = () => new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${appUrl()}/auth/google/callback`);

export function requireAuth(req, res, next) {
  const s = verify(cookies(req).trove_session);
  if (!s) return res.status(401).json({ error: "Please sign in to continue." });
  req.user = { id: s.uid, name: s.name, email: s.email, avatar: s.avatar }; next();
}

export const authRouter = express.Router();
authRouter.get("/google", (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return res.status(500).send("Google sign-in is not configured on the server.");
  const state = crypto.randomBytes(16).toString("hex");
  res.append("Set-Cookie", `trove_state=${state}; Max-Age=600; ${flags()}`);
  res.redirect(oauth().generateAuthUrl({ scope: ["openid", "email", "profile"], state, prompt: "select_account" }));
});
authRouter.get("/google/callback", async (req, res) => {
  try {
    if (!req.query.state || req.query.state !== cookies(req).trove_state) throw new Error("state");
    const c = oauth(); const { tokens } = await c.getToken(String(req.query.code));
    const p = (await c.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID })).getPayload();
    if (!p.email_verified) throw new Error("unverified");
    const u = await upsertUser({ googleId: p.sub, email: p.email, name: p.name ?? null, avatarUrl: p.picture ?? null });
    res.append("Set-Cookie", `trove_session=${sign({ uid: u.id, name: u.name, email: u.email, avatar: u.avatar_url, exp: Date.now() + 7 * 864e5 })}; Max-Age=${7 * 86400}; ${flags()}`);
    res.redirect(appUrl() + "/");
  } catch { res.redirect(appUrl() + "/?auth=failed"); }
});
authRouter.post("/logout", (req, res) => { res.append("Set-Cookie", `trove_session=; Max-Age=0; ${flags()}`); res.json({ ok: true }); });
