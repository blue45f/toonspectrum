# Studio asset upload integrity — 2026-09-06

## Scope

Follow-up inspection of the existing uploader used after asset intake (including
PRs #775 and #776). This change fixes byte transport, GLB/VRM probing and ID
collision termination. It does not download, license, approve, publish or add
any Dontdraw/ACON originals. Production APIs and stored works were not mutated.

Base: `dbd5e75a207950b00360516a4353af872ff67e60`.
The original uploader was reconstructed and matched Git blob
`97097439cd0b84129b26a5053147aec646837833` before editing.

## Fixes

- Construct each multipart Blob from an exact copied Uint8Array view, not a
  pooled Node Buffer's entire backing ArrayBuffer. Small files and offset views
  now retain their exact length and SHA-256 with no neighbouring bytes.
- Read GLB chunk type at byte 16 and JSON at byte 20. Use unsigned DataView reads
  relative to the input view, check total/chunk lengths and alignment, and reject
  malformed UTF-8/JSON. Both VRM 0.x and VRMC_vrm markers are recognised. This is
  a marker probe, **not** complete glTF validation, rig validation or visual QA.
- Advance collision suffixes using an incrementing counter and the original
  candidate. Long names no longer repeat an occupied truncated candidate
  forever. Non-colliding IDs and the first hash suffix remain unchanged.
- Export the actual helpers and guard CLI startup so importing them in tests
  cannot create a work or make a network request. The direct CLI still runs.

## Executed local verification

Runtime: Node v22.16.0; the repository requires Node 24 CI separately.

The original implementation with **only** helper exports and an inert-import
entry guard added reproduced **15 failures out of 35 tests**. No product fix was
applied in that baseline. The patched implementation passed **35/35**, with no
skips or cancellations. Both syntax checks passed.

Coverage includes nine byte sizes from 0 to 65,536, offset views and mutation
isolation, VRM/VRMC_vrm markers, malformed headers and UTF-8, every truncated
prefix of a fixture, existing type-selection semantics, 250 repeated long-name
collisions in a timeout-bounded child, inert import and offline dry-run. A real
CLI subprocess sends concurrent PNG/GLB multipart requests to a loopback HTTP
fixture. The receiver checks exact lengths, SHA-256, elementType and descriptor;
these are synthetic fixtures, not production assets or a deployed API E2E.

```sh
node --experimental-strip-types --check scripts/upload-toonstudio-3d-assets.mts
node --check scripts/upload-toonstudio-3d-assets.test.mjs
node --experimental-strip-types --test scripts/upload-toonstudio-3d-assets.test.mjs
pnpm exec vitest run scripts/upload-toonstudio-3d-assets.test.mjs
```

The read-only workflow executes Node 24, scoped zero-warning lint and the same
contracts in root Vitest. Existing required `core`, branch protection and other
checks are unchanged. Local passes do not establish their remote outcome.

## Remaining integration boundary

The legacy uploader still does not persist extra intake provenance fields.
Keep intake sidecars and complete the public catalogue provenance/access-control
integration before exposing licensed originals. These fixes do not claim that
integration is complete. Full Studio insert/save/export, actual source visual
quality, operator credentials and production deployment are not verified here.

## Primary format references

- Node Buffer byteOffset/backing store: https://nodejs.org/api/buffer.html#bufbyteoffset
- Khronos GLB structure: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification
