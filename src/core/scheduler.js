export class IdleScheduler {
  constructor(options = {}) {
    this.budgetMs = options.budgetMs ?? 16;
    this.idle = options.idle ?? null;
    this.now = options.now ?? (() => Date.now());
    this.queue = [];
    this.pending = new Set();
    this.scheduled = false;
    this.errors = [];
  }

  enqueue(key, fn) {
    if (this.pending.has(key)) {
      const existing = this.queue.find((item) => item.key === key);
      if (existing) {
        existing.fn = fn;
      }
      return false;
    }
    this.pending.add(key);
    this.queue.push({ key, fn });
    this.schedule();
    return true;
  }

  schedule() {
    if (this.scheduled || this.queue.length === 0) return;
    this.scheduled = true;
    const tick = () => this.drain();
    if (typeof this.idle === "function") {
      this.idle(tick);
    } else if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(tick);
    } else if (typeof requestIdleCallback === "function") {
      requestIdleCallback(tick, { timeout: 100 });
    } else {
      setTimeout(tick, 0);
    }
  }

  drain() {
    this.scheduled = false;
    const start = this.now();
    while (this.queue.length > 0) {
      if (this.now() - start > this.budgetMs) {
        this.schedule();
        return;
      }
      const item = this.queue.shift();
      this.pending.delete(item.key);
      try {
        item.fn();
      } catch (error) {
        this.errors.push(error);
        if (this.errors.length > 50) this.errors.shift();
      }
    }
  }

  clear() {
    this.queue = [];
    this.pending.clear();
    this.scheduled = false;
  }

  get size() {
    return this.queue.length;
  }
}
