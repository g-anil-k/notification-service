function createStore(cfg) {
  if (cfg.storeType === 'postgres') {
    const PgStore = require('./pgStore');
    return new PgStore(cfg.databaseUrl);
  }
  const MemoryStore = require('./memoryStore');
  return new MemoryStore();
}

module.exports = { createStore };
