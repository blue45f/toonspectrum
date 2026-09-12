# Studio material brush execution

## User-visible change

The 48-brush product portfolio is unchanged. The 17 existing V6 experimental recipes now execute
one material contact engine in their reference stroke, live drawing pad, saved Studio brush,
native pointer overlay, committed manuscript render and SVG export. Saved materials are custom
brushes, rather than additional nearly identical built-in catalogue rows.

The implemented families include pressure-shaped ink and chisel, paper-contact graphite and
charcoal, connected bristle paint, knife ridges, wet pigment deposition and resist, particles,
stitch/foliage/halftone patterns and thin-film/neon approximations. Six paper fields affect
contact. Bristles have seeded per-strand stiffness, spacing, length and paint reservoirs.
Mixed pigment uses the existing ISC-licensed libmypaint 10-band spectral WGM implementation;
this change adds no dependency.

These are deterministic CPU contact and deposition models. They do not run a fluid-grid solver,
canvas pigment pickup, a GPU fluid engine or the external providers recorded in the historical
V6 design graph. Unsupported nodes are disabled, only implemented tuning controls are exposed,
and historical performance estimates are described as estimates.

## Customization and persistence

The workbench supports a pinned A/B reference, one-parameter three-way experiments, a pressure
response curve and gesture-grouped undo/redo. Numeric entry is committed on blur or Enter.
Saving requires SQLite authority and reads the record back before showing the manuscript link;
a session-only memory fallback cannot claim a durable save. Explicit selection is captured
synchronously so late startup tool restoration cannot overwrite a newly chosen material. The editor applies the selected material through its existing saved-brush
path; its inspector edits the active material parameters and can reopen the same configuration
in Brush Editor. Library and quick-shelf thumbnails render actual material samples.

Versioned material configurations validate numeric bounds, colors and input policy. Pressure
and tilt calibration are shared by preview and production. Material configuration survives
existing brush program updates, document serialization and export. Symmetry transforms the
completed contacts, including scatter and nib angle, identically in Canvas and SVG. Raster-edit
crops use primitive bounds including wet spread, particles and symmetry copies.

## Performance and regression checks

`pnpm test:studio-material-brush` exercises the material core, preview, experiments, product
repository bridge, saved-brush application and pixel-analysis contract. This command runs in
the required core static CI job. Existing native-media, SVG, raster-edit and catalogue gates
remain enabled. The typed live-media dispatcher selects one compatible renderer before provider
startup, preserving material priority, eraser ownership and explicit GPU rejection. Its nine
behavior cases are included in the required material suite, alongside actual committed rendering,
native replay, raster bounds, selection, SQLite and client/server CRDT regressions. Extracting this policy
also brings the editor host below its existing size ceiling without increasing the limit.

`pnpm verify:studio-brush-v6-quality` produces `report.json`, an HTML review and recipe PNGs.
It uses real Chromium pen events with pressure, tilt and twist, holding size, color, opacity
and seed constant across all 17 recipes. Pairwise ink comparisons remove paper and normalize
coverage to avoid accepting opacity-only variants. It compares repeat replay, native
live/settled contacts, batch planning and decoded SVG output. A 10,000-input stress run records
early/late append timings, contact counts and retained numeric samples.

The incremental planner processes appended samples instead of reconstructing the whole stroke.
Retraction, corrected prefixes and material/size/color/opacity changes trigger deterministic
rebuilds. Exceptional sparse segments remain bounded and cover their full route; reduced sample
density is exposed as `clippedDabs` rather than silently dropping the route tail.

Browser timings are local CPU observations. They do not certify physical stylus latency,
device palm rejection or WebGPU performance. Actual stylus and device-specific assessment
remain a separate acceptance surface.

## Recorded acceptance run

The final CPU material run on 2026-09-12 passed all 17 recipes and two symmetry cases. All 136
normalized recipe pairs exceeded the minimum material distance of 0.025 (observed minimum
0.030974845). Native live, settled and committed pixels matched exactly, including reflected
chisel and four-way particle overlap. SVG antialiasing produced a maximum mean normalized
channel error of 0.000378359 across those cases.

