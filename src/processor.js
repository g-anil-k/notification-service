const defaultLogger = require('./logger');

/**
 * Core delivery logic, independent of RabbitMQ/Postgres so it is easy to unit test.
 * Queue messages carry only { id }; the database is the source of truth.
 *
 * Delivery is at-least-once, so the processor is idempotent: terminal states are skipped.
 */
function createProcessor({ store, broker, channels, maxAttempts, retryBaseDelayMs, logger = defaultLogger }) {
  async function giveUp(n, attempts, reason) {
    await store.update(n.id, { status: 'FAILED', attempts, lastError: reason });
    await broker.publishDead({ id: n.id }, reason);
    logger.warn('notification moved to dead-letter queue', { id: n.id, attempts, reason });
  }

  return async function process(msg) {
    const n = await store.get(msg.id);
    if (!n) return logger.warn('notification not found, dropping message', { id: msg.id });
    if (n.status === 'SENT' || n.status === 'FAILED') return; // duplicate delivery

    const channel = channels[n.channel];
    if (!channel) return giveUp(n, n.attempts, `Unsupported channel: ${n.channel}`);

    await store.update(n.id, { status: 'PROCESSING' });
    const attempts = n.attempts + 1;

    try {
      await channel.send(n);
      await store.update(n.id, { status: 'SENT', attempts, lastError: null });
      logger.info('notification sent', { id: n.id, attempts });
    } catch (err) {
      if (err.permanent) return giveUp(n, attempts, err.message);
      if (attempts >= maxAttempts) return giveUp(n, attempts, `Max attempts reached: ${err.message}`);

      const delay = retryBaseDelayMs * 2 ** (attempts - 1); // exponential backoff
      await store.update(n.id, { status: 'RETRYING', attempts, lastError: err.message });
      await broker.publishRetry({ id: n.id }, delay);
      logger.warn('send failed, retry scheduled', { id: n.id, attempts, delayMs: delay, err: err.message });
    }
  };
}

module.exports = { createProcessor };
