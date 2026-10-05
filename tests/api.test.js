const request = require('supertest');
const { buildSystem, validEmail } = require('./helpers');

describe('POST /notifications', () => {
  test('accepts a valid email with 202 and QUEUED/processed status', async () => {
    const { app, broker } = await buildSystem();
    const res = await request(app).post('/notifications').send(validEmail);
    expect(res.status).toBe(202);
    expect(res.body.id).toBeDefined();
    await broker.idle();
  });

  test.each([
    [{ ...validEmail, channel: 'pigeon' }, 'channel'],
    [{ ...validEmail, recipient: 'not-an-email' }, 'email'],
    [{ ...validEmail, subject: '' }, 'subject'],
    [{ channel: 'sms', recipient: '12345', body: 'hi' }, 'E.164'],
    [{}, 'channel'],
  ])('rejects invalid payload %#', async (payload, fragment) => {
    const { app } = await buildSystem();
    const res = await request(app).post('/notifications').send(payload);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.errors)).toContain(fragment);
  });

  test('rejects malformed JSON with 400', async () => {
    const { app } = await buildSystem();
    const res = await request(app).post('/notifications').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
  });

  test('Idempotency-Key prevents duplicate sends', async () => {
    const { app, broker, calls } = await buildSystem();
    const a = await request(app).post('/notifications').set('Idempotency-Key', 'abc').send(validEmail);
    const b = await request(app).post('/notifications').set('Idempotency-Key', 'abc').send(validEmail);
    await broker.idle();
    expect(a.status).toBe(202);
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    expect(calls).toHaveLength(1);
  });
});

describe('GET /notifications', () => {
  test('404 for unknown or malformed id', async () => {
    const { app } = await buildSystem();
    expect((await request(app).get('/notifications/not-a-uuid')).status).toBe(404);
    expect((await request(app).get('/notifications/6f1c2c52-6a0e-4d6e-8a3a-0f6f0a1b2c3d')).status).toBe(404);
  });

  test('lists by status and validates the filter', async () => {
    const { app, broker } = await buildSystem();
    await request(app).post('/notifications').send(validEmail);
    await broker.idle();
    const sent = await request(app).get('/notifications?status=SENT');
    expect(sent.body).toHaveLength(1);
    expect((await request(app).get('/notifications?status=NOPE')).status).toBe(400);
  });
});