The 10,000-input, 128-strand stress run generated 1,279,872 contacts. The real committed
Canvas entry point rendered the whole stroke in 2,080.4 ms, with exact pixels against the
incremental renderer. Both generated and submitted batches peaked at 128 contacts; this large
stroke retained no cached output. Small-stroke caches are limited to 32,768 contacts total,
8,192 contacts and 512 input samples per item, and detect in-place edits. These observations
exclude physical input and GPU presentation. Contact counts are not heap-byte measurements.
The extreme whole redraw still takes about 2.08 seconds; bounded memory does not remove its
underlying drawing cost.

The public SVG exporter enforces a 64 MiB UTF-16 output budget and reports an actionable error
instead of downloading an incomplete file. The extreme stroke exceeded this budget after
264.1 ms. A separate discarding sink verified full-path serialization of 438,812,506 UTF-16
bytes in 1,693.4 ms, with a maximum 44,400-byte chunk. This sink is a stress measurement, not a
claim that the application permits an unbounded SVG download.

After building and starting Vite preview, `TOONSPECTRUM_VERIFY_ORIGIN=http://127.0.0.1:PORT pnpm verify:studio-brush-v6-workflow` exercises the real Brush Editor save, material application,
pen stroke, authoritative OPFS/SQLite manuscript and visible restoration after reload. It leaves
stage timings, screenshots, network diagnostics and the exact retained material data in its
report. Optional library probes are for diagnosis only and stay disabled in acceptance runs
because extra reads can change startup timing.

## Integration corrections verified during review

Selecting a built-in or historical recent slot clears the previous material override; saved
material slots retain their exact engine programs. Material size (1–240 px) and opacity
(1–100%) survive the editor, library JSON, SQLite slots and tool memory. Unsupported finger
water mode is visibly disabled. Grid pattern density and jitter change actual contacts;
inactive stitch controls are omitted by the shared active-control contract.

Raw pen force is retained through pointer start, coalesced movement, preview publication and
release. Material calibration runs once in the contact engine. The native overlay reconstructs
active strokes after canvas resize or viewport changes and retains settled material ownership
for later highlighter blending. The browser workflow checks mid-stroke viewport resize and
restoration of active ink, then verifies every saved pressure sample against the
actual dispatched pen force before manuscript recovery.

Engine programs now travel in stroke payload v6 through the actual Yjs document, using a pure
shared canonical schema at the browser and API boundary. The encoder, decoder and server
reject missing, malformed or future material data instead of losing renderer identity. Legacy
stroke versions remain readable. The room protocol advances to v8 separately so an older peer
cannot silently omit an unsupported new stroke. Real Yjs round trips cover all 17 recipes,
legacy oil switches and material contact equality.

The full editor's fractional-zoom resize check separately compares the complete native drawing
command sequence and pixel coverage. In Chromium 151, replaying the exact same 1,920 fills
on fresh equivalent canvases in one batch versus across animation frames produced a 1.5203%
normalized spatial RGBA difference. The final resize measured 1.1073803%, with identical path,
transform, alpha, color and composition for every command. Its lifecycle criterion therefore
requires exact command identity plus the existing 3% spatial pixel limit and visible alpha.
This browser batching difference is distinct from the material kernel's exact pixel parity.

Final review additionally covers save completions racing with edits or undo, and proves every
advertised control changes actual serialized paint across all 17 recipes. A stale SQLite
completion cannot publish a link for the currently edited program. Primary-only materials
disable the unused secondary picker. Bristle relief increases loaded contact ridge thickness
by at most 1.6 times without extra contacts. Tap marks do not seed a false horizontal lane or
wet-edge direction; the first moving contact supplies the heading.

Four short-stroke browser cases cover vertical and diagonal starts for bristle and wet brushes,
with exact native/settled/committed pixels and matching SVG geometry. Two extra oil variants
compare relief zero and one: normalized material distance 0.0367701 exceeds the 0.01 control
effect threshold. These six cases supplement the 17 recipes and two symmetry cases.

Three fresh profiles on the final relief/directional-start production build passed the complete
save/apply/pen/resize/SQLite/reload/public-recovery workflow. Each retained all 49 raw pressure
samples within 2.8e-8, restored the same 1,920 native drawing commands, and preserved material
configuration and coordinates. Active replay spatial RGBA error was 1.1073803% with 0.1291211%
alpha-mass difference; reopened manuscript error was 0.3467481%, with 39,299 visible committed
ink pixels and no page exceptions. The final required material suite passed 32 files / 763 tests.
