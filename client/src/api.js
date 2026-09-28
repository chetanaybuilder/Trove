export async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: "include", ...opts, headers: { ...(typeof opts.body === "string" ? { "Content-Type": "application/json" } : {}), ...opts.headers } });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw Object.assign(new Error(j.error || "Something went wrong. Please try again."), { status: r.status }); }
  return r.json();
}
/** POST + read an SSE stream from the server. */
export async function streamAnalyze(body, onEvent) {
  const r = await fetch("/api/analyze", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "Could not start the analysis."); }
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const b = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /event: (.*)/.exec(b)?.[1], d = /data: (.*)/.exec(b)?.[1];
      if (ev && d) onEvent(ev, JSON.parse(d));
    }
  }
}
