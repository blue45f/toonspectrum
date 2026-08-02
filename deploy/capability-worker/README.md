# Capability worker deployment

This image is the purpose-specific container boundary for exact thumbnail work. It does not import
the authoritative database, auth/session, marketplace, CRDT, Socket.IO, QStash or coordination
module graph. Its public surface is limited to process liveness, signed readiness and the fixed v1
gateway endpoint.

## Provider templates

- Render: create a Blueprint from `deploy/capability-worker/render.yaml`.
- Fly: run `fly launch --copy-config --config deploy/capability-worker/fly.toml`, then add secrets.
- Railway: select `deploy/capability-worker/railway.json` as the service config-as-code path.

Each deployment enables only its own provider ID (`render`, `fly` or `railway`). Do not enable
several IDs on one origin or reuse the paid Supabase service-role key as a gateway token. Supply the
matching `BACKEND_<PROVIDER>_BASE_URL`, a unique 32+ character `AUTH_TOKEN`, and the explicit budget
variables shown in the Render/Fly template. Railway variables use the same names with `RAILWAY`.
Gateway tokens must not contain leading/trailing whitespace. The worker authenticates the token and
checks declared transport bytes before JSON parsing, enforces the provider-specific raw-byte ceiling
again on the parser buffer, and does not install JSON/form parsers on public health routes.

All three need these private storage secrets; no `DATABASE_URL` or auth/session secret belongs on a
capability worker:

```text
SUPABASE_OBJECT_STORAGE_ENABLED=true
SUPABASE_OBJECT_STORAGE_URL=https://<project>.supabase.co
SUPABASE_OBJECT_STORAGE_SERVICE_ROLE_KEY=<server-only secret>
SUPABASE_OBJECT_STORAGE_SOURCE_BUCKET=studio-source-assets-v1
SUPABASE_OBJECT_STORAGE_DERIVED_BUCKET=studio-derived-assets-v1
SUPABASE_OBJECT_STORAGE_EXPORT_BUCKET=studio-exports-v1
```

The built-in renderer accepts immutable PNG/JPEG source references, validates exact length and
SHA-256 before decoding, enforces source/output pixel and byte budgets, preserves aspect ratio, and
uploads a content-addressed PNG/JPEG derived object. WebP remains fail-closed until a deterministic
server encoder is installed. Long AI is an explicit command/queue port but is not advertised by the
built-in thumbnail worker.

## Signed canary

The health request sends an HMAC signature, provider and 13-digit timestamp; it never transmits the
gateway token. A full thumbnail canary additionally supplies one existing immutable source object.

```sh
BACKEND_CAPABILITY_CANARY_BASE_URL=https://<worker-origin> \
BACKEND_CAPABILITY_CANARY_PROVIDER=render \
BACKEND_CAPABILITY_CANARY_AUTH_TOKEN='<matching gateway token>' \
pnpm verify:backend-capability-worker
```

Add `BACKEND_CAPABILITY_CANARY_SOURCE_OBJECT_JSON` (the exact private storage reference JSON) and
optionally `BACKEND_CAPABILITY_CANARY_SOURCE_ASSET_ID` to execute the full read/resize/write path.
The canary never prints a URL, token, signed object URL or object body.
