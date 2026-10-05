const request = require('supertest');
const { buildSystem, validEmail } = require('./helpers');
const { PermanentError } = require('../src/channels/errors');

async function submitAndWait(sys, payload = validEmail) {
  const res = await request(sys.app).post('/notifications').send(payload);
  await sys.broker.idle();
  return request(sys.app).get(`/notifications/${res.body.id}`).then((r) => r.body);
}

test('happy path: delivered on the first attempt', async () => {
  const sys = await buildSystem();
  const n = await submitAndWait(sys);
  expect(n.status).toBe('SENT');
  expect(n.attempts).toBe(1);
  expect(sys.broker.dead).toHaveLength(0);
});

test('transient failures are retried until success', async () => {
  const sys = await buildSystem({
    maxAttempts: 4,
    send: (callNo) => {
      if (callNo < 3) throw new Error('provider timeout');
    },
  });
  const n = await submitAndWait(sys);
  expect(n.status).toBe('SENT');
  expect(n.attempts).toBe(3);
  expect(n.lastError).toBeNull();
  expect(sys.broker.dead).toHaveLength(0);
});

test('exhausting retries moves the message to the dead-letter queue', async () => {
  const sys = await buildSystem({
    maxAttempts: 3,
    send: () => {
      throw new Error('provider down');
    },
  });
  const n = await submitAndWait(sys);
  expect(n.status).toBe('FAILED');
  expect(n.attempts).toBe(3);
  expect(n.lastError).toMatch(/Max attempts reached/);
  expect(sys.broker.dead).toHaveLength(1);
  expect(sys.broker.dead[0].msg.id).toBe(n.id);
});

test('permanent errors skip retries and go straight to the DLQ', async () => {
  const sys = await buildSystem({
    maxAttempts: 5,
    send: () => {
      throw new PermanentError('mailbox does not exist');
    },
  });
  const n = await submitAndWait(sys);
  expect(n.status).toBe('FAILED');
  expect(n.attempts).toBe(1);
  expect(sys.broker.dead).toHaveLength(1);
});

test('duplicate queue delivery of an already SENT notification is a no-op', async () => {
  const sys = await buildSystem();
  const n = await submitAndWait(sys);
  await sys.broker.publish({ id: n.id }); // simulate at-least-once redelivery
  await sys.broker.idle();
  expect(sys.calls).toHaveLength(1);
});
