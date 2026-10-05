const { createMockSender } = require('./mock');

// Plug a real provider (Twilio, AWS SNS, MSG91...) in here. Keep the same { send(n) } shape.
function createSmsChannel(cfg) {
  return createMockSender('sms', cfg.mockFailureRate);
}

module.exports = { createSmsChannel };
