-- Cross-instance Socket.IO packets that exceed PostgreSQL NOTIFY's payload budget (or contain
-- binary data) are stored here briefly by ToonSpectrum's lifecycle-safe PostgreSQL transport. This
-- is transport scratch space, not authoritative collaboration state; the transport removes expired rows on its cleanup
-- interval. The index keeps that cleanup bounded as the realtime workload grows.

BEGIN;

CREATE TABLE IF NOT EXISTS "socket_io_attachments" (
  "id" bigserial PRIMARY KEY,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" bytea NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_socket_io_attachments_created_at"
  ON "socket_io_attachments" ("created_at");

COMMIT;
