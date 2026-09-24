"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { apiFetch } from "../../lib/api-client";
import { Activity, ArrowUpRight, Check, ChevronDown, Clock3, Copy, FileText, LogOut, Menu, ShieldAlert, Sparkles, Trash2, Upload, X, Search } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";

type Report = {
  red_alerts: { severity: string; title: string; detail: string; deadline?: string }[];
  executive_brief: string;
  commitment_matrix: { owner: string; commitment: string; deadline?: string; status: string }[];
  chronological_timeline: { date: string; event: string }[];
  dependencies_and_blockers: string[];
  agreed_decisions: string[];
  financial_terms: string[];
  open_questions: string[];
  stakeholders: { name: string; role: string }[];
  sentiment_audit: string;
  next_agenda: string[];
  verifiable_quotes: { speaker: string; quote: string }[];
};

const emptyReport: Report = {
  red_alerts: [], executive_brief: "", commitment_matrix: [], chronological_timeline: [],
  dependencies_and_blockers: [], agreed_decisions: [], financial_terms: [], open_questions: [],
  stakeholders: [], sentiment_audit: "", next_agenda: [], verifiable_quotes: []
};

function TiltCardWrapper({ children }: { children: React.ReactNode }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseXSpring = useSpring(x, { stiffness: 400, damping: 30 });
  const mouseYSpring = useSpring(y, { stiffness: 400, damping: 30 });
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    x.set(mouseX / width - 0.5);
    y.set(mouseY / height - 0.5);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="h-full"
    >
      <div style={{ transform: "translateZ(40px)", transformStyle: "preserve-3d" }} className="h-full">
        {children}
      </div>
    </motion.div>
  );
}

