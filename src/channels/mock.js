const logger = require('../logger');
const { PermanentError } = require('./errors');

// Console "provider" used when no real provider is configured.
// - recipients starting with "invalid" fail permanently (demo of non-retryable errors)
// - MOCK_FAILURE_RATE makes a fraction of sends fail transiently (demo of retries + DLQ)
function createMockSender(kind, failureRate) {
  return {
    async send(n) {
      if (n.recipient.startsWith('invalid') || n.recipient.startsWith('+0')) {
        throw new PermanentError(`Recipient rejected by provider: ${n.recipient}`);
      }
      if (Math.random() < failureRate) throw new Error('Simulated transient provider failure');
      logger.info(`[mock ${kind}] delivered`, { to: n.recipient, subject: n.subject, id: n.id });
    },
  };
}

module.exports = { createMockSender };
