"use client";

import dynamic from "next/dynamic";
import GoogleSignIn from "../components/GoogleSignIn";
import { Shield, Sparkles, Zap, BrainCircuit, Activity, FileText } from "lucide-react";
import { motion, useScroll, useTransform, useSpring, useMotionValue } from "framer-motion";
import { useRef, useEffect } from "react";

const OrbScene = dynamic(() => import("../components/OrbScene"), { ssr: false });

function MagneticButton({ children, className }: { children: React.ReactNode, className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { damping: 15, stiffness: 150, mass: 0.1 };
  const smx = useSpring(x, springConfig);
  const smy = useSpring(y, springConfig);

  const handleMouse = (e: React.MouseEvent<HTMLDivElement>) => {
    const { clientX, clientY } = e;
    const { height, width, left, top } = ref.current!.getBoundingClientRect();
    const middleX = clientX - (left + width / 2);
    const middleY = clientY - (top + height / 2);
    x.set(middleX * 0.2);
    y.set(middleY * 0.2);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={reset}
      style={{ x: smx, y: smy }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode, delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, rotateX: 20 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, delay, type: "spring", bounce: 0.4 }}
      style={{ transformStyle: "preserve-3d" }}
    >
      {children}
    </motion.div>
  );
}

export default function Home() {
  const { scrollYProgress } = useScroll();
  const yHero = useTransform(scrollYProgress, [0, 1], [0, 400]);
  const opacityHero = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scaleHero = useTransform(scrollYProgress, [0, 0.5], [1, 0.8]);

  // Mouse parallax for background
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 50, damping: 20 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX - window.innerWidth / 2);
      mouseY.set(e.clientY - window.innerHeight / 2);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#050507] text-white perspective-1000">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <motion.div 
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,transparent_0%,rgba(5,5,7,.8)_45%,#050507_100%)]"
          style={{ x: useTransform(springX, [-1000, 1000], [-30, 30]), y: useTransform(springY, [-1000, 1000], [-30, 30]) }}
        />
        <div className="noise opacity-[0.05]" />
      </div>
      
      <div className="fixed inset-0 z-0 mix-blend-screen opacity-60">
        <OrbScene />
      </div>

      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-5 mix-blend-difference backdrop-blur-sm bg-black/10">
        <motion.div 
          initial={{ opacity: 0, x: -30 }} 
          animate={{ opacity: 1, x: 0 }} 
          transition={{ duration: 1, type: "spring" }}
          className="flex items-center gap-4"
        >
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-black font-black shadow-[0_0_20px_rgba(255,255,255,0.4)]">T</div>
          <div>
            <div className="text-sm font-bold tracking-widest uppercase">Trove</div>
          </div>
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, x: 30 }} 
          animate={{ opacity: 1, x: 0 }} 
          transition={{ duration: 1, type: "spring", delay: 0.2 }}
          className="hidden sm:flex text-[10px] font-bold uppercase tracking-[0.4em] text-white/50"
        >
          Intelligence OS
        </motion.div>
      </nav>

      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 pt-20 overflow-hidden" style={{ transformStyle: "preserve-3d" }}>
        <motion.div 
          style={{ y: yHero, opacity: opacityHero, scale: scaleHero }} 
          className="w-full max-w-5xl text-center relative"
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
            className="mx-auto mb-10 inline-flex items-center gap-3 rounded-full border border-blue-500/30 bg-blue-500/10 px-5 py-2 text-xs font-bold tracking-[0.2em] text-blue-200 backdrop-blur-md shadow-[0_0_30px_rgba(59,130,246,0.2)]"
          >
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_10px_rgba(96,165,250,0.8)]" />
            TROVE ENGINE 3.0 LIVE
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 50, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 1, delay: 0.2 }}
            className="glow text-6xl font-black tracking-tighter sm:text-8xl md:text-9xl leading-[0.9]"
            style={{ 
              backgroundImage: "linear-gradient(to bottom right, #fff, #a5b4fc, #3b82f6)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent"
            }}
          >
            Make messages<br /><span className="text-white/20" style={{ WebkitTextFillColor: "rgba(255,255,255,0.2)" }}>think back.</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="mx-auto mt-10 max-w-2xl text-base font-medium leading-relaxed text-white/50 sm:text-lg md:text-xl drop-shadow-md"
          >
            Drop massive, messy conversations into Trove. Extract decisions, commitments,
            deadlines, stakeholders, and risks instantly. Built for scale.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.8, type: "spring" }}
            className="mx-auto mt-14 flex flex-col items-center justify-center gap-6"
          >
            <MagneticButton>
              <div className="relative group rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(255,255,255,0.15)] hover:shadow-[0_0_80px_rgba(255,255,255,0.3)] transition-all duration-500">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 opacity-0 group-hover:opacity-20 transition-opacity duration-500" />
                <GoogleSignIn />
              </div>
            </MagneticButton>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.25em] text-white/40">
              <Shield className="h-3.5 w-3.5 text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]" /> Enterprise-grade privacy isolation
            </p>
          </motion.div>
        </motion.div>
      </section>

      <section className="relative z-20 mx-auto max-w-[1400px] px-6 py-32 sm:py-48">
        <Reveal>
          <div className="text-center mb-24">
            <h2 className="text-4xl font-bold tracking-tight sm:text-6xl bg-gradient-to-r from-white to-white/40 bg-clip-text text-transparent">Intelligence at scale.</h2>
            <p className="mt-6 text-lg font-medium text-white/40 max-w-2xl mx-auto">Transform thousands of unstructured messages into structured insights.</p>
          </div>
        </Reveal>
        
        <div className="grid gap-8 md:grid-cols-3 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-purple-500/5 rounded-full blur-[150px] -z-10" />
          
          <Reveal delay={0.1}>
            <MagneticButton className="h-full">
              <div className="glass h-full rounded-[40px] p-10 transition-all duration-500 hover:bg-white/[.06] hover:-translate-y-2 border border-white/10 hover:border-blue-500/30 group">
                <div className="h-16 w-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] transition-all">
                  <BrainCircuit className="h-8 w-8 text-blue-400" />
                </div>
                <h3 className="text-2xl font-bold text-white group-hover:text-blue-200 transition-colors">Deterministic Extraction</h3>
                <p className="mt-4 text-base font-medium leading-relaxed text-white/50 group-hover:text-white/70 transition-colors">Maps commitments, financial terms, and open questions with high-precision chunk processing.</p>
              </div>
            </MagneticButton>
          </Reveal>
          
          <Reveal delay={0.3}>
            <MagneticButton className="h-full">
              <div className="glass h-full rounded-[40px] p-10 transition-all duration-500 hover:bg-white/[.06] hover:-translate-y-2 border border-white/10 hover:border-amber-500/30 group">
                <div className="h-16 w-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:shadow-[0_0_30px_rgba(245,158,11,0.3)] transition-all">
                  <Zap className="h-8 w-8 text-amber-400" />
                </div>
                <h3 className="text-2xl font-bold text-white group-hover:text-amber-200 transition-colors">Massive Ingestion</h3>
                <p className="mt-4 text-base font-medium leading-relaxed text-white/50 group-hover:text-white/70 transition-colors">Process 30,000+ messages effortlessly. Deduplicated, chunked, and Map-Reduced in the background.</p>
              </div>
            </MagneticButton>
          </Reveal>
          
          <Reveal delay={0.5}>
            <MagneticButton className="h-full">
              <div className="glass h-full rounded-[40px] p-10 transition-all duration-500 hover:bg-white/[.06] hover:-translate-y-2 border border-white/10 hover:border-emerald-500/30 group">
                <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all">
                  <Activity className="h-8 w-8 text-emerald-400" />
                </div>
                <h3 className="text-2xl font-bold text-white group-hover:text-emerald-200 transition-colors">Chronological Timeline</h3>
                <p className="mt-4 text-base font-medium leading-relaxed text-white/50 group-hover:text-white/70 transition-colors">Automatically builds a verified timeline of events and dependencies from scattered logs.</p>
              </div>
            </MagneticButton>
          </Reveal>
        </div>
      </section>
      
      <footer className="relative z-20 border-t border-white/[.05] bg-[#050507] py-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-blue-900/10 to-transparent pointer-events-none" />
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-6 px-6 sm:flex-row relative z-10">
          <div className="flex items-center gap-3 text-sm font-medium text-white/40">
            <div className="h-6 w-6 rounded-md bg-white/10 border border-white/20 flex items-center justify-center font-black text-[10px] text-white">T</div>
            Trove Intelligence © 2026
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/30">
            End-to-End Privacy Architecture
          </div>
        </div>
      </footer>
      <style dangerouslySetInnerHTML={{__html: `
        .perspective-1000 { perspective: 1000px; }
      `}} />
    </main>
  );
}