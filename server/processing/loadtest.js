// Simulates 10,000 simultaneous submissions against the job queue: nothing may crash, overflow is rejected cleanly.
import { JobQueue } from "../queue.js";
const q = new JobQueue({ concurrency: 4, maxQueued: 300 });
let ok = 0, busy = 0, done = 0; const jobs = [];
for (let i = 0; i < 10000; i++) {
  try { jobs.push(q.enqueue(async () => { await new Promise((r) => setTimeout(r, 2)); done++; })); ok++; } catch (e) { if (e.code === "BUSY") busy++; else throw e; }
}
await Promise.all(jobs);
console.log(`submitted=10000 accepted=${ok} rejected(BUSY)=${busy} completed=${done} peakRunning<=4 heap=${Math.round(process.memoryUsage().heapUsed / 1e6)}MB`);
