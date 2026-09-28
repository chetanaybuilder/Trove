// Bounded FIFO job queue: at most `concurrency` jobs run, at most `maxQueued` wait; beyond that callers get BUSY (HTTP 503) instead of overloading the server.
export class JobQueue {
  constructor({ concurrency = 4, maxQueued = 300 } = {}) { Object.assign(this, { concurrency, maxQueued, running: 0, q: [] }); }
  get depth() { return this.q.length; }
  enqueue(fn, onPosition = () => {}) {
    if (this.q.length >= this.maxQueued) throw Object.assign(new Error("busy"), { code: "BUSY" });
    return new Promise((resolve, reject) => { this.q.push({ fn, resolve, reject, onPosition }); this.#pump(); this.#notify(); });
  }
  #notify() { this.q.forEach((j, i) => j.onPosition(i + 1)); }
  #pump() {
    while (this.running < this.concurrency && this.q.length) {
      const j = this.q.shift(); this.running++;
      Promise.resolve().then(j.fn).then(j.resolve, j.reject).finally(() => { this.running--; this.#pump(); this.#notify(); });
    }
  }
}
