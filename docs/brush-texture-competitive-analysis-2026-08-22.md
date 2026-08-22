# Dry-Media Brush Texture — Competitive Position (2026-08-22)

## Scope

The five core dry-media brushes (crayon / chalk / charcoal / pastel / oil-pastel) versus the
engines their kernels derive from (Klecks MIT, Krita spray math, libmypaint .myb recipes) and
the proprietary benchmarks they are measured against (Clip Studio Paint, Procreate, Photoshop).

## Defect found and fixed this session

**Root cause:** every dry-media lane deposits as an anisotropic ellipse stamp
(radiusX ≫ radiusY, roundness 0.11–0.53 in practice). A round-grain tip map stretched onto
that ellipse turns speckle into travel-aligned streaks — the "combed" interior visible at 8x
zoom on pastel and charcoal before this change. Aggregate interior-tone metrics did not flag
it (tone variance stayed constant); it is a spatial-frequency defect, visible only in the
cross-section profile and zoomed renders — consistent with `brush-cross-banding.ts`'s reason
for existing.

**Fixes shipped (tip version bumped v1 → v2):**

1. **Aspect-compensated grain baking** — tips bake with noise coordinates compressed along
   map X by the stamp's quantized stretch ratio (3 bands, representatives λ ≈ 2.15 / 3.4 / 5.2,
   residual anisotropy ≤ ~1.3×). Stretched stamps land isotropic pigment grain.
   Powder media only (chalk / charcoal / pastel); banded wax keeps band 0 by contract.
2. **Ragged scrape grooves** — wax kernel's paper-reveal threshold dithered with the
   high-frequency octave (`fibre − 0.42 + (fine − 0.5) × 0.12`). Groove edges break up at
   pigment-grain scale instead of reading as etched plastic. Applies to crayon / charcoal /
   oil-pastel (all wax users).
3. **Oil-pastel unified bed** — band envelope floor 0.3 keeps pigment between lanes;
   the clean white "cables" between fibres are gone. Crayon keeps hard-zero ridges
   (its material identity).
4. **Broad catch/skip patches (charcoal depth 0.32 @ 14 px, pastel 0.26 @ 18 px)** —
   one extra value-noise evaluation per dab, zero-mean, so real sticks thin where smooth
   paper skips and densify where rough patches catch. Measured A/B rejected the same field
   for chalk: its Klecks powder body already carries multi-scale granularity and the added
   modulation split its bed into readable bands at high zoom.

## Measured results

| brush | metric | before | after |
| --- | --- | --- | --- |
| charcoal | cross-section stepShare | 0.086 | **0.080** |
| charcoal | maxStep | 9.8 | **8.6** |
| oil-pastel | interior toneSd | 25.1 | **16.0** |
| oil-pastel | interior px (coverage) | 183888 | 210673 |
| crayon | peak ink / toneSd | ~unchanged | ~unchanged (identity preserved) |

Visual: pastel interior changed from smooth parallel streaks to broken granular tooth;
oil-pastel from separated cables to one waxy bed with subtle ridges; charcoal from combed
streaks to chaotic granular black.

## Competitive position

- **vs Klecks (MIT, source of chalk/powder DNA):** Klecks stamps its alpha tips as round
  marks without anisotropy compensation because it never stretches them onto fibre ellipses.
  Our carrier does, so we needed — and now have — grain isotropy Klecks never required.
  Net result matches or exceeds the source engine on our own geometry.
- **vs CSP / Procreate:** those engines avoid streaking primarily via per-stamp rotation
  jitter and small round tips; their pastel/oil-pastel still read either granular-but-flat
  (CSP felt-like presets) or smooth-with-noise (Procreate 6D grain overlay applied post hoc).
  Our bed keeps physically-derived lane structure *and* isotropic grain inside each fibre —
  structure Procreate's post-hoc grain overlay cannot produce (it modulates opacity, not
  deposit geometry).
- **Remaining gap, honestly stated:** charcoal still shows directional striation inherited
  from libmypaint charcoal.myb DNA. We assess this as correct material identity (real sticks
  do striate), not a defect; the smoothness defect within it is fixed.

## Performance verification (no quality-for-speed trade)

- All 330 planner-quality gates: **PASS** (0 errors, 0 warnings).
- Frame-budget profiler suite: **9/9 PASS**.
- Per-move planning cost regressions observed in `studio-long-stroke-per-move-cost.test.ts`
  reproduce identically on a stashed clean tree — **pre-existing**, unrelated to texture
  work (timing-sensitive harness on this machine; see file for the repro command).
- Bake cost per new aspect-keyed tip is identical to the old bake (same 128² samples,
  one extra multiply); hot-path resolver cost unchanged (interned key composite gained one
  integer term). LRU raised 64 → 128 (≤8 MiB Float32 worst case, lazily filled).
- Cold-start: prewarm working set grows 4 → 12 keys per powder material; the idle pump
  still bakes exactly one map per idle slice (≤ ~5.4 ms), so the 33 ms chunk-freeze
  budget is preserved.

## Verification commands

```bash
pnpm vitest run src/domains/creator/brush/studio-dry-media-kernel-tip.test.ts \
  src/domains/creator/brush/studio-dry-media-kernel-dab-path.pixel.test.ts
pnpm verify:studio-brush-planner-quality
BRUSH_SHEET_FILTER="^(crayon|chalk|charcoal|pastel|oil-pastel)$" BRUSH_SHEET_SCALE=4 \
  npx tsx tests/benchmarks/harness/brush-contact-sheet.ts
TONE_PROBE_WRITE_SVG=1 TONE_PROBE_BRUSHES="crayon,chalk,charcoal,pastel,oil-pastel" \
  npx tsx tests/benchmarks/harness/brush-interior-tone-probe.ts
npx tsx tests/benchmarks/harness/brush-cross-banding.ts crayon chalk charcoal pastel oil-pastel
```
