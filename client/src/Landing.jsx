const CTA = ({ children = "Continue with Google", cls = "" }) => (
  <a href="/auth/google" className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-amber-300 px-6 font-semibold text-slate-900 shadow-lg shadow-amber-300/20 transition hover:bg-amber-200 ${cls}`}>{children}</a>
);
const features = [["Massive text", "Handles 50,000+ lines by chunking at natural boundaries, never one giant prompt."], ["Quick summaries", "The essentials, decisions and action items in under a minute."], ["Deep reports", "Chapters, timeline, entities, contradictions and open questions."], ["PDF intelligence", "Upload PDFs or TXT, or paste anything."], ["Structured extraction", "People, dates, decisions and actions pulled into clean sections."], ["Export-ready", "Polished PDF with headers, footers and page numbers."]];
const steps = ["Upload or paste", "Trove understands", "Trove structures", "Read & export"];

export default function Landing({ failed }) {
  return (
    <div className="aurora min-h-screen overflow-x-hidden">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5"><span className="font-display text-2xl tracking-wide text-amber-300">Trove</span></header>
      <main>
        <section className="mx-auto max-w-5xl px-5 pb-16 pt-6 text-center md:pt-14">
          {failed && <p role="alert" className="mx-auto mb-6 max-w-sm rounded-xl bg-rose-500/15 p-3 text-sm text-rose-200">Sign-in didn't complete. Please try again.</p>}
          <h1 className="font-display text-4xl leading-tight md:text-6xl">Turn overwhelming information into <span className="text-amber-300">clarity</span>.</h1>
          <p className="mx-auto mt-4 max-w-xl text-slate-300">Trove transforms massive documents and text into structured intelligence: summaries, timelines, decisions and action items.</p>
          <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"><CTA cls="w-full sm:w-auto" /><a href="#how" className="min-h-[52px] rounded-2xl px-5 py-3.5 text-slate-300 hover:text-white">See how it works</a></div>
          <div className="stage mx-auto mt-14 h-72 w-64" aria-hidden="true">
            <div className="tilt relative h-72 w-56 mx-auto">
              <div className="layer glass p-4 text-left font-mono text-[9px] leading-4 text-slate-500 blur-[1px]" style={{ transform: "translateZ(-50px)" }}>{Array.from({ length: 14 }, (_, i) => <div key={i}>meeting notes … {i * 37} lorem raw text …</div>)}</div>
              <div className="layer flex items-center justify-center" style={{ transform: "translateZ(0)", background: "radial-gradient(circle, rgba(56,189,248,.35), transparent 65%)" }}><div className="pulse h-16 w-16 rounded-full border border-sky-300/60" /></div>
              <div className="layer glass p-4 text-left shadow-2xl shadow-amber-300/10" style={{ transform: "translateZ(55px) translateX(24px) translateY(18px) scale(.8)" }}>
                <div className="mb-3 h-2 w-16 rounded bg-amber-300" />{[90, 70, 80, 55].map((w, i) => <div key={i} className="mb-2 h-1.5 rounded bg-white/25" style={{ width: w + "%" }} />)}
                <div className="mt-4 h-2 w-12 rounded bg-sky-300" />{[85, 60].map((w, i) => <div key={i} className="mt-2 h-1.5 rounded bg-white/25" style={{ width: w + "%" }} />)}
              </div>
            </div>
          </div>
          <p className="mt-6 text-xs uppercase tracking-[.3em] text-slate-500">Raw information → AI processing → Structured intelligence</p>
        </section>
        <section className="mx-auto grid max-w-5xl gap-3 px-5 pb-16 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(([t, d]) => <div key={t} className="glass rounded-2xl p-5"><h3 className="font-display text-lg text-amber-200">{t}</h3><p className="mt-1 text-sm text-slate-300">{d}</p></div>)}
        </section>
        <section id="how" className="mx-auto max-w-5xl px-5 pb-16">
          <h2 className="mb-6 text-center font-display text-3xl">How it works</h2>
          <ol className="grid gap-3 sm:grid-cols-4">{steps.map((s, i) => <li key={s} className="glass rounded-2xl p-5"><span className="font-display text-3xl text-sky-300">{i + 1}</span><p className="mt-1">{s}</p></li>)}</ol>
        </section>
        <section className="mx-auto max-w-5xl px-5 pb-24 text-center"><h2 className="font-display text-3xl">Turn information into clarity.</h2><div className="mt-6"><CTA /></div></section>
      </main>
    </div>
  );
}
