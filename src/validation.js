const CHANNELS = ['email', 'sms'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{7,14}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateNotification(body) {
  const errors = [];
  const b = body && typeof body === 'object' ? body : {};
  const { channel, recipient, subject, body: text } = b;

  if (!CHANNELS.includes(channel)) errors.push(`channel must be one of: ${CHANNELS.join(', ')}`);
  if (typeof recipient !== 'string' || !recipient) {
    errors.push('recipient is required');
  } else if (channel === 'email' && !EMAIL_RE.test(recipient)) {
    errors.push('recipient must be a valid email address');
  } else if (channel === 'sms' && !E164_RE.test(recipient)) {
    errors.push('recipient must be a phone number in E.164 format, e.g. +919876543210');
  }
  if (typeof text !== 'string' || !text.trim()) errors.push('body is required');
  else if (text.length > 2000) errors.push('body must be at most 2000 characters');
  if (channel === 'email') {
    if (typeof subject !== 'string' || !subject.trim()) errors.push('subject is required for email');
    else if (subject.length > 200) errors.push('subject must be at most 200 characters');
  }

  return {
    errors,
    value: { channel, recipient, subject: subject || null, body: text },
  };
}

module.exports = { validateNotification, UUID_RE };
