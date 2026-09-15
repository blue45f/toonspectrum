# ToonStudio production toolchain

## Purpose

The production toolchain extends Studio beyond drawing without adding a new parallel product shell.
Its primary owner is the existing project **Production** stage:

- `pipeline` projects the available production areas and license profile;
- `renders` owns file jobs, progress, cancellation, results and receipts;
- `/studio/toolchain`, `/studio/engines` and `/studio/jobs` are direct projections for discovery and
  troubleshooting.

The stable project remains ToonStudio data. External application objects, process handles and native
project caches are never stored as the canonical manuscript.

## Supported areas

The catalog in `config/studio-production-toolchain.json` currently describes 25 reviewed tools across
12 areas.

| Area | Reviewed tools | Product boundary |
| --- | --- | --- |
| Effects and restoration | G'MIC, GEGL | local final provider; browser preview remains CanvasKit/WebGPU/OpenCV |
| Compositing | Natron | local project renderer |
| Scan and OCR | Tesseract | local OCR text, TSV, hOCR and searchable PDF |
| Vectorization | Potrace, Inkscape | local bitmap-to-SVG and SVG export |
| Animation | OpenToonz, Synfig | local scene renderer |
| Media | FFmpeg | local MP4, WebM, GIF, proxy and frame extraction |
| 3D and backgrounds | Blender, Sweet Home 3D, QGIS, OpenSCAD | Blender/QGIS/OpenSCAD command providers; Sweet Home 3D manual boundary |
| Publishing | Scribus, Ghostscript | Ghostscript bounded PDF operations; Scribus manual boundary |
| References | darktable | local image development |
| Audio and accessibility | eSpeak NG, Rubber Band | local speech/phoneme and time/pitch processing |
| Production operations | Nextcloud, OpenProject, Matrix, Discourse, Matomo | connector catalog only; requires user-owned service configuration |
| Noncommercial research | Mixbox, OpenPose | visible only in the explicit Research NC profile; not executable by default |

“Reviewed” does not mean installed, visually certified or bundled. `/studio/engines` distinguishes
those states and presents the exact local probe result.

## License profiles

### Open

Allows permissive modules and separately executed tools whose obligations can be kept outside the web
bundle. Noncommercial modules stay hidden. A tool being present does not change the license of the
whole repository by itself; release packaging still needs counsel-reviewed evidence.

### Community GPL

Makes copyleft local tools prominent and assumes their corresponding-source and notice obligations
will be fulfilled by the distributor. It does not automatically relicense unrelated assets or closed
service connectors.

### Research NC

Explicitly exposes noncommercial candidates such as Mixbox and OpenPose. They remain non-executable
unless a separately reviewed module or adapter is supplied. This profile must not be used as evidence
that commercial use is permitted.

The selected profile is session-scoped. It is not silently embedded in a manuscript or propagated to
collaborators.

## Job lifecycle

```text
draft
  -> preparing  (server allocated, declared inputs not complete)
  -> queued     (every declared input uploaded and hashed)
  -> running    (one allow-listed child process)
  -> completed  (outputs exist, sizes and SHA-256 verified, receipt created)
  -> failed     (structured code, message and retryability)
  -> cancelled  (explicit user cancellation; no result is promoted)
```

Transitions outside the table are rejected. Progress is monotonic. Restarting the local service turns
unfinished jobs into `SERVICE_RESTARTED` failures rather than completed jobs. The client stores bounded
history in Studio's SQLite/OPFS KV authority and visibly falls back to current-tab memory if durable
storage cannot open.

## Receipt contract

A completed job records:

- exact tool and operation identifiers;
- probed version text;
- SPDX-style license expression and upstream source;
- sanitized command digest with job-directory paths removed;
- SHA-256 digests of every declared input and produced output;
- start and finish timestamps.

The receipt proves which bytes and executable version were observed. It is not a signature, artistic
quality approval or legal warranty.

## Browser-to-local protocol

Protocol name: `toonstudio.production-toolchain`, version `2`.

- settings: HTTPS or loopback HTTP only; no URL credentials, path, query or fragment;
- authentication: URL-safe bearer token with at least 32 characters;
- CORS: exact origin allowlist, no wildcard;
- storage: token in the current tab's `sessionStorage` only;
- upload: bounded streaming PUT into a private job directory;
- execution: reviewed binary plus fixed argument array, always `shell: false`, with job-local `HOME`, temporary and XDG paths;
- output: regular files only, no symbolic links, streamed SHA-256 verification, 2 GiB per file and 4 GiB per job;
- download: authenticated delivery after a fresh streamed hash and size check.

Future float/HDR tiles, multi-output render passes and shared-memory streaming require a new protocol
version. They are not added as unvalidated optional keys to v2.

## Fail-closed limitations

- External programs are not installed automatically.
- Connector-only tools do not claim live API integration without user credentials and service URLs.
- Sweet Home 3D and Scribus are detected but their automatic adapters remain disabled.
- Mixbox and OpenPose remain research-only and disabled.
- Command plans are operational starting points; visual parity, large-corpus performance and each
  upstream version still require dedicated acceptance evidence.
- Environment isolation is not an operating-system sandbox; only trusted local binaries may be enabled.
- No provider silently substitutes another provider or promotes a preview approximation to final.
- No deployment, database migration, production secret or hosted service is created by this feature.

## Verification

```sh
pnpm run test:production-toolchain
pnpm run validate:architecture
pnpm run typecheck
```

The Node suite covers the real HTTP service, not only a mock. The browser suite covers catalog gates,
job transitions, bounded persistence and URL/token transport rules.
