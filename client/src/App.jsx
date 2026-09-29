import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { api, streamAnalyze } from "./api.js";
import Landing from "./Landing.jsx";

const MAX = 12_000_000;
const fmt = (n) => n.toLocaleString();
const secText = (c) => typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => typeof x === "string" ? "• " + x : `• ${x.name}: ${x.detail}`).join("\n") : "";
const btn = "min-h-[44px] rounded-xl px-4 text-sm font-medium transition";
const ghost = `${btn} glass hover:bg-white/10`;

function Hl({ text, q }) {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((p, i) => p.toLowerCase() === q.toLowerCase() ? <mark key={i} className="rounded bg-amber-300/40 text-inherit">{p}</mark> : p);
}

function Report({ id, onBack }) {
  const [r, setR] = useState(null), [err, setErr] = useState(""), [q, setQ] = useState(""), [toast, setToast] = useState("");
  useEffect(() => { api(`/api/reports/${id}`).then(setR).catch((e) => setErr(e.message)); }, [id]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 1600); };
  const copy = (t) => navigator.clipboard.writeText(t).then(() => flash("Copied"));
  if (err) return <p role="alert" className="p-6 text-rose-300">{err}</p>;
  if (!r) return <div className="space-y-3 p-5" aria-busy="true">{[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/5" />)}</div>;
  const ql = q.trim().toLowerCase();
  const shown = r.sections.filter((s) => !ql || (s.title + secText(s.content)).toLowerCase().includes(ql));
  const toggleFav = async () => { const u = await api(`/api/reports/${id}/favorite`, { method: "POST", body: JSON.stringify({ value: !r.is_favorite }) }).catch((e) => flash(e.message)); if (u) setR({ ...r, is_favorite: u.is_favorite }); };
  const share = async () => {
    const on = !r.share_token; if (on && !confirm("Anyone with the link can read this report. Continue?")) return;
    const u = await api(`/api/reports/${id}/share`, { method: "POST", body: JSON.stringify({ enabled: on }) }).catch((e) => flash(e.message)); if (!u) return;
    setR({ ...r, share_token: u.token }); if (on) copy(`${location.origin}/s/${u.token}`);
  };
  const regen = async (s) => { flash("Regenerating…"); const u = await api(`/api/reports/${id}/sections/${s.id}/regenerate`, { method: "POST" }).catch((e) => flash(e.message)); if (u) { setR({ ...r, sections: r.sections.map((x) => x.id === s.id ? { ...x, content: u.content } : x) }); flash("Section updated"); } };
  const rename = async () => { const t = prompt("Rename report", r.title); if (t?.trim()) { const u = await api(`/api/reports/${id}`, { method: "PATCH", body: JSON.stringify({ title: t }) }).catch((e) => flash(e.message)); if (u) setR({ ...r, title: u.title }); } };
  const del = async () => { if (confirm("Delete this report permanently?")) { await api(`/api/reports/${id}`, { method: "DELETE" }); onBack(); } };
  return (
    <article className="mx-auto max-w-2xl px-4 pb-32 pt-4 print:text-black">
      <button onClick={onBack} className={`${ghost} mb-4 print:hidden`}>← Back</button>
      {r.report_data?.partial && (
        <div role="alert" className="mb-6 rounded-xl bg-amber-500/15 p-4 text-sm text-amber-200 border border-amber-500/20">
          <strong>Note:</strong> Some sections of this document could not be analyzed and were skipped. The report below is incomplete.
        </div>
      )}
      <h1 className="font-display text-3xl leading-tight">{r.title}</h1>
      <p className="mt-1 text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString(undefined, { dateStyle: "long" })}</p>
      <div className="mt-4 flex flex-wrap gap-2 print:hidden">
        <button className={ghost} onClick={() => copy(r.sections.map((s) => `${s.title}\n${secText(s.content)}`).join("\n\n"))}>Copy all</button>
        <a className={`${ghost} inline-flex items-center`} href={`/api/reports/${id}/pdf`}>Download PDF</a>
        <button className={ghost} onClick={() => window.print()}>Print</button>
        <button className={ghost} onClick={toggleFav}>{r.is_favorite ? "★ Saved" : "☆ Save"}</button>
        <a className={`${ghost} inline-flex items-center`} href={`/api/reports/${id}/markdown`}>Markdown</a>
        <button className={ghost} onClick={share}>{r.share_token ? "Stop sharing" : "Share"}</button>
        <button className={ghost} onClick={rename}>Rename</button>
        <button className={`${ghost} text-rose-300`} onClick={del}>Delete</button>
      </div>
      <input type="search" aria-label="Search within report" placeholder="Search this report…" value={q} onChange={(e) => setQ(e.target.value)} className="glass mt-4 min-h-[48px] w-full rounded-xl px-4 outline-none placeholder:text-slate-500 print:hidden" />
      <nav aria-label="Sections" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 print:hidden">{shown.map((s) => <a key={s.id} href={`#s-${s.id}`} className="glass shrink-0 rounded-full px-3 py-2 text-xs">{s.title}</a>)}</nav>
      <div className="mt-4 space-y-3">
        {!shown.length && <p className="glass rounded-2xl p-6 text-center text-slate-400">No sections match “{q}”.</p>}
        {shown.map((s, i) => (
          <details key={s.id} id={`s-${s.id}`} open={i < 3 || !!ql} className="glass rounded-2xl p-4 open:shadow-lg open:shadow-black/30">
            <summary className="flex min-h-[44px] cursor-pointer items-center justify-between font-display text-lg text-amber-200">{s.title}
              <span className="flex"><button aria-label={`Copy ${s.title}`} onClick={(e) => { e.preventDefault(); copy(`${s.title}\n${secText(s.content)}`); }} className="rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/10 print:hidden">Copy</button><button aria-label={`Regenerate ${s.title}`} onClick={(e) => { e.preventDefault(); regen(s); }} className="rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/10 print:hidden">Redo</button></span></summary>
            {typeof s.content === "string" ? <p className="mt-2 leading-7 text-slate-200"><Hl text={s.content} q={ql} /></p>
              : <ul className="mt-2 space-y-2 leading-7 text-slate-200">{s.content.map((x, k) => <li key={k} className={typeof x === "object" && x.meaning ? "w-full" : "flex gap-2"}>{typeof x === "object" && x.meaning ? null : <span className="text-sky-300">•</span>}<span>{typeof x === "string" ? <Hl text={x} q={ql} /> : x.meaning ? (
                <div className="flex flex-col mb-4 bg-white/5 p-4 rounded-xl border border-white/10 w-full">
                  <div className="text-amber-300 font-semibold mb-1 uppercase tracking-wider text-xs">Lines {x.lines}: {x.title || "Insight"}</div>
                  <div className="text-slate-200 mb-2 font-medium">Meaning: <span className="font-normal text-slate-300"><Hl text={x.meaning} q={ql} /></span></div>
                  {x.connections && <div className="text-slate-400 text-sm italic mb-1">Connections: {x.connections}</div>}
                  {x.evidence && <div className="text-slate-500 text-xs mt-2 border-t border-white/5 pt-2">Evidence: {x.evidence}</div>}
                </div>
              ) : <><b>{x.name || x.title}</b> — <Hl text={x.detail || x.content || ""} q={ql} /></>}</span></li>)}</ul>}
          </details>
        ))}
      </div>
      <Ask id={id} />
      {toast && <div role="status" className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-900">{toast}</div>}
    </article>
  );
}

function Ask({ id }) {
  const [q, setQ] = useState(""), [a, setA] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(""); setA(null); try { setA(await api(`/api/reports/${id}/ask`, { method: "POST", body: JSON.stringify({ question: q }) })); } catch (x) { setErr(x.message); } setBusy(false); };
  return (
    <section className="glass mt-6 rounded-2xl p-4 print:hidden"><h2 className="font-display text-lg text-amber-200">Ask this document</h2>
      <form onSubmit={go} className="mt-2 flex gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} aria-label="Question" placeholder="What were the main decisions?" className="min-h-[48px] flex-1 rounded-xl bg-black/30 px-3 outline-none" />
        <button disabled={busy || q.trim().length < 3} className={`${btn} bg-amber-300 text-slate-900 disabled:opacity-40`}>{busy ? "…" : "Ask"}</button></form>
      {err && <p role="alert" className="mt-2 text-sm text-rose-300">{err}</p>}
      {a && <div className="mt-3 text-sm leading-6" aria-live="polite"><p>{a.answer}</p>{!a.grounded && <p className="mt-1 text-xs text-amber-300">Not clearly covered by the document.</p>}{a.evidence?.map((x, i) => <p key={i} className="mt-1 text-xs text-slate-400">“{x}”</p>)}</div>}
    </section>
  );
}

const STEPS = ["Reading document", "Detecting sections", "Extracting important information", "Building structured report"];
function Processing({ p }) {
  if (p.stage === "queued") return <div className="mx-auto max-w-md p-6 text-center" role="status"><h2 className="font-display text-2xl">You're in line</h2><p className="mt-3 text-slate-300">Position {p.position}. Demand is high; your analysis starts automatically.</p></div>;
  const done = p.stage === "chunked" ? 1 : p.stage === "chunk" ? 2 : p.stage === "merge" ? 3 : p.stage === "synthesis" ? 3 : 0;
  return (
    <div className="mx-auto max-w-md p-6 text-center" role="status" aria-live="polite">
      <h2 className="font-display text-2xl tracking-wide">Analyzing your information</h2>
      <ul className="glass mt-6 space-y-3 rounded-2xl p-5 text-left">{STEPS.map((s, i) => <li key={s} className={i <= done ? "text-slate-100" : "text-slate-500"}>{i < done ? "✓" : i === done ? <span className="pulse text-amber-300">●</span> : "○"} {s}{i === 2 && p.total ? ` — section ${Math.min(p.done ?? 0, p.total)} of ${p.total}` : ""}{i === 2 && p.stage === "merge" ? ` (merging level ${p.level})` : ""}</li>)}</ul>
      {p.total > 0 && <div className="mt-4 h-1.5 overflow-hidden rounded bg-white/10"><div className="h-full bg-amber-300 transition-all" style={{ width: `${((p.done ?? 0) / p.total) * 100}%` }} /></div>}
    </div>
  );
}

function NewAnalysis({ onDone }) {
  const [text, setText] = useState(""), [src, setSrc] = useState({ type: "paste" }), [mode, setMode] = useState("quick"), [focus, setFocus] = useState(""), [busy, setBusy] = useState(false), [prog, setProg] = useState({}), [err, setErr] = useState("");
  const d = useDeferredValue(text);
  const st = useMemo(() => ({ chars: d.length, lines: d ? d.split("\n").length : 0, tokens: Math.ceil(d.length / 4), mb: (new Blob([d]).size / 1e6).toFixed(2) }), [d]);
  const load = async (f) => {
    setErr(""); if (!f) return;
    if (f.size > MAX) return setErr("That file is too large (12 MB max).");
    try {
      if (/\.pdf$/i.test(f.name)) { const j = await api("/api/extract-pdf", { method: "POST", headers: { "Content-Type": "application/pdf" }, body: f }); setText(j.text); setSrc({ type: "pdf", filename: f.name }); }
      else if (/\.txt$/i.test(f.name)) { setText(await f.text()); setSrc({ type: "txt", filename: f.name }); }
      else setErr("Please choose a .txt or .pdf file.");
    } catch (e) { setErr(e.message); }
  };
  const run = async () => {
    setBusy(true); setErr(""); setProg({ stage: "start" }); let acc = {};
    try { await streamAnalyze({ text, mode, focus, source: src }, (ev, data) => { if (ev === "progress") { acc = { ...acc, ...data }; setProg(acc); } if (ev === "result") onDone(data.reportId); if (ev === "error") { setErr(data.message); setBusy(false); } }); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  if (busy) return <Processing p={prog} />;
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 pb-32 pt-4">
      <h1 className="font-display text-3xl">New analysis</h1>
      <label className={`${ghost} inline-flex cursor-pointer items-center`}>Upload TXT or PDF<input type="file" accept=".txt,.pdf,text/plain,application/pdf" className="sr-only" onChange={(e) => load(e.target.files[0])} /></label>
      {src.filename && <span className="ml-3 text-sm text-slate-400">{src.filename} · {src.type.toUpperCase()}</span>}
      <textarea aria-label="Text to analyze" value={text} onChange={(e) => { setText(e.target.value); setSrc({ type: "paste" }); }} placeholder="Paste your notes, transcript, article…" className="glass h-56 w-full resize-y rounded-2xl p-4 outline-none placeholder:text-slate-500" />
      <dl className="grid grid-cols-4 gap-2 text-center text-xs">{[["Lines", fmt(st.lines)], ["Chars", fmt(st.chars)], ["~Tokens", fmt(st.tokens)], ["MB", st.mb]].map(([k, v]) => <div key={k} className="glass rounded-xl p-2"><dt className="text-slate-400">{k}</dt><dd className="text-base font-semibold text-amber-200">{v}</dd></div>)}</dl>
      <div role="radiogroup" aria-label="Report type" className="grid grid-cols-2 gap-2">{[["quick", "Quick Summary"], ["deep", "Deep Report"]].map(([k, l]) => <button key={k} role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={`${btn} min-h-[52px] ${mode === k ? "bg-amber-300 text-slate-900" : "glass"}`}>{l}</button>)}</div>
      <details className="glass rounded-xl p-3"><summary className="min-h-[36px] cursor-pointer text-sm text-slate-300">Advanced</summary><input value={focus} maxLength={200} onChange={(e) => setFocus(e.target.value)} placeholder="Focus on a topic (optional)" aria-label="Focus topic" className="mt-2 min-h-[44px] w-full rounded-lg bg-black/30 px-3 outline-none" /></details>
      {err && <p role="alert" className="rounded-xl bg-rose-500/15 p-3 text-sm text-rose-200">{err}</p>}
      <button disabled={text.trim().length < 200 || text.length > MAX} onClick={run} className={`${btn} min-h-[56px] w-full bg-amber-300 text-base font-semibold text-slate-900 disabled:opacity-40`}>{text.trim().length < 200 ? "Add at least a few paragraphs" : "Analyze"}</button>
    </div>
  );
}

function Reports({ onOpen, onNew }) {
  const [list, setList] = useState(null), [err, setErr] = useState(""), [f, setF] = useState("");
  const load = () => api("/api/reports").then(setList).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const del = async (id) => { if (confirm("Delete this report?")) { await api(`/api/reports/${id}`, { method: "DELETE" }).catch((e) => setErr(e.message)); load(); } };
  return (
    <div className="mx-auto max-w-2xl px-4 pb-32 pt-4">
      <h1 className="font-display text-3xl">Recent Troves</h1>
      <input type="search" value={f} onChange={(e) => setF(e.target.value)} aria-label="Search reports" placeholder="Search your reports…" className="glass mt-3 min-h-[48px] w-full rounded-xl px-4 outline-none placeholder:text-slate-500" />
      {err && <p role="alert" className="mt-3 text-rose-300">{err}</p>}
      {!list && !err && [1, 2].map((i) => <div key={i} className="mt-3 h-28 animate-pulse rounded-2xl bg-white/5" />)}
      {list?.length === 0 && <div className="glass mt-4 rounded-2xl p-8 text-center"><p className="font-display text-xl">Your vault is empty</p><p className="mt-1 text-sm text-slate-400">Analyze your first document to see it here.</p><button onClick={onNew} className={`${btn} mt-4 bg-amber-300 text-slate-900`}>New analysis</button></div>}
      <ul className="mt-4 space-y-3">{list?.filter((r) => !f || (r.title + r.preview).toLowerCase().includes(f.toLowerCase())).sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite)).map((r) => (
        <li key={r.id} className="glass rounded-2xl p-4">
          <button onClick={() => onOpen(r.id)} className="w-full text-left"><h3 className="font-display text-lg text-amber-200">{r.is_favorite && "★ "}{r.title}</h3><p className="mt-1 line-clamp-2 text-sm text-slate-300">{r.preview}</p>
            <p className="mt-2 text-xs text-slate-500">{r.analysis_mode === "deep" ? "Deep Report" : "Quick Summary"} · {r.original_filename || "Pasted text"} · ~{fmt(r.estimated_tokens)} tokens · {new Date(r.created_at).toLocaleDateString()}</p></button>
          <div className="mt-3 flex gap-2"><button className={ghost} onClick={() => onOpen(r.id)}>Open</button><a className={`${ghost} inline-flex items-center`} href={`/api/reports/${r.id}/pdf`}>PDF</a><button className={`${ghost} text-rose-300`} onClick={() => del(r.id)}>Delete</button></div>
        </li>))}</ul>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined), [view, setView] = useState("home"), [rid, setRid] = useState(null);
  useEffect(() => { api("/api/me").then(setUser).catch(() => setUser(null)); }, []);
  if (user === undefined) return <div className="aurora min-h-screen" aria-busy="true" />;
  if (!user) return <Landing failed={new URLSearchParams(location.search).get("auth") === "failed"} />;
  const open = (id) => { setRid(id); setView("report"); window.scrollTo(0, 0); };
  const nav = [["home", "Home"], ["new", "New"], ["reports", "Reports"]];
  const logout = async () => { await api("/auth/logout", { method: "POST" }); setUser(null); };
  return (
    <div className="aurora min-h-screen">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-4 print:hidden"><span className="font-display text-2xl text-amber-300">Trove</span>
        <div className="flex items-center gap-2">{user.avatar && <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" />}<button onClick={logout} className={ghost}>Sign out</button></div></header>
      {view === "home" && <div className="mx-auto max-w-2xl px-4 pb-32 pt-8"><p className="text-slate-400">Your knowledge, organized.</p><h1 className="font-display text-3xl">Hello{user.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
        <button onClick={() => setView("new")} className="glass mt-6 w-full rounded-3xl p-6 text-left shadow-xl shadow-amber-300/5 transition hover:bg-white/10"><span className="font-display text-2xl text-amber-200">New analysis</span><span className="mt-1 block text-sm text-slate-300">Paste text · Upload TXT · Upload PDF</span></button>
        <div className="mt-8"><Reports onOpen={open} onNew={() => setView("new")} /></div></div>}
      {view === "new" && <NewAnalysis onDone={open} />}
      {view === "reports" && <Reports onOpen={open} onNew={() => setView("new")} />}
      {view === "report" && <Report id={rid} onBack={() => setView("reports")} />}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-[#070b14]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden"><div className="mx-auto flex max-w-2xl items-center justify-around px-4 py-2">
        {nav.map(([k, l]) => <button key={k} aria-current={view === k ? "page" : undefined} onClick={() => setView(k)} className={k === "new" ? "-mt-6 min-h-[56px] rounded-full bg-amber-300 px-7 font-semibold text-slate-900 shadow-lg shadow-amber-300/30" : `min-h-[48px] px-4 text-sm ${view === k ? "text-amber-300" : "text-slate-400"}`}>{k === "new" ? "+ New" : l}</button>)}</div></nav>
    </div>
  );
}
