const MemoryStore = require('../src/store/memoryStore');
const MemoryBroker = require('../src/broker/memoryBroker');
const { createApp } = require('../src/app');
const { createProcessor } = require('../src/processor');

const silent = { info() {}, warn() {}, error() {} };

// Builds the full pipeline (API + queue + worker) in memory with a controllable fake channel.
async function buildSystem({ send, maxAttempts = 3 } = {}) {
  const store = new MemoryStore();
  const broker = new MemoryBroker();
  const calls = [];
  const fakeChannel = {
    send: async (n) => {
      calls.push(n.id);
      if (send) return send(calls.length, n);
    },
  };
  const processor = createProcessor({
    store,
    broker,
    channels: { email: fakeChannel, sms: fakeChannel },
    maxAttempts,
    retryBaseDelayMs: 1,
    logger: silent,
  });
  await broker.consume(processor);
  return { store, broker, app: createApp({ store, broker }), calls };
}

const validEmail = {
  channel: 'email',
  recipient: 'user@example.com',
  subject: 'Hello',
  body: 'Welcome aboard',
};

module.exports = { buildSystem, validEmail };
