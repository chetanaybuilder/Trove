import { useEffect, useState } from "react";
import { api } from "./api.js";
export default function Shared() {
  const token = location.pathname.split("/")[2];
  const [r, setR] = useState(null), [err, setErr] = useState("");
  useEffect(() => { api(`/api/shared/${token}`).then(setR).catch(() => setErr("This link is invalid, or sharing was turned off.")); }, [token]);
  return (
    <div className="aurora min-h-screen"><main className="mx-auto max-w-2xl px-4 py-8">
      <p className="font-display text-xl text-amber-300">Trove</p>
      {err && <p role="alert" className="mt-6 text-rose-300">{err}</p>}
      {!r && !err && <div className="mt-6 h-32 animate-pulse rounded-2xl bg-white/5" aria-busy="true" />}
      {r && <><h1 className="mt-4 font-display text-3xl">{r.title}</h1><p className="mt-1 text-xs text-slate-400">Shared report · read-only</p>
        <div className="mt-5 space-y-3">{r.sections.map((s) => (
          <section key={s.id} className="glass rounded-2xl p-4"><h2 className="font-display text-lg text-amber-200">{s.title}</h2>
            {typeof s.content === "string" ? <p className="mt-2 leading-7">{s.content}</p> : <ul className="mt-2 space-y-2 leading-7">{s.content.map((x, i) => <li key={i} className="flex gap-2"><span className="text-sky-300">•</span><span>{typeof x === "string" ? x : <><b>{x.name}</b> — {x.detail}</>}</span></li>)}</ul>}
          </section>))}</div></>}
    </main></div>
  );
}
