const cfg = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');
const { createStore } = require('./store');
const { createBroker } = require('./broker');
const { createChannels } = require('./channels');
const { createProcessor } = require('./processor');

async function main() {
  if (cfg.role === 'all' && (cfg.brokerType === 'memory' || cfg.storeType === 'memory')) {
    logger.info('running with in-memory broker/store: data is lost on restart');
  }
  if (cfg.role !== 'all' && (cfg.brokerType === 'memory' || cfg.storeType === 'memory')) {
    throw new Error('ROLE=api|worker needs BROKER=rabbitmq and STORE=postgres (processes cannot share memory)');
  }

  const store = createStore(cfg);
  const broker = createBroker(cfg);
  await store.init();
  await broker.connect();

  let server;
  if (cfg.role === 'api' || cfg.role === 'all') {
    server = createApp({ store, broker }).listen(cfg.port, () =>
      logger.info('API listening', { port: cfg.port, role: cfg.role })
    );
  }
  if (cfg.role === 'worker' || cfg.role === 'all') {
    const process_ = createProcessor({
      store,
      broker,
      channels: createChannels(cfg),
      maxAttempts: cfg.maxAttempts,
      retryBaseDelayMs: cfg.retryBaseDelayMs,
    });
    await broker.consume(process_);
    logger.info('worker consuming', { maxAttempts: cfg.maxAttempts });
  }

  const shutdown = async (signal) => {
    logger.info('shutting down', { signal });
    server?.close();
    await broker.close();
    await store.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('fatal startup error', { err: err.message });
  process.exit(1);
});
