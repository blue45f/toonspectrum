# Studio drawing input center benchmark and implementation

Date: 2026-09-09

## Executive summary

ToonStudio already has a broad drawing stack: brush catalogues, Brush Studio V5, pressure curves,
stabilizer modes, post-correction, stamp tuning, symmetry, QuickShape, low-latency raw/coalesced input,
predicted preview isolation, pointer-channel persistence, and a pressure calibration scratchpad. The main
remaining usability gap was not another brush engine. It was that artists could not answer three basic
questions while working on the real canvas:

1. Is the browser actually receiving pressure, tilt, barrel rotation, hover, and high-density samples?
2. Which correction combination is appropriate for this device and this task?
3. Can those settings be changed and reverted without hunting through several controls?

This change adds a non-modal **Drawing Input Center** next to the drawing dock. It observes only pointer
sensor metadata produced inside the canvas viewport, recommends a task profile, applies the existing
canonical settings in one action, restores the previous settings, and can copy an anonymized diagnostic
report. It does not collect coordinates, stroke geometry, brush color, document content, or a persistent
device identifier.

## Existing ToonStudio baseline retained as authority

The implementation deliberately reuses rather than duplicates the current drawing system.

- `StudioDrawOptionsBar` remains the canonical owner of brush size, opacity, stabilizer strength/mode,
  post-correction, pressure curve, stamp tuning, symmetry, QuickShape, eraser mode, colors, slots, and
  brush-studio navigation.
- `StudioPressureCalibrationPanel` remains the detailed pressure-curve scratchpad and calibration surface.
- The existing drawing transport remains the owner of raw/coalesced/predicted collection, stroke
  authority, pointer capture, render previews, and document commits.
- Predicted samples remain preview-only. The Input Center reports whether prediction is available and how
  many predicted samples were exposed, but never promotes a predicted sample to the displayed current
  sensor value or to a document mutation.
- Brush Studio V5 remains the advanced engine/material/physics authoring surface. The Input Center changes
  input feel only; it never changes the active brush, engine, color, opacity, or width.

This boundary keeps the change low-conflict with the recently merged Brush Studio V5 work and prevents a
second, divergent drawing-settings state machine.

## Competitive benchmark

| Product | High-value drawing behavior | Product implication for ToonStudio | Result in this change |
| --- | --- | --- | --- |
| Clip Studio Paint | Advanced brush settings expose pressure, tilt, velocity, correction, start/end behavior, texture, dual brush, anti-overflow, and user-selected quick settings. Preferences expose hover, stroke preview, smart-shape hold, tablet input accuracy, cursor response, and pen/touch behavior. | Professional controls need an understandable working surface, not only a deep inspector. Artists also need to know whether the tablet/browser path is delivering the expected signals. | The Input Center surfaces live pressure, tilt, twist, altitude/azimuth when available, hover, contact size, event channel, and sample density. It routes detailed curve work back to Brush Studio. |
| Procreate | Brush Studio separates StreamLine, stabilization, and motion filtering; behavior differs by speed and task. It exposes pressure/tilt/azimuth/barrel-roll mappings and keeps high-frequency actions close through QuickMenu. | One universal stabilization value is not enough as a workflow concept. A quick, task-oriented layer should sit above the detailed engine settings. | Five profiles combine the existing standard/adaptive/precision modes, strength, post-correction, pressure preset, and supported minimum-size floor. The floating launcher stays available while drawing. |
| Krita | Freehand input offers no smoothing, basic/weighted smoothing, stabilizer, speed-dependent sample counts, endpoint completion, pressure/sensor smoothing, and assistant snapping. | Direct detail work, expressive sketching, normal inking, and deliberate long curves require distinct correction envelopes. | `direct`, `sketch`, `ink`, and `precision` profiles encode those distinct intents without inventing a second stroke algorithm. |
| Adobe Fresco | Pixel-brush controls keep size, flow, and smoothing close; advanced settings expose pressure/velocity, pressure curves, hardness, spacing, angle, color dynamics, barrel roll, squeeze shortcuts, and brush-stamp previews. | Modern pen hardware support must be observable and degradable. A browser app must explain when the device/browser does not expose a channel. | Capability chips distinguish coalesced, predicted, tilt, twist, tangential/barrel pressure, and hover. Missing channels are shown as unavailable rather than simulated. |
| Concepts | Pressure, tilt, velocity, adjustable live smoothing, customizable tool wheels/bars, shape guides, live snap, and measurement support fast ideation. | The shortest path to a useful feel matters as much as deep configurability. Non-pressure input deserves an intentional mode. | A dedicated `mouse-touch` profile stabilizes fixed-pressure pointers, while the recommended-profile heuristic defaults safely when signals are limited. |