function Card({ title, icon, children, delay = 0 }: { title: string; icon: React.ReactNode; children: React.ReactNode; delay?: number }) {
  const [open, setOpen] = useState(true);
  return (
    <TiltCardWrapper>
      <motion.section 
        initial={{ opacity: 0, y: 30, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: delay * 0.1, type: "spring", stiffness: 100 }}
        className="glass rounded-3xl p-5 h-full transition hover:border-white/40 hover:shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:bg-white/[.04]"
      >
        <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)}>
          <span className="flex items-center gap-3 text-sm font-medium text-white/90 drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">{icon}{title}</span>
          <ChevronDown className={`h-4 w-4 text-white/30 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-5 text-sm leading-6 text-white/60 overflow-hidden"
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </TiltCardWrapper>
  );
}

function List({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-white/25">Nothing detected.</span>;
  return (
    <ul className="space-y-3">
      {items.map((x, i) => (
        <motion.li 
          key={i} 
          initial={{ opacity: 0, x: -10 }} 
          animate={{ opacity: 1, x: 0 }} 
          transition={{ delay: i * 0.05 }}
          className="border-l-2 border-white/10 pl-3 hover:border-white/50 hover:text-white transition-colors cursor-default"
        >
          {x}
        </motion.li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const [text, setText] = useState("");
  const [fileData, setFileData] = useState<{name: string, content: string, lines: number, chars: number} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<Report | null>(null);
  
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<{completed: number, total: number} | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  
  const [history, setHistory] = useState<any[]>([]);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState("");
  const pollInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const session = localStorage.getItem("trove_session");
    if (!session) location.href = "/";
    fetchHistory();
    return () => { if (pollInterval.current) clearInterval(pollInterval.current); };
  }, []);
  
  const fetchHistory = async () => {
    try {
      const r = await apiFetch("/api/v1/reports");
      if (r.ok) setHistory(await r.json());
    } catch (e) {}
  };

  const lines = useMemo(() => text ? text.split(/\r?\n/).length : 0, [text]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const lines = content.split(/\r?\n/).length;
      setFileData({ name: file.name, content, lines, chars: content.length });
      setText("");
    };
    reader.readAsText(file);
  };

  async function analyze() {
    const payload = fileData ? fileData.content : text;
    if (!payload.trim() || status === "processing" || status === "pending") return;
    setStatus("pending");
    setErrorMsg("");
    setReport(null);
    setProgress(null);
    
    try {
      const r = await apiFetch("/api/v1/analyze", { method: "POST", body: JSON.stringify({ text: payload }) });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setJobId(data.job_id);
      pollJob(data.job_id);
      fetchHistory();
    } catch (e) { 
      setStatus("error");
      setErrorMsg("Failed to start analysis. Check connection."); 
    }
  }
  
  function pollJob(id: string) {
    if (pollInterval.current) clearInterval(pollInterval.current);
    
    pollInterval.current = setInterval(async () => {
      try {
        const r = await apiFetch(`/api/v1/jobs/${id}`);
        if (!r.ok) return;
        const data = await r.json();
        
        setStatus(data.status);
        setProgress(data.progress);
        
        if (data.status === "completed") {
          setReport(data.report || emptyReport);
          clearInterval(pollInterval.current!);
          fetchHistory();
        } else if (data.status === "failed") {
          setErrorMsg(data.error_message || "Analysis failed during processing.");
          clearInterval(pollInterval.current!);
        }
      } catch (e) { }
    }, 2000);
  }

  function signOut() {
    localStorage.removeItem("trove_session");
    location.href = "/";
  }

  async function deleteReport(id: string) {
    await apiFetch(`/api/v1/reports/${id}`, { method: "DELETE" });
    setHistory(x => x.filter(r => r.id !== id));
    if (jobId === id) {
      setReport(null);
      setJobId(null);
      setStatus(null);
    }
  }
  
  async function loadReport(id: string) {
    if (pollInterval.current) clearInterval(pollInterval.current);
    const q = await apiFetch(`/api/v1/reports/${id}`); 
    if (q.ok) { 
      const d = await q.json(); 
      setReport(d.structured_data || emptyReport);
      setJobId(id);
      setStatus("completed");
      setProgress(null);
    }
  }

  const filteredHistory = history.filter(h => h.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <main className="min-h-screen bg-[#050507] overflow-x-hidden perspective-1000">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/10 blur-[120px] mix-blend-screen" />
      </div>
      <div className="noise" />

      <header className="sticky top-0 z-50 border-b border-white/[.07] bg-[#050507]/60 backdrop-blur-3xl transition-all hover:bg-[#050507]/80">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex items-center gap-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-black font-black shadow-[0_0_20px_rgba(255,255,255,0.3)]">T</div>
            <div>
              <div className="text-sm font-bold tracking-wide">Trove</div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-medium">Intelligence OS</div>
            </div>
          </motion.div>
          <button onClick={() => setMenu(!menu)} className="rounded-xl border border-white/10 p-2.5 text-white/60 transition hover:bg-white/10 hover:text-white">
            <Menu className="h-5 w-5" />
          </button>
        </div>
        <AnimatePresence>
          {menu && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -10 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="absolute right-6 top-20 glass rounded-2xl p-2 z-50 min-w-[150px] shadow-[0_0_40px_rgba(0,0,0,0.5)]"
            >
              <button onClick={signOut} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white w-full transition-colors">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-6 px-6 py-8 lg:grid-cols-[400px_1fr] relative z-10">
        <aside className="flex flex-col gap-6 lg:sticky lg:top-28 h-fit">
          <TiltCardWrapper>
            <div className="glass rounded-3xl p-6 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="mb-6 flex items-center justify-between relative z-10">
                <span className="text-[11px] font-bold uppercase tracking-[.25em] text-white/40">Input console</span>
                <FileText className="h-4 w-4 text-white/30" />
              </div>
              
              <div className="relative z-10">
                {fileData ? (
                  <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="h-56 w-full flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/20 bg-white/5 p-6 text-center backdrop-blur-sm">
                    <FileText className="h-10 w-10 text-blue-400 mb-4 drop-shadow-[0_0_15px_rgba(96,165,250,0.5)]" />
                    <div className="text-base font-semibold">{fileData.name}</div>
                    <div className="text-xs text-white/50 mt-2 font-mono">{fileData.lines.toLocaleString()} lines · {fileData.chars.toLocaleString()} chars</div>
                    <button onClick={() => setFileData(null)} className="mt-5 text-xs font-bold uppercase tracking-wider text-red-400 hover:text-red-300 transition-colors">Remove File</button>
                  </motion.div>
                ) : (
                  <div className="relative group/textarea">
                    <textarea 
                      value={text} 
                      onChange={e => setText(e.target.value)} 
                      placeholder="Paste a conversation, email thread, meeting notes…" 
                      className="h-56 w-full resize-none rounded-2xl border border-white/10 bg-black/40 p-5 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.02] transition-all duration-300 custom-scrollbar" 
                    />
                    <div className="absolute inset-0 border border-white/20 rounded-2xl pointer-events-none opacity-0 group-focus-within/textarea:opacity-100 transition-opacity duration-300 blur-[2px]" />
                  </div>
                )}
              </div>
              
              {!fileData && (
                <div className="relative z-10 mt-4 flex justify-between text-[11px] font-mono text-white/30 px-1">
                  <span>{lines.toLocaleString()} lines</span><span>{text.length.toLocaleString()} chars</span>
                </div>
              )}

              {!fileData && (
                <div className="relative z-10 mt-5 text-center">
                  <input type="file" accept=".txt,.csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                  <button onClick={() => fileInputRef.current?.click()} className="text-[11px] font-medium tracking-wide text-white/50 hover:text-white transition-colors underline underline-offset-4">
                    Or upload a massive .txt file directly
                  </button>
                </div>
              )}

              <button 
                onClick={analyze} 
                disabled={status === "processing" || status === "pending" || (!text.trim() && !fileData)} 
                className="relative z-10 mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 text-sm font-bold text-black transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:scale-100 disabled:hover:shadow-none overflow-hidden group/btn"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/10 to-transparent -translate-x-[100%] group-hover/btn:animate-[shimmer_1.5s_infinite]" />
                {(status === "processing" || status === "pending") ? <Activity className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} 
                {(status === "processing" || status === "pending") ? "Extracting Intelligence…" : "Analyze Intelligence"}
              </button>
            </div>
          </TiltCardWrapper>
          
          <TiltCardWrapper>
            <div className="glass rounded-3xl p-6 flex-1 max-h-[500px] flex flex-col relative overflow-hidden group">
              <div className="mb-5 flex items-center justify-between text-[11px] font-bold uppercase tracking-[.25em] text-white/40">
                History
              </div>
              <div className="mb-5 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <input type="text" placeholder="Search insights..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs font-medium outline-none text-white focus:border-white/30 focus:bg-white/[0.02] transition-all" />
              </div>
              <div className="space-y-2.5 overflow-y-auto flex-1 pr-2 custom-scrollbar">
                <AnimatePresence>
                  {filteredHistory.length ? filteredHistory.map((r, i) => (
                    <motion.div 
                      key={r.id} 
                      initial={{ opacity: 0, y: 10 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ delay: i * 0.05 }}
                      className="group/item flex items-center justify-between rounded-xl px-4 py-3 bg-white/[0.02] hover:bg-white/[0.06] border border-transparent hover:border-white/10 transition-all cursor-pointer shadow-sm hover:shadow-md"
                    >
                      <button onClick={() => loadReport(r.id)} className="min-w-0 text-left flex-1">
                        <div className="truncate text-sm text-white/90 font-medium group-hover/item:text-white transition-colors">{r.title}</div>
                        <div className="text-[10px] text-white/40 mt-1 font-medium tracking-wide">
                          {new Date(r.created_at).toLocaleString()} {r.status !== 'completed' ? `· ${r.status}` : ''}
                        </div>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteReport(r.id); }} className="p-2 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover/item:opacity-100 transition-all">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </motion.div>
                  )) : <div className="text-xs font-medium text-white/30 text-center py-8">No history found.</div>}
                </AnimatePresence>
              </div>
            </div>
          </TiltCardWrapper>
        </aside>

        <section className="space-y-6 relative">
          <AnimatePresence mode="wait">
            {(status === "pending" || status === "processing") && (
              <motion.div 
                key="processing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass min-h-[600px] rounded-3xl p-10 flex flex-col items-center justify-center text-center relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.1)_0%,transparent_50%)] animate-pulse" />
                <motion.div 
                  animate={{ rotate: 360 }} 
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  className="relative z-10"
                >
                  <Activity className="h-12 w-12 text-blue-400 drop-shadow-[0_0_20px_rgba(96,165,250,0.8)]" />
                </motion.div>
                <h2 className="mt-8 text-2xl font-bold tracking-tight text-white drop-shadow-md relative z-10">Deep Analyzing Dataset...</h2>
                {progress && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-sm font-medium text-white/60 tracking-wide relative z-10">
                    Extracting chunk {progress.completed} of {progress.total}
                  </motion.p>
                )}
                <div className="mt-10 w-full max-w-lg h-2 bg-black/50 rounded-full overflow-hidden border border-white/10 relative z-10">
                   <div className="h-full bg-gradient-to-r from-blue-600 to-indigo-400 rounded-full transition-all duration-700 ease-out shadow-[0_0_15px_rgba(96,165,250,0.5)]" style={{width: progress?.total ? `${(progress.completed / progress.total) * 100}%` : '5%'}} />
                </div>
                <p className="mt-10 max-w-md text-xs font-medium leading-relaxed text-white/40 relative z-10">
                  Trove is securely mapping deterministic references, building timelines, and discovering hidden dependencies in a 3D graph representation.
                </p>
              </motion.div>
            )}
            
            {status === "error" && (
               <motion.div 
                 key="error"
                 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                 className="glass min-h-[400px] rounded-3xl p-10 flex flex-col items-center justify-center text-center border-2 border-red-500/30 shadow-[0_0_50px_rgba(239,68,68,0.1)] relative overflow-hidden"
               >
                 <div className="absolute inset-0 bg-red-500/5 animate-pulse" />
                 <ShieldAlert className="h-12 w-12 text-red-400 mb-6 drop-shadow-[0_0_20px_rgba(248,113,113,0.8)] relative z-10" />
                 <h2 className="text-xl font-bold text-red-200 tracking-wide relative z-10">Analysis Failed</h2>
                 <p className="mt-3 text-sm font-medium text-red-200/70 max-w-md relative z-10">{errorMsg}</p>
                 <button onClick={analyze} className="mt-8 px-6 py-3 bg-red-500/10 hover:bg-red-500/20 hover:scale-105 active:scale-95 text-red-200 font-bold text-sm rounded-xl transition-all border border-red-500/30 relative z-10">
                   Retry Analysis
                 </button>
               </motion.div>
            )}

            {status !== "pending" && status !== "processing" && status !== "error" && !report && (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="glass min-h-[700px] rounded-3xl p-10 flex items-center justify-center text-center relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                <div className="relative z-10">
                  <motion.div 
                    whileHover={{ scale: 1.1, rotate: 5 }} 
                    className="mx-auto grid h-20 w-20 place-items-center rounded-2xl border-2 border-white/10 bg-white/[.02] shadow-[0_0_30px_rgba(255,255,255,0.05)] backdrop-blur-md transition-all"
                  >
                    <Upload className="h-8 w-8 text-white/40 group-hover:text-white group-hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] transition-all" />
                  </motion.div>
                  <h2 className="mt-8 text-2xl font-bold tracking-tight text-white/90">The Intelligence Layer is Empty</h2>
                  <p className="mt-4 max-w-lg mx-auto text-sm font-medium leading-relaxed text-white/40">
                    Paste your scattered data on the left. Trove will synthesize unstructured noise into an interactive, spatial map of insights.
                  </p>
                </div>
              </motion.div>
            )}
            
            {report && (
              <motion.div 
                key="report"
                initial={{ opacity: 0, y: 50 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ duration: 0.6, staggerChildren: 0.1 }}
                className="space-y-6 pb-20"
              >
                {report.executive_brief && (
                  <TiltCardWrapper>
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="glass rounded-3xl p-8 md:p-10 relative overflow-hidden group"
                    >
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-50" />
                      <div className="mb-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[.2em] text-white/60">
                        <Sparkles className="h-5 w-5 text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.8)] animate-pulse" /> 
                        Executive Brief
                      </div>
                      <p className="text-lg sm:text-xl font-medium leading-relaxed text-white/90 drop-shadow-sm">{report.executive_brief}</p>
                    </motion.div>
                  </TiltCardWrapper>
                )}
                
                {report.red_alerts.length > 0 && (
                  <div className="space-y-4">
                    {report.red_alerts.map((a, i) => (
                      <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        key={i} 
                        className="relative overflow-hidden rounded-3xl border border-red-500/30 bg-red-950/30 p-6 flex items-start gap-4 shadow-[0_0_40px_rgba(239,68,68,0.15)] group"
                      >
                        <div className="absolute inset-0 bg-red-500/5 group-hover:bg-red-500/10 transition-colors" />
                        <ShieldAlert className="mt-1 h-6 w-6 text-red-400 shrink-0 drop-shadow-[0_0_15px_rgba(248,113,113,0.8)] relative z-10" />
                        <div className="relative z-10">
                          <div className="text-base font-bold text-red-100 tracking-wide">{a.title}</div>
                          <p className="mt-2 text-sm font-medium leading-relaxed text-red-200/80">{a.detail}</p>
                          {a.deadline && (
                            <span className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/20 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-red-200 shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                              <Clock3 className="h-3 w-3" /> DEADLINE: {a.deadline}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
                
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 items-start relative z-10">
                  <Card delay={1} title="Action Center" icon={<Check className="h-5 w-5 text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.8)]" />}>
                    {report.commitment_matrix.length ? (
                      <div className="space-y-4">
                        {report.commitment_matrix.map((x, i) => (
                          <motion.div whileHover={{ scale: 1.02 }} key={i} className="rounded-2xl bg-black/40 p-4 border border-white/10 hover:border-emerald-500/30 transition-all shadow-inner">
                            <div className="text-white/90 font-medium leading-relaxed">{x.commitment}</div>
                            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider">
                              <span className="bg-white/10 text-white/80 px-2.5 py-1 rounded-md">{x.owner}</span>
                              {x.deadline && <span className="bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-md border border-amber-500/30">{x.deadline}</span>}
                              <span className={`px-2.5 py-1 rounded-md border ${x.status.toLowerCase() === 'completed' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/30'}`}>
                                {x.status}
                              </span>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : <span>No commitments detected.</span>}
                  </Card>
                  
                  <Card delay={2} title="Chronological Timeline" icon={<Clock3 className="h-5 w-5 text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.8)]" />}>
                    {report.chronological_timeline.length ? (
                      <div className="space-y-6 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-[2px] before:bg-gradient-to-b before:from-blue-500/50 before:via-white/20 before:to-transparent pt-2">
                        {report.chronological_timeline.map((x, i) => (
                          <motion.div 
                            initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            key={i} 
                            className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                          >
                            <div className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-white/20 bg-black text-white/50 group-[.is-active]:bg-blue-950 group-[.is-active]:border-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.4)] shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-colors" />
                            <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2rem)] p-4 rounded-2xl bg-black/40 border border-white/10 hover:border-blue-500/30 transition-all hover:shadow-[0_0_20px_rgba(96,165,250,0.1)]">
                              <time className="mb-2 block text-xs font-bold uppercase tracking-wider text-blue-400">{x.date}</time>
                              <div className="text-sm font-medium text-white/80 leading-relaxed">{x.event}</div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : <span>No dated events detected.</span>}
                  </Card>
                  
                  <Card delay={3} title="Dependencies & Blockers" icon={<X className="h-5 w-5 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.8)]" />}>
                    <List items={report.dependencies_and_blockers} />
                  </Card>
                  
                  <Card delay={4} title="Agreed Decisions" icon={<Check className="h-5 w-5 text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.8)]" />}>
                    <List items={report.agreed_decisions} />
                  </Card>
                  
                  <Card delay={5} title="Financial Terms" icon={<ArrowUpRight className="h-5 w-5 text-indigo-400 drop-shadow-[0_0_10px_rgba(129,140,248,0.8)]" />}>
                    <List items={report.financial_terms} />
                  </Card>
                  
                  <Card delay={6} title="Open Questions" icon={<Activity className="h-5 w-5 text-purple-400 drop-shadow-[0_0_10px_rgba(192,132,252,0.8)]" />}>
                    <List items={report.open_questions} />
                  </Card>
                  
                  <Card delay={7} title="Stakeholders Map" icon={<Sparkles className="h-5 w-5 text-pink-400 drop-shadow-[0_0_10px_rgba(244,114,182,0.8)]" />}>
                    {report.stakeholders.length ? (
                      <div className="flex flex-wrap gap-3">
                        {report.stakeholders.map((x, i) => (
                          <motion.span 
                            whileHover={{ scale: 1.05, y: -2 }}
                            key={i} 
                            className="inline-flex flex-col rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent px-4 py-2.5 shadow-sm"
                          >
                            <span className="text-sm font-bold text-white/90">{x.name}</span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white/50 mt-1">{x.role}</span>
                          </motion.span>
                        ))}
                      </div>
                    ) : <span>No stakeholders detected.</span>}
                  </Card>
                  
                  <Card delay={8} title="Sentiment Audit" icon={<Activity className="h-5 w-5 text-rose-400 drop-shadow-[0_0_10px_rgba(251,113,133,0.8)]" />}>
                    <div className="text-base font-medium leading-relaxed text-white/80 p-2 italic border-l-2 border-rose-500/50 bg-rose-500/5 rounded-r-xl">
                      {report.sentiment_audit || "No sentiment signal detected."}
                    </div>
                  </Card>
                  
                  <Card delay={9} title="Next Agenda" icon={<ArrowUpRight className="h-5 w-5 text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]" />}>
                    <List items={report.next_agenda} />
                  </Card>
                  
                  <Card delay={10} title="Verifiable Quotes" icon={<Copy className="h-5 w-5 text-white/70" />}>
                    {report.verifiable_quotes.length ? (
                      <div className="space-y-5">
                        {report.verifiable_quotes.map((x, i) => (
                          <motion.blockquote 
                            whileHover={{ x: 5 }}
                            key={i} 
                            className="border-l-4 border-white/20 pl-4 bg-white/[0.02] py-3 pr-3 rounded-r-xl"
                          >
                            <div className="text-sm font-medium leading-relaxed text-white/90 italic">"{x.quote}"</div>
                            <footer className="mt-3 text-[10px] font-bold uppercase tracking-widest text-white/50">— {x.speaker}</footer>
                          </motion.blockquote>
                        ))}
                      </div>
                    ) : <span>No quotable statements detected.</span>}
                  </Card>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        .perspective-1000 {
          perspective: 1000px;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}} />
    </main>
  );
}