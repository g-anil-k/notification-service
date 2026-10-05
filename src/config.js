const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

module.exports = {
  role: process.env.ROLE || 'all', // api | worker | all
  port: num(process.env.PORT, 3000),
  brokerType: process.env.BROKER || 'memory', // memory | rabbitmq
  storeType: process.env.STORE || 'memory', // memory | postgres
  rabbitUrl: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
  databaseUrl: process.env.DATABASE_URL || 'postgres://notify:notify@localhost:5432/notify',
  maxAttempts: num(process.env.MAX_ATTEMPTS, 4),
  retryBaseDelayMs: num(process.env.RETRY_BASE_DELAY_MS, 2000),
  // Demo helper: fraction (0..1) of sends that fail with a transient error.
  mockFailureRate: num(process.env.MOCK_FAILURE_RATE, 0),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'no-reply@example.com',
  },
};
