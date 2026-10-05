const { createEmailChannel } = require('./email');
const { createSmsChannel } = require('./sms');

function createChannels(cfg) {
  return { email: createEmailChannel(cfg), sms: createSmsChannel(cfg) };
}

module.exports = { createChannels };
