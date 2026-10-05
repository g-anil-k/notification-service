// In-memory broker: same interface as RabbitBroker. Used for local dev (zero setup) and tests.
class MemoryBroker {
  constructor() {
    this.handler = null;
    this.queue = [];
    this.dead = []; // dead-letter "queue", inspectable in tests
    this.timers = new Set();
    this.inflight = 0;
  }

  async connect() {}
  async close() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  async publish(msg) {
    this.queue.push(msg);
    this._drain();
  }

  async publishRetry(msg, delayMs) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      this.publish(msg);
    }, delayMs);
    this.timers.add(t);
  }

  async publishDead(msg, reason) {
    this.dead.push({ msg, reason });
  }

  async consume(handler) {
    this.handler = handler;
    this._drain();
  }

  _drain() {
    if (!this.handler) return;
    while (this.queue.length) {
      const msg = this.queue.shift();
      this.inflight++;
      Promise.resolve()
        .then(() => this.handler(msg))
        .catch(() => this.publishRetry(msg, 50)) // infra error: redeliver, like a nack+requeue
        .finally(() => this.inflight--);
    }
  }

  // Test helper: resolves once nothing is queued, in flight, or waiting on a retry timer.
  async idle() {
    while (this.queue.length || this.inflight || this.timers.size) {
      await new Promise((r) => setTimeout(r, 5));
    }
  }
}

module.exports = MemoryBroker;
