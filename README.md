# Notification Service

An event-driven notification service built with **Node.js, Express, RabbitMQ and PostgreSQL**.
Clients submit email/SMS notifications over a REST API; delivery happens asynchronously in
workers with **exponential-backoff retries**, a **dead-letter queue**, and **idempotent** processing.

## Architecture

```
                 202 Accepted
Client ── POST /notifications ──► API ──► PostgreSQL  (status: QUEUED)
                                   │
                                   ▼ publish {id}
                             ┌───────────┐
                             │ main queue│◄─────────────┐ TTL expires
                             └─────┬─────┘              │
                                   ▼                    │
                         Worker(s) (scale out)    ┌─────┴──────┐
                          │  read row by id       │ retry queue│ (delay = base x 2^n)
                          │  send via channel     └─────▲──────┘
                          ├─ success ─► status SENT     │
                          ├─ transient error ───────────┘ status RETRYING
                          └─ permanent error / max attempts ─► DLQ, status FAILED
```

Status lifecycle: `QUEUED → PROCESSING → SENT`, or `PROCESSING → RETRYING → ... → FAILED`

## Run it

**Zero setup (in-memory broker and store, handy for development):**
```bash
npm install
npm start                 # API + worker in one process on :3000
npm test
```

**Full stack (RabbitMQ + PostgreSQL + API + worker):**
```bash
docker compose up --build
docker compose up --build --scale worker=3   # run 3 competing workers
```
RabbitMQ management UI: http://localhost:15672 (guest / guest). Watch the `notifications`,
`notifications.retry.*` and `notifications.dlq` queues while you send traffic.

## API

```bash
# Send (Idempotency-Key is optional but recommended)
curl -X POST localhost:3000/notifications \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: order-1042-confirmation' \
  -d '{"channel":"email","recipient":"user@example.com","subject":"Order confirmed","body":"Thanks!"}'

curl localhost:3000/notifications/<id>          # check status
curl 'localhost:3000/notifications?status=FAILED&limit=20'
curl localhost:3000/health
```
SMS: `{"channel":"sms","recipient":"+919876543210","body":"Your OTP is 4821"}`

| Code | Meaning |
|------|---------|
| 202  | Accepted and queued |
| 200  | Duplicate request (same `Idempotency-Key`); original returned, nothing re-sent |
| 400  | Validation error |
| 503  | Could not enqueue (safe to retry) |

## Try the failure handling

Set `MOCK_FAILURE_RATE=0.7` and send a few messages: logs show retries with growing delays.
Use a recipient starting with `invalid` (e.g. `invalid@example.com`) to trigger a **permanent**
failure that skips retries and goes straight to the DLQ.

## Design decisions

- **Queue carries only the notification id**: the database is the source of truth, so messages stay small and a retry always sees current state.
- **At-least-once delivery + idempotent processor**: terminal states (`SENT`, `FAILED`) are skipped, so redelivered messages don't double-send.
- **Idempotency-Key on the API** (unique DB constraint): client retries can't create duplicate notifications.
- **Transient vs permanent errors**: only transient ones are retried (`PermanentError`).
- **One retry queue per delay value** with a queue-level TTL that dead-letters back to the main queue. This avoids the head-of-line blocking you get from per-message TTLs in one queue.
- **Pluggable broker / store / channels** behind small interfaces, so the whole pipeline is testable in memory without infrastructure.
- **API and worker scale independently** (`ROLE=api|worker`).

## Known limitations (good talking points / next steps)

- **Dual write**: the row is saved and then the message published. If the process dies in between, a row stays `QUEUED` forever. Fix: transactional **outbox pattern** plus a relay, or a sweeper that re-enqueues stale `QUEUED` rows.
- A worker crash mid-send can cause a duplicate send (inherent to at-least-once delivery).
- No auth or rate limiting on the API; no metrics endpoint.
- Email/SMS providers are mocks unless SMTP is configured; plug in Twilio/SNS in `src/channels/sms.js`.
- The RabbitMQ and PostgreSQL adapters are exercised by the Docker stack, not by unit tests. Integration tests with Testcontainers would close that gap.

## Ideas to extend

Outbox pattern · Prometheus `/metrics` (queue depth, send latency, failure rate) · DLQ replay endpoint ·
templates with variables · per-recipient rate limiting · webhooks for delivery status · TypeScript migration ·
GitHub Actions CI running `npm test` and a Docker build.

## Project structure

```
src/app.js          Express routes + validation          src/processor.js   delivery / retry / DLQ logic
src/server.js       Wiring, ROLE handling, shutdown      src/broker/        memory + RabbitMQ adapters
src/channels/       email (SMTP/mock), sms (mock)        src/store/         memory + PostgreSQL adapters
tests/              API + delivery-flow tests            db/schema.sql      table + index
```