## Implemented product behavior

### 1. Live input quality view

The panel listens only while open and only to events whose target is inside
`[data-studio-canvas-viewport="true"]`.

It reports:

- pointer type: pen, touch, mouse, or unknown;
- preferred event channel: `pointerrawupdate`, `pointermove + coalesced`, or `pointerdown`;
- effective recent sample rate, capped to a defensive 1000 Hz display range;
- current pressure, observed pressure minimum/maximum/range;
- tilt magnitude and direction;
- twist/barrel rotation;
- altitude and azimuth when the browser exposes them;
- tangential/barrel pressure;
- contact width and height;
- hover observation;
- coalesced and predicted-event capability;
- recent frame count and authoritative hardware-sample count.

The UI is throttled to 20 updates per second while keeping up to 96 recent metadata frames in memory. This
keeps the diagnostic responsive without scheduling a React render for every hardware sample.

### 2. Browser and webview failure containment

Some embedded webviews expose `getCoalescedEvents` or `getPredictedEvents` but throw when invoked. Both
APIs are called through a guarded boundary. A throwing method is reported as unsupported for that frame,
and the dispatched event remains the authoritative fallback.

For a valid coalesced batch, the latest coalesced event is the displayed authoritative sample. Predicted
events are counted only. This mirrors the drawing runtime's canonical/non-canonical separation.

### 3. Task-oriented input profiles

| Profile | Stabilizer | Mode | Post-correction | Pressure preset | Stamp min-size when supported | Intended use |
| --- | ---: | --- | ---: | --- | ---: | --- |
| Direct drawing | 0 | standard | 0 | linear | 0.04 | Fast gesture, fine detail, high-rate pen |
| Rough sketch | 2 | adaptive | 0 | soft | 0.06 | Storyboard, rough, pencil/charcoal |
| Webtoon inking | 5 | adaptive | 2 | linear | 0.08 | G-pen, marker, normal cleanup |
| Precision curve | 8 | precision | 4 | firm | 0.12 | Long curves, clean linework, balloon outline |
| Mouse/touch | 6 | adaptive | 3 | linear | 0.36 | Mouse, fixed-pressure stylus, finger |

Profile application follows these rules:

- values are normalized and clamped before comparison or application;
- only changed callbacks are invoked;
- unsupported stamp minimum size remains `null` and is not fabricated;
- flow and hardness are preserved when only stamp minimum size changes;
- the previous complete input snapshot is retained for one-click restoration;
- brush identity, color, width, opacity, material, symmetry, and document content are untouched.

### 4. Device-aware recommendation

The recommendation is deliberately explainable and conservative:

- mouse or touch -> mouse/touch profile;
- pen at 160 Hz or more, with coalesced support and at least 0.3 observed pressure range -> direct;
- pen with tilt and at least 0.2 pressure range -> sketch;
- pen below 45 Hz -> precision;
- otherwise -> webtoon inking.

No profile is applied automatically. The artist remains in control, and profile changes never occur during
a stroke.

### 5. Privacy-safe support report

The copyable report contains only the values already visible in the Input Center. It includes sensor
capability, sample rate, pressure range, contact size, and quality classification. It explicitly omits:

- `clientX` / `clientY` or document coordinates;
- stroke points, paths, or raster data;
- project, page, layer, or element identifiers;
- brush color or artwork content;
- `persistentDeviceId` or any stable hardware fingerprint.

The report can therefore be attached to a support issue without exposing the artwork.

### 6. Responsive, non-modal workflow

- The launcher is shown only for pen and eraser modes.
- The panel is lazy-loaded on first open.
- Desktop placement respects the right dock inset; mobile placement respects the safe area.
- The panel does not trap focus because the artist must continue drawing on the canvas while it is open.
- Escape closes the panel, close restores focus to the launcher, and the detailed pressure-calibration action
  closes the panel before opening Brush Studio.
