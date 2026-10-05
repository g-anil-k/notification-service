// Permanent errors (e.g. invalid recipient) are never retried. Everything else is treated as transient.
class PermanentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermanentError';
    this.permanent = true;
  }
}

module.exports = { PermanentError };
