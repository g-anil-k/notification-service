CREATE TABLE IF NOT EXISTS notifications (
  id               UUID PRIMARY KEY,
  channel          TEXT        NOT NULL,
  recipient        TEXT        NOT NULL,
  subject          TEXT,
  body             TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'QUEUED',
  attempts         INTEGER     NOT NULL DEFAULT 0,
  last_error       TEXT,
  idempotency_key  TEXT UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_status_created
  ON notifications (status, created_at DESC);
