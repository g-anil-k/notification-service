function createBroker(cfg) {
  if (cfg.brokerType === 'rabbitmq') {
    const RabbitBroker = require('./rabbitBroker');
    return new RabbitBroker(cfg.rabbitUrl);
  }
  const MemoryBroker = require('./memoryBroker');
  return new MemoryBroker();
}

module.exports = { createBroker };
