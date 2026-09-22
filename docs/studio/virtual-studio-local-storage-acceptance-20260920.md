# Local private storage acceptance for captured review ZIPs

Status: implementation prepared; the actual storage/browser run has not yet been executed.
This QA extends the [authored full Host probe](virtual-studio-review-host-authored-evidence-20260920.md).
It does not configure or deploy production R2/B2, replace authorization, or certify the full
edit-comment-recapture-resolution workflow; that workflow remains a separate acceptance task.

## Scope and ownership

The entry point is `scripts/verify-virtual-studio-review-storage.mts`. It reuses actual pen
authoring, login, Core, PostgreSQL and the shared gateway save from the Host verifier. Unlike
the original fixture mode, every capture prepare/status/page/complete request reaches the real
API. It then drives explicit review approval and the original-image ZIP download in product UI.

Each run owns a random `codex-vs-review-storage-<12-hex>` container, a matching `-data` volume,
private source/derived/export buckets, and a `toonspectrum-review-storage-qa-*` temporary
certificate directory. Docker is restricted to an existing local Unix-socket context. MinIO
binds only `127.0.0.1:59963` by default, has a 512 MiB / 1 CPU limit, and does not expose a
console port. Resource names and labels are verified before cleanup. Unrelated containers,
volumes, image caches, system certificates, production settings and `.env` files are not removed
or changed. The images remain as local cached QA dependencies after the run.

The existing dedicated PostgreSQL container `codex-virtual-studio-host-pg-20260920` was stopped
at inspection and maps only `127.0.0.1:59962`. The verifier requires explicit selection of this
exact container and a matching loopback test database. It records the container ID and prior
running state, starts it only if stopped, and restores that state after the run. It never removes
the existing PG volume, resets a database or runs migrations; its disposable fixture rows remain
in that QA database. The runtime requires an already migrated test/QA database.

## Exact local dependencies

Primary source releases and registry manifest inspection identify these ARM64 images:

| Purpose | Official release | Pinned image |
| --- | --- | --- |
| MinIO | [2025-09-07 release](https://github.com/minio/minio/releases/tag/RELEASE.2025-09-07T16-13-09Z) | `quay.io/minio/minio@sha256:9966a92a734f9411e32f4f41d7d9d826fcdc0f68c4e20b70295bd4e7c11f8a2f` |
| mc | [2025-08-13 release](https://github.com/minio/mc/releases/tag/RELEASE.2025-08-13T08-35-41Z) | `quay.io/minio/mc@sha256:37d109dddbbb2c95873f5fc81ac93f37023264770fc580a7564148892087b1b7` |

The later MinIO `2025-10-15` source release exists, but its equivalent Quay tag returned no
manifest during this inspection. The selected older image is an isolated synthetic-data QA
dependency, not a production recommendation or a claim of current security support. Both
images were explicitly pulled by digest; the verifier does not pull or update images itself.

MinIO uses its documented [certificate directory](https://github.com/minio/minio/blob/master/docs/tls/README.md)
with a new one-day local CA and an IP-SAN leaf certificate. OpenSSL creates these files without
installing trust on the host. The API receives only this CA through `NODE_EXTRA_CA_CERTS`;
independent object GETs validate the same CA. A fresh Chromium process accepts only the leaf's
SPKI for the local QA endpoint; it does not enable global certificate-error suppression or
change the application's HTTPS validators. [CORS](https://github.com/minio/minio/blob/master/docs/config/README.md)
is limited to the existing `127.0.0.1:5181` and `:5173` QA origins.

## Acceptance assertions

- The strict QA storage option rejects HTTP, non-loopback/implicit/privileged origins,
  userinfo/path/query/fragment, shared API ports, arbitrary extra environment fields,
  non-owned certificate directories, symlink certificates and an invalid CA/leaf pair.
  Parent storage credentials and arbitrary CA settings remain excluded by default.
- All three private purpose buckets must reject anonymous listing. Every accepted review
  page must also reject unsigned GET while the real server-issued signed GET succeeds.
  A successful signed GET must return ACAO for the exact QA origin and omit ACAO for an
  unrelated origin; the foreign-origin probe never makes an outbound connection to that origin.
- The source revision and nonzero gateway sequence come from actual authoring and save.
  Capture never rewrites the source. Server canonical receipts, persisted review identity,
  signed GET bytes and ZIP entries must agree.
- The server intentionally reconstructs each PNG and adds page identity. Input byte hashes
  may differ from stored byte hashes; decoded pixels, dimensions, authored-stroke samples,
  margins and 2x scale must remain intact. Evidence preserves both inputs and stored originals.
- Approval uses the actual two-step UI and actual graph decision endpoint. ZIP export uses
  the product's permission rechecks, signed URLs, checksum validation and archive Worker.
  The ZIP's PNG bytes must equal the server-canonical S3 GET bytes exactly. Its manifest must
  contain no signed URL, credentials, comment text or roster details.
- After approval/export, one actual API request tries to replace completed ordinal 0 with the
  different authored page 1 PNG. The existing head pin must return HTTP 409; the completed
  receipt, fresh signed object hashes and canonical bytes must remain unchanged. GET metadata
  also confirms the immutable cache policy, purpose, digest and length. This API rejection
  occurs before storage, so it does not claim to execute the S3 conditional PUT conflict/HEAD branch.
- The owned API, Vite, Chromium, MinIO, mc container, volume and temporary certificates must
  close or be removed. `local-storage-resources.json` records cleanup without credential values.

## Reproduce

After coordinating a browser/API/PostgreSQL resource slot and supplying only the dedicated
test database URL:

```sh
STUDIO_QA_LOCAL_STORAGE=true \
  STUDIO_QA_OWNED_POSTGRES=codex-virtual-studio-host-pg-20260920 \
  STUDIO_QA_OUTPUT=.qa/virtual-studio-review-storage \
  pnpm exec tsx scripts/verify-virtual-studio-review-storage.mts
pnpm exec vitest run scripts/studio-review-local-storage-config.test.ts scripts/isolated-market-api.test.ts
```

Do not put a database password or storage credentials in this document or the evidence report.
No hosted service, remote build, paid runner or deployment is part of this procedure.

## Current verification

The configuration and existing isolated-API regression tests passed: **21 tests / 2 files**.
Scoped ESLint and `git diff --check` passed. Dependencies were installed with
`pnpm install --offline --frozen-lockfile` under Node 24.16 / pnpm 11.4. The worktree uses
TypeScript 6.0.3 and its `tsconfig.json` is byte-identical to the source worktree. The latter's
existing incremental cache was inspected but was not copied or used for a compile here.
Full Web/API typechecks are pending the coordinated integrated revision; no files or checks
are excluded. Heavy runtime execution is also pending coordination; there is no actual
storage/capture/approval/ZIP success claim yet.