- Touch targets meet the existing Studio minimum-control sizing conventions.

## Quality and authority invariants

1. The diagnostic must never become a parallel stroke input pipeline.
2. The diagnostic must never call `preventDefault`, take pointer capture, or mutate the drawing transport.
3. Predicted input must never become current authoritative telemetry.
4. Profile application must call existing settings handlers only.
5. No event coordinate or stable device identifier may enter telemetry state or the copied report.
6. A browser capability must degrade to a visible unavailable state rather than generate synthetic sensor
   data.
7. The panel must remain optional and lazy so normal drawing startup is unaffected.

## Verification included

- Pure model tests for normalization and clamping.
- Profile-plan tests including brushes without a stamp minimum-size channel.
- Authority test proving predicted samples do not replace the latest coalesced sample.
- Throwing-webview tests for coalesced and predicted APIs.
- Sample-rate, pressure-range, sensor-observation, quality, and recommendation tests.
- Privacy report test proving coordinate fields are absent.
- Component test proving a profile delegates through canonical setting callbacks and preserves unrelated
  stamp tuning.
- Component test proving detailed pressure calibration closes the Input Center before opening Brush Studio.
- Strict local TypeScript checks for the model, both UI components, and `StudioOptionsBars` integration.
- Runtime assertions against emitted JavaScript for profile planning, telemetry summary, recommendation,
  and privacy report.

## Real-device acceptance matrix

The source-level and synthetic-event tests cannot substitute for hardware validation. Before release, run
this matrix on the production build:

| Platform | Device | Required observation |
| --- | --- | --- |
| iPadOS Safari/PWA | Apple Pencil 2 | pressure, tilt, hover only on supported iPad, stable touch rejection |
| iPadOS Safari/PWA | Apple Pencil Pro | pressure, tilt, twist/barrel roll where Pointer Events exposes it |
| Android Chrome | S Pen | pressure, tilt, hover, pen-plus-palm behavior |
| Windows Chrome/Edge | Wacom Wintab/Windows Ink | pressure range, coalesced density, raw-event preference |
| Windows Chrome/Edge | Surface Pen | pressure, tilt, pointer type, fixed-rate behavior |
| macOS Chrome | Wacom/XP-Pen/Huion | pressure, tilt, sample density, browser capability differences |
| Desktop browsers | Mouse/trackpad | compatibility classification and mouse/touch recommendation |
| Embedded webview | throwing API fixture | no crash, dispatched-event fallback, unsupported capability badge |

## Follow-up candidates that require hardware or product research

These are intentionally not hidden inside this MR because they need device-lab evidence or new product
state ownership:

- opt-in per-device calibration profiles, keyed without a persistent browser hardware identifier;
- hover-rendered nib footprint that reflects live pressure, tilt, and barrel rotation;
- Apple Pencil Pro squeeze and supported stylus-button action mapping;
- a customizable radial quick menu for profiles, brush size, color, undo, and eraser;
- automated before/after line-quality capture across multiple tablets and display refresh rates;
- telemetry-backed default tuning only after anonymized, consented aggregate measurement is designed.

## Primary benchmark sources

- Clip Studio Paint, “Customizing brush tools”:
  https://help.clip-studio.com/en-us/manual_en/240_brushes/Customizing_brush_tools.htm
- Clip Studio Paint, “Preferences”:
  https://help.clip-studio.com/en-us/manual_en/720_preferences/Preferences.htm
- Procreate Handbook, “Brush Studio Settings”:
  https://help.procreate.com/procreate/handbook/brushes/brush-studio-settings
- Procreate Handbook, “Apple Pencil”:
  https://help.procreate.com/procreate/handbook/interface-gestures/pencil
- Procreate Handbook, “QuickMenu”:
  https://help.procreate.com/procreate/handbook/interface-gestures/quickmenu
- Krita Manual 5.3, “Freehand Brush Tool”:
  https://docs.krita.org/en/reference_manual/tools/freehand_brush.html
- Adobe Fresco, “Pixel brushes” (updated 2026-09-02):
  https://helpx.adobe.com/fresco/desktop/draw-paint-animate-and-share/pixel-brushes.html
- Concepts product description (updated 2026-08-30):
  https://play.google.com/store/apps/details?id=com.tophatch.concepts
