const express = require('express');
const { randomUUID } = require('crypto');
const { validateNotification, UUID_RE } = require('./validation');
const logger = require('./logger');

const STATUSES = ['QUEUED', 'PROCESSING', 'RETRYING', 'SENT', 'FAILED'];

const toResponse = (n) => ({
  id: n.id,
  channel: n.channel,
  recipient: n.recipient,
  subject: n.subject,
  status: n.status,
  attempts: n.attempts,
  lastError: n.lastError,
  createdAt: n.createdAt,
  updatedAt: n.updatedAt,
});

function createApp({ store, broker }) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Accept a notification: persist it, enqueue it, respond 202 immediately (async processing).
  app.post('/notifications', async (req, res, next) => {
    try {
      const { errors, value } = validateNotification(req.body);
      if (errors.length) return res.status(400).json({ errors });

      const idempotencyKey = req.get('Idempotency-Key') || null;
      const { notification, created } = await store.create({ id: randomUUID(), ...value, idempotencyKey });

      if (created) {
        try {
          await broker.publish({ id: notification.id });
        } catch (err) {
          logger.error('failed to enqueue', { id: notification.id, err: err.message });
          await store.update(notification.id, { status: 'FAILED', lastError: 'Could not enqueue' });
          return res.status(503).json({ error: 'Could not enqueue notification, please retry' });
        }
      }
      // 202 = newly accepted, 200 = duplicate request (same Idempotency-Key)
      res.status(created ? 202 : 200).json(toResponse(notification));
    } catch (err) {
      next(err);
    }
  });

  app.get('/notifications/:id', async (req, res, next) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
      const n = await store.get(req.params.id);
      if (!n) return res.status(404).json({ error: 'Not found' });
      res.json(toResponse(n));
    } catch (err) {
      next(err);
    }
  });

  app.get('/notifications', async (req, res, next) => {
    try {
      const { status } = req.query;
      if (status && !STATUSES.includes(status)) {
        return res.status(400).json({ errors: [`status must be one of: ${STATUSES.join(', ')}`] });
      }
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      res.json((await store.list({ status, limit })).map(toResponse));
    } catch (err) {
      next(err);
    }
  });

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    logger.error('unhandled error', { err: err.message });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
