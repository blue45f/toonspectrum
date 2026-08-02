# OpenCascade WASM LGPL boundary

ToonSpectrum uses the unmodified npm package `opencascade.js@1.1.1`, which
declares `LGPL-2.1-only`. It is an optional industrial-CAD execution provider;
ToonSpectrum's document, mesh, command, history, and interchange schemas do not
depend on an OCCT object layout.

## Corresponding source and license

- Package source: <https://github.com/donalffons/opencascade.js>
- OpenCascade Technology source: <https://github.com/Open-Cascade-SAS/OCCT>
- Resolved package version: `1.1.1`
- Exact upstream OCCT commit identified by the package:
  `33d9a6fa21ca4fa711da7066655aa2ba854545ee`
- Exact commit source:
  <https://git.dev.opencascade.org/gitweb/?p=occt.git;a=commit;h=33d9a6fa21ca4fa711da7066655aa2ba854545ee>
- pnpm/npm artifact integrity:
  `sha512-lw6/vOl86+CkJ8d3V01mlbGAC0A49gc1HbwGcqGeKjk5SGRLiF15jyUuA8aYEvizcPNTu4Ta4A+Ut2DJgsa7AQ==`
- Installed `dist/opencascade.wasm.wasm` SHA-256:
  `6cc2f3fa1611d32ad7563f7092aa1bf58741124302630cef7d21561ecd7b7284`
- License expression: `LGPL-2.1-only`
- Packaged license text: `node_modules/opencascade.js/LICENSE`
- Release notice: `dist/legal/THIRD_PARTY_NOTICES.generated.md`

The release notice generator records the exact resolved package, upstream URL,
license expression, and license text. Production builds fail when that inventory
or this reviewed direct-dependency version drifts.

## Independent loading and replacement

The Vite product build emits the OCCT JavaScript factory and
`opencascade.wasm.wasm` as independently emitted, separate lazy assets. They are fetched only after an
industrial CAD operation is requested; they are not statically linked into the
Studio shell or its canonical file format. Node/Vitest loading lives behind a
separate Node-only module and is absent from the browser manifest.

The distributed binary is the upstream-published npm artifact. ToonSpectrum did
not rebuild OCCT, change its Emscripten/build flags, or modify its source. The
package README identifies the exact upstream OCCT commit above; the lockfile
integrity and installed WASM checksum seal the reviewed input. No ToonSpectrum
object file is statically linked into OCCT. The provider remains replaceable at
the dependency and adapter boundary.

To use a compatible modified build:

1. Fork the package source and build its JavaScript factory and WASM binary.
2. Keep the public Embind API used by `studio-occt-wasm-facade.ts`, or update that
   replaceable adapter for the new ABI.
3. Point the `opencascade.js` dependency/override in `package.json` or the pnpm
   workspace override at the modified package.
4. Run `pnpm install`, `pnpm run audit:licenses`, the OCCT focused tests, and
   `pnpm run build`.
5. Publish the modified library's corresponding source and add a dated
   modification notice to this document and the release notice.

No ToonSpectrum artwork or project migration is required when swapping a
compatible provider. The application receives plain triangle meshes and numeric
mass properties across the adapter boundary.

## Modification record

ToonSpectrum currently distributes `opencascade.js@1.1.1` without source modifications.
Add future changes here with date, commit/source URL, and a concise
description before distributing their binaries.

## Review status

- Engineering provenance, replacement, source-link, license-text, and binary
  checksum gates: complete for the exact artifact recorded above.
- Legal review status: pending final counsel confirmation before a commercial
  production release. This document and its automated gate are evidence controls,
  not a legal opinion.
