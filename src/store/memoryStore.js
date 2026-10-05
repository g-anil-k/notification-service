// In-memory store: used for local dev and tests. Same interface as PgStore.
class MemoryStore {
  constructor() {
    this.items = new Map();
    this.keys = new Map(); // idempotencyKey -> id
  }

  async init() {}
  async close() {}

  async create(n) {
    if (n.idempotencyKey && this.keys.has(n.idempotencyKey)) {
      return { notification: this.items.get(this.keys.get(n.idempotencyKey)), created: false };
    }
    const now = new Date().toISOString();
    const record = {
      id: n.id,
      channel: n.channel,
      recipient: n.recipient,
      subject: n.subject,
      body: n.body,
      status: 'QUEUED',
      attempts: 0,
      lastError: null,
      idempotencyKey: n.idempotencyKey || null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(record.id, record);
    if (n.idempotencyKey) this.keys.set(n.idempotencyKey, record.id);
    return { notification: { ...record }, created: true };
  }

  async get(id) {
    const r = this.items.get(id);
    return r ? { ...r } : null;
  }

  async list({ status, limit = 50 } = {}) {
    return [...this.items.values()]
      .filter((r) => !status || r.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async update(id, patch) {
    const r = this.items.get(id);
    if (!r) return null;
    Object.assign(r, patch, { updatedAt: new Date().toISOString() });
    return { ...r };
  }
}

module.exports = MemoryStore;
