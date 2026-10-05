const amqp = require('amqplib');
const logger = require('../logger');

const MAIN = 'notifications';
const DLQ = 'notifications.dlq';

/**
 * Retry design: one retry queue per delay value, each with a queue-level TTL and a
 * dead-letter route back to the main queue. When a message's TTL expires, RabbitMQ
 * re-routes it to MAIN automatically. (Per-message TTLs in a single queue would suffer
 * head-of-line blocking, because RabbitMQ only expires the message at the head.)
 */
class RabbitBroker {
  constructor(url) {
    this.url = url;
    this.retryQueues = new Set();
  }

  async connect() {
    this.conn = await amqp.connect(this.url);
    this.conn.on('error', (e) => logger.error('rabbitmq connection error', { err: e.message }));
    this.ch = await this.conn.createChannel();
    await this.ch.assertQueue(DLQ, { durable: true });
    await this.ch.assertQueue(MAIN, { durable: true });
  }

  async close() {
    await this.ch?.close();
    await this.conn?.close();
  }

  _send(queue, msg, opts = {}) {
    return this.ch.sendToQueue(queue, Buffer.from(JSON.stringify(msg)), {
      persistent: true,
      contentType: 'application/json',
      ...opts,
    });
  }

  async publish(msg) {
    this._send(MAIN, msg);
  }

  async publishRetry(msg, delayMs) {
    const name = `${MAIN}.retry.${delayMs}ms`;
    if (!this.retryQueues.has(name)) {
      await this.ch.assertQueue(name, {
        durable: true,
        arguments: {
          'x-message-ttl': delayMs,
          'x-dead-letter-exchange': '', // default exchange
          'x-dead-letter-routing-key': MAIN,
        },
      });
      this.retryQueues.add(name);
    }
    this._send(name, msg);
  }

  async publishDead(msg, reason) {
    this._send(DLQ, msg, { headers: { reason: String(reason).slice(0, 500) } });
  }

  async consume(handler) {
    await this.ch.prefetch(10);
    await this.ch.consume(MAIN, async (m) => {
      if (!m) return;
      let msg;
      try {
        msg = JSON.parse(m.content.toString());
      } catch {
        await this.publishDead({ raw: m.content.toString() }, 'unparseable message');
        return this.ch.ack(m);
      }
      try {
        await handler(msg);
        this.ch.ack(m);
      } catch (err) {
        // Only unexpected/infrastructure errors reach here (send failures are handled in the processor).
        logger.error('handler crashed, requeueing', { err: err.message });
        this.ch.nack(m, false, true);
      }
    });
  }
}

module.exports = RabbitBroker;
