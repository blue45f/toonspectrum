# Studio live-lock revision v1 cutover

`0017_creator_work_live_lock_revision.sql` changes the short-lived Studio edit-lock protocol from
unordered lease rows to a per-work monotonic revision stream. It is a coordinated cutover, not a
normal rolling `drizzle-kit push` change.

The migration never deletes a work, page, drawing, CRDT update, comment, or asset. On its first
successful application it deliberately removes only `creator_work_live_lock` rows, whose maximum
lease is 30 seconds, so every open editor must reacquire its transient edit lock.

## Preconditions

1. Use a direct PostgreSQL endpoint. Do not use a transaction-pooler URL.
2. Stop or scale to zero every API instance that can accept Studio WebSocket traffic.
3. Confirm no deployment or one-off process is running the old lock repository.
4. Keep the API drained until the postconditions below pass.

The migration takes `ACCESS EXCLUSIVE` locks on the live-lock table, its clock, and the migration
ledger. Running it while Studio writers are active can block requests and allows an old process to
resume with an incompatible write after the transaction commits. The new `revision` column has no
default, so such an old insert fails closed, but the deployment must still be treated as failed.

## Fresh database

Provision the schema and run both realtime SQL migrations before starting the API:

```bash
pnpm exec drizzle-kit push --force
psql "$STUDIO_LIVE_POSTGRES_URL" -v ON_ERROR_STOP=1 \
  -f lib/db/migrations/0009_socket_io_postgres_adapter.sql
psql "$STUDIO_LIVE_POSTGRES_URL" -v ON_ERROR_STOP=1 \
  -f lib/db/migrations/0017_creator_work_live_lock_revision.sql
```

On a fresh Drizzle schema there are no legacy leases to evict. The second command establishes the
durable `0017_creator_work_live_lock_revision` ledger row used by API boot and future retries.

## Existing database upgrade

With all Studio API writers stopped:

```bash
psql "$STUDIO_LIVE_POSTGRES_URL" -v ON_ERROR_STOP=1 \
  -f lib/db/migrations/0017_creator_work_live_lock_revision.sql
```

Do not run `drizzle-kit push --force` as a substitute. It can create the final column shape but
cannot provide the one-time lease eviction, high-water backfill, or durable cutover ledger.

## Required postconditions

Run this check through the same direct endpoint before starting an API instance:

```sql
DO $verification$
DECLARE
  revision_not_null boolean;
  revision_default text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "toonspectrum_schema_migration"
    WHERE "id" = '0017_creator_work_live_lock_revision'
  ) THEN
    RAISE EXCEPTION 'live-lock revision migration ledger row is missing';
  END IF;

  SELECT
    attribute.attnotnull,
    pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid)
  INTO revision_not_null, revision_default
  FROM pg_catalog.pg_attribute AS attribute
  LEFT JOIN pg_catalog.pg_attrdef AS default_record
    ON default_record.adrelid = attribute.attrelid
   AND default_record.adnum = attribute.attnum
  WHERE attribute.attrelid = '"creator_work_live_lock"'::regclass
    AND attribute.attname = 'revision'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  IF revision_not_null IS DISTINCT FROM true OR revision_default IS NOT NULL THEN
    RAISE EXCEPTION 'live-lock revision must be NOT NULL with no default';
  END IF;

  IF to_regclass('creator_work_live_lock_clock') IS NULL THEN
    RAISE EXCEPTION 'live-lock revision clock table is missing';
  END IF;
END
$verification$;
```

The API performs the same essential checks during boot and refuses Studio traffic when the
cutover is incomplete.

## Start and smoke test

1. Start only revision-aware API instances from the release containing migration `0017`.
2. Open the same work in two browser sessions.
3. Acquire one page or element lock in the first session and confirm the second session sees the
   owner immediately.
4. Renew and release the lock, then confirm the second session can acquire it.
5. Reconnect one session and confirm the JOIN snapshot does not regress or restore the old lease.

## Retry and rollback

Reapplying `0017` is supported. The migration ledger prevents another lease eviction, while the
clock is only moved forward. Removing the informational column comment does not change that
behavior.

Do not roll only the API binary back to a pre-revision version: old inserts intentionally fail
against the no-default `revision` column. If an emergency binary rollback is unavoidable, stop all
writers, roll back the frontend and API together, delete the transient lock rows, make `revision`
nullable, and remove the ledger row so a later forward migration performs a fresh cutover:

```sql
BEGIN;
LOCK TABLE "creator_work_live_lock", "toonspectrum_schema_migration"
  IN ACCESS EXCLUSIVE MODE;
DELETE FROM "creator_work_live_lock";
ALTER TABLE "creator_work_live_lock" ALTER COLUMN "revision" DROP NOT NULL;
DELETE FROM "toonspectrum_schema_migration"
WHERE "id" = '0017_creator_work_live_lock_revision';
COMMIT;
```

The preferred recovery is a forward fix; the rollback procedure exists only to restore an older
binary's ability to create nullable legacy lease rows.
