# ToonStudio Local ToonBridge v2

`tools/toonbridge` is the local, separately executed boundary for production tools that must not be
mixed into the Vite bundle. It accepts only exact-origin, bearer-authenticated requests from the
Studio UI and runs reviewed command plans with `shell: false`.

## What it does

- probes exact external executables and reports missing/manual/connector/research states;
- streams declared input files into one private directory per job;
- rejects size or SHA-256 mismatches before execution;
- builds arguments from an operation allowlist rather than accepting arbitrary commands;
- limits concurrent processes, runtime, logs, captured output and retained jobs;
- streams output hashing with a 2 GiB per-file and 4 GiB per-job ceiling;
- records tool version, upstream source, license, input/output hashes and a sanitized command digest;
- marks interrupted work as failed after a service restart instead of claiming completion.

It does **not** install, download or redistribute G'MIC, GEGL, Natron, Tesseract, Inkscape,
OpenToonz, Synfig, FFmpeg, Blender, QGIS, OpenSCAD, Ghostscript, darktable, eSpeak NG,
Rubber Band or any other external program. Their original licenses and installation channels remain
separate.

## Start

```sh
export TOONBRIDGE_TOKEN="$(openssl rand -hex 24)"
export TOONBRIDGE_ALLOWED_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"
pnpm run toonbridge
```

Open `/studio/engines` and enter the loopback URL and token. The token is stored only in the
current browser tab's `sessionStorage`; it is not placed in project JSON, logs or analytics.

Inspect the current machine without starting the server:

```sh
pnpm run toonbridge:probe
```

## Security and data boundary

- The service refuses non-loopback bind addresses.
- CORS uses an exact origin allowlist; rejected origins receive no allow-origin header.
- Every non-preflight request requires protocol version `2` and the bearer token.
- URL paths and input IDs are bounded; all resolved paths must remain inside the job directory.
- Uploads are streamed and written atomically. Declared byte length and optional digest must match.
- Processes receive job-local `HOME`, temporary and XDG directories plus no application credential.
- Results must be regular files, never symbolic links, and are rehashed before metadata is stored and again before download.
- There is no silent provider substitution. A missing binary, timeout or nonzero exit becomes a
  structured failed job.

The runner does not provide a kernel sandbox: only trusted, explicitly installed binaries should be connected.
It is a technical isolation boundary, not a legal conclusion. Release review must still
confirm each distributed component, source-offer obligation, asset license and codec configuration.

## Tests

```sh
pnpm run test:toonbridge
pnpm run test:production-toolchain
```

The HTTP integration test starts the real service on an ephemeral loopback port and verifies origin
rejection, authentication, streamed upload, child execution, hashes, receipt creation and download.
