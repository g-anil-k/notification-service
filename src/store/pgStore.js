const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const toModel = (r) =>
  r && {
    id: r.id,
    channel: r.channel,
    recipient: r.recipient,
    subject: r.subject,
    body: r.body,
    status: r.status,
    attempts: r.attempts,
    lastError: r.last_error,
    idempotencyKey: r.idempotency_key,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };

// Only these fields may be updated, and they map to fixed column names (no SQL injection surface).
const UPDATABLE = { status: 'status', attempts: 'attempts', lastError: 'last_error' };

class PgStore {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString });
  }

  async init() {
    const sql = fs.readFileSync(path.join(__dirname, '../../db/schema.sql'), 'utf8');
    await this.pool.query(sql);
  }

  async close() {
    await this.pool.end();
  }

  async create(n) {
    const ins = await this.pool.query(
      `INSERT INTO notifications (id, channel, recipient, subject, body, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [n.id, n.channel, n.recipient, n.subject, n.body, n.idempotencyKey || null]
    );
    if (ins.rows.length) return { notification: toModel(ins.rows[0]), created: true };
    const existing = await this.pool.query('SELECT * FROM notifications WHERE idempotency_key=$1', [
      n.idempotencyKey,
    ]);
    return { notification: toModel(existing.rows[0]), created: false };
  }

  async get(id) {
    const r = await this.pool.query('SELECT * FROM notifications WHERE id=$1', [id]);
    return toModel(r.rows[0]) || null;
  }

  async list({ status, limit = 50 } = {}) {
    const r = status
      ? await this.pool.query(
          'SELECT * FROM notifications WHERE status=$1 ORDER BY created_at DESC LIMIT $2',
          [status, limit]
        )
      : await this.pool.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT $1', [limit]);
    return r.rows.map(toModel);
  }

  async update(id, patch) {
    const sets = [];
    const vals = [];
    for (const [k, col] of Object.entries(UPDATABLE)) {
      if (k in patch) {
        vals.push(patch[k]);
        sets.push(`${col}=$${vals.length}`);
      }
    }
    if (!sets.length) return this.get(id);
    vals.push(id);
    const r = await this.pool.query(
      `UPDATE notifications SET ${sets.join(', ')}, updated_at=now() WHERE id=$${vals.length} RETURNING *`,
      vals
    );
    return toModel(r.rows[0]) || null;
  }
}

module.exports = PgStore;
