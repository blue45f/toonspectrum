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
behavior cases are included in the material suite (13 files, 107 tests). Extracting this policy
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
channel error of 0.00037836 across those cases.

The 10,000-input, 128-strand stress run generated 1,279,872 contacts. Early append mean was
0.2271 ms and late mean was 0.2145 ms; a single append emitted at most 128 contacts. Total
planner and Canvas submission time was 2,274.3 ms. These observations exclude physical input
and GPU presentation. Held numeric samples are counted; they are not a measurement of heap bytes.

After building and starting Vite preview, `TOONSPECTRUM_VERIFY_ORIGIN=http://127.0.0.1:PORT pnpm verify:studio-brush-v6-workflow` exercises the real Brush Editor save, material application,
pen stroke, authoritative OPFS/SQLite manuscript and visible restoration after reload. It leaves
stage timings, screenshots, network diagnostics and the exact retained material data in its
report. Optional library probes are for diagnosis only and stay disabled in acceptance runs
because extra reads can change startup timing.
