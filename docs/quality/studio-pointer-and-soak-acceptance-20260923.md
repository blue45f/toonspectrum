# Studio pointer and long-session acceptance — 2026-09-23

## Scope

This gate closes the browser-automatable part of the remaining input and long-session migration
risk. It drives the same Studio Pointer Events path with three explicit authorities:

- `mouse`: Playwright mouse compatibility baseline.
- `pen`: Chromium CDP pen events with changing pressure, tangential pressure, tilt X/Y and twist.
- `touch`: Chromium CDP touch start/move/end with changing force and contact geometry.

`auto` resolves to `pen` for desktop and `touch` for phone-sized in-app profiles. Pen or touch
runs fail closed when a Chromium CDP session is unavailable; the gate never silently downgrades to
mouse evidence.

The generated path is deterministic and bounded to the current document surface. Every stroke
records its input mode, point count, pressure range, tilt ranges and twist range alongside the
before/after changed-pixel sample. The five-hour report also keeps the existing runtime-error,
worker-error, GPU device-loss, long-task, post-GC heap, DOM-node and event-listener telemetry.

## Short product acceptance

Build and start a production preview, then run:

```bash
node scripts/verify-studio-skia-multitab-mobile.mjs http://127.0.0.1:4173
```

The desktop tabs use pressure-aware CDP pen streams. The mobile 390×844 profile uses CDP touch
contact. The check preserves the existing requirements for exact visible Skia presentation,
cross-tab context-loss isolation and explicit same-engine recovery.

## Long-session matrix

Use an explicit output directory for every row so reports cannot overwrite one another.

```bash
TOONSPECTRUM_SOAK_MINUTES=30 \
TOONSPECTRUM_SOAK_INPUT=pen \
TOONSPECTRUM_SOAK_OUT=artifacts/studio-soak/desktop-pen-30m \
pnpm exec tsx scripts/verify-studio-five-hour-soak.mts

TOONSPECTRUM_SOAK_MINUTES=120 \
TOONSPECTRUM_SOAK_PROFILE=instagram-ios-390 \
TOONSPECTRUM_SOAK_INPUT=touch \
TOONSPECTRUM_SOAK_OUT=artifacts/studio-soak/mobile-touch-120m \
pnpm exec tsx scripts/verify-studio-five-hour-soak.mts

TOONSPECTRUM_SOAK_MINUTES=300 \
TOONSPECTRUM_SOAK_INPUT=pen \
TOONSPECTRUM_SOAK_WEBGPU=1 \
TOONSPECTRUM_SOAK_OUT=artifacts/studio-soak/desktop-pen-webgpu-300m \
pnpm exec tsx scripts/verify-studio-five-hour-soak.mts
```

A run is rejected for persistent missing ink, blocked pen authority, uncaught page/worker/promise
errors, non-benign GPU loss, excessive retained-heap growth or a retained-heap slope above the
shared policy. Existing third-party build warnings are not converted into soak success or failure.

## Evidence boundary

CDP pressure/touch is deterministic browser-level evidence. It proves the application consumes
pressure, tilt, twist and touch contact without relying on a mouse-only harness. It does not claim
that a specific physical tablet driver, palm-rejection implementation, mobile OS thermal policy or
battery profile was attached to this machine. Hardware certification must retain its actual device,
OS, browser and driver identity next to the same report schema rather than replacing this gate.
