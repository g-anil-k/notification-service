const { createMockSender } = require('./mock');
const { PermanentError } = require('./errors');

function createEmailChannel(cfg) {
  if (!cfg.smtp.host) return createMockSender('email', cfg.mockFailureRate);

  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined,
  });

  return {
    async send(n) {
      try {
        await transport.sendMail({ from: cfg.smtp.from, to: n.recipient, subject: n.subject, text: n.body });
      } catch (err) {
        // SMTP 5xx = permanent rejection; connection problems / 4xx = transient.
        if (err.responseCode >= 500 && err.responseCode < 600) throw new PermanentError(err.message);
        throw err;
      }
    },
  };
}

module.exports = { createEmailChannel };
