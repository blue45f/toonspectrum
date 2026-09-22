# Local private storage acceptance for captured review ZIPs

Status: **verified on current `origin/main` on 2026-09-23**. This QA extends the authored
full Host probe with a real loopback TLS object store and an isolated, freshly prepared
PostgreSQL test database. It does not configure or deploy production R2/B2, alter hosted
infrastructure, or broaden product authorization.

## Scope

The entry point is `scripts/verify-virtual-studio-review-storage.mts`. It exercises the real
browser, API, Core save path, PostgreSQL persistence, review decision endpoint, signed object
reads and product ZIP export. Capture prepare/status/page/complete requests are not mocked.
The browser authors two pages with real pen input before requesting a review capture.

Each run owns a random `codex-vs-review-storage-<12-hex>` MinIO container, matching volume,
private source/derived/export buckets, one-day local CA, server certificate and run-specific
credentials. MinIO binds only to a loopback port, has a 512 MiB / 1 CPU limit and exposes no
console port. The verifier checks ownership labels before cleanup and never removes unrelated
containers, volumes, image caches, system certificates, `.env` files or production settings.

PostgreSQL must be an explicitly selected QA container. The accepted forms are:

- the legacy dedicated container `codex-virtual-studio-host-pg-20260920`; or
- a fresh container named `codex-review-storage-test-pg-<10 lowercase hex>` with label
  `io.toonspectrum.qa.review-storage-postgres=true`.

The verifier requires one loopback port, an exact PostgreSQL 16 QA image, and a
`TEST_DATABASE_URL` whose port, database and user match that container. A fresh database must
first be prepared with `scripts/prepare-studio-review-test-db.mjs`; this applies the current
realtime, asset, live-lock, Studio AI and review migrations plus the Studio invariant triggers.
The caller owns and removes this PostgreSQL container after the run.

## Pinned local object-store dependencies

| Purpose | Pinned image |
| --- | --- |
| MinIO | `quay.io/minio/minio@sha256:9966a92a734f9411e32f4f41d7d9d826fcdc0f68c4e20b70295bd4e7c11f8a2f` |
| mc | `quay.io/minio/mc@sha256:37d109dddbbb2c95873f5fc81ac93f37023264770fc580a7564148892087b1b7` |

The verifier does not pull or update images. These digests are isolated synthetic-data QA
dependencies, not production recommendations.

OpenSSL creates a private CA and IP-SAN leaf without installing trust on the host. Full CA
material remains in the OS temporary directory. Because Colima does not share macOS `/tmp`
reliably, only the server certificate, server private key and public CA are copied into a hidden,
run-owned directory beneath the QA output and mounted read-only. The CA private key is never
mounted into MinIO. API and independent GET probes validate the same public CA; Chromium trusts
only the run's leaf SPKI for the loopback endpoint.

## Acceptance assertions

- The strict storage option rejects HTTP, non-loopback or implicit origins, privileged/reserved
  ports, userinfo/path/query/fragment, extra fields, symlink certificates and invalid CA/leaf
  pairs. Parent storage credentials and arbitrary CA settings are not inherited.
- All private purpose buckets reject anonymous listing. Review objects reject unsigned reads,
  while server-issued signed URLs return the canonical bytes and origin-specific CORS headers.
- The source revision and gateway sequence come from real authoring and save. Capture does not
  rewrite the source revision.
- The server canonicalizes PNGs. Input byte hashes may change, but decoded dimensions, authored
  stroke samples, margins, two-times scale and pixels must remain identical.
- Approval uses the product's two-step UI and real graph decision endpoint. ZIP export performs
  permission rechecks, signed fetches, checksum validation and worker-based archive generation.
  ZIP PNG bytes must equal canonical object-store bytes and the manifest must not contain signed
  URLs, credentials, comment text or roster details.
- A post-completion replacement of ordinal 0 with different page bytes must return HTTP 409.
  The completed receipt, signed object hashes, metadata and canonical bytes must remain unchanged.
- API, Vite, Chromium, MinIO, mc, the MinIO volume and temporary certificate directories must
  close or be removed. `local-storage-resources.json` records cleanup without secret values.

## Reproduce

Create a disposable PostgreSQL 16 container with the isolated naming pattern, ownership label
and one random loopback port. Export its URL only in the invoking shell; do not store credentials
in this document, logs or evidence.

```sh
  pnpm exec node scripts/prepare-studio-review-test-db.mjs

STUDIO_QA_LOCAL_STORAGE=true \
STUDIO_QA_OWNED_POSTGRES='codex-review-storage-test-pg-<10-hex>' \
STUDIO_QA_OUTPUT='.qa/virtual-studio-review-storage' \
pnpm exec tsx scripts/verify-virtual-studio-review-storage.mts
```

Remove the disposable PostgreSQL container after the verifier has exited. No hosted service,
remote build, paid runner or deployment is part of this procedure.

## Verified result

The 2026-09-23 integrated run completed real pen authoring, PostgreSQL save, TLS MinIO upload,
canonical signed readback, pixel comparison, review approval, ZIP export and immutable-completion
rejection. Anonymous object access was denied, foreign-origin CORS was omitted, and cleanup
removed all run-owned MinIO resources and certificate directories. The successful report is
`.qa/virtual-studio-review-storage-reconcile-20260923/report.json` relative to the validation
worktree.

During this run, the browser's valid one-field/one-file multipart upload exposed a Busboy boundary
condition: `parts: 2` emitted `partsLimit` after parsing both expected parts. The controller now
keeps `fields: 1` and `files: 1` while reserving a sentinel slot with `parts: 3`; a focused test
locks that contract.
