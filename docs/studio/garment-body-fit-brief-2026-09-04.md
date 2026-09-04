# Garment ↔ body fit — build brief (2026-09-04)

Follow-up wave to the Character Shaper ship (PR #704). The shipped PR named one limit out loud:

> The procedural T-shirt does not fit the body well. The same garment on the same model looks
> identical in the old builder, so this is `buildGarmentParts` quality rather than a regression.

This brief is the contract for fixing that.

## 1. Root cause

Every procedural garment radius comes from the skeleton, not the body:

```ts
const r = m.shoulderW * 0.56 * (opts.rMul ?? 1);   // torsoShell
squash: [1, 1, 0.85]                                // one fixed ellipse for the whole torso
```

`shoulderW` is the distance between the two `upperArm` joints. It says nothing about how deep the
chest is, how narrow the waist is, or where the hips flare. So the shell is a barrel: too wide at
the waist, too deep at the chest, and the garment reads as a prop hovering around the character
instead of cloth cut to it.

## 2. Fix

Measure the body, then cut to it.

1. Sample the VRM's skinned mesh for vertices whose dominant skin weight is a torso bone.
2. Bucket them by height along the spine's up axis and reduce each bucket to a ring:
   half-width, half-depth, and centre.
3. Build garment profiles from those rings **plus a per-item clearance**, with per-ring depth so
   the chest can be wide-and-shallow while the waist stays narrow.
4. Fall back to today's skeleton-derived profile whenever the measurement is unavailable.

## 3. Fixed API surface (already landed — do not change these signatures)

`src/domains/creator/vrm/studio-vrm-body-silhouette.ts`

```ts
export const STUDIO_VRM_BODY_SILHOUETTE_VERSION = 1;
export interface BodySilhouetteRing { t; halfWidth; halfDepth; centerX; centerZ }  // all metres, t = 0 hips → 1 neck
export interface BodySilhouetteSample { t; x; z }
export interface BodySilhouette { version; source: "measured"; rings; sampleCount }

export function percentileOfSorted(sorted: readonly number[], percentile: number): number;
export function buildBodySilhouette(samples, ringCount?): BodySilhouette | null;
export function sampleBodySilhouette(sil, t): BodySilhouetteRing;   // clamps outside the measured span
export function widestHalfWidth(sil): number;
export function narrowestHalfWidthBetween(sil, lowT, highT): number;
export function sanitizeBodySilhouette(raw: unknown): BodySilhouette | null;
export function bodySilhouetteSignature(sil: BodySilhouette | null): string;
```

`studio-vrm-wardrobe.ts`

```ts
// GarmentShape lathe rings gained an optional per-ring depth ratio:
{ kind: "lathe"; profile: readonly { radius: number; y: number; depth?: number }[]; segments?: number }

// WardrobeMetrics gained the measurement (null when unmeasured):
torso: BodySilhouette | null;
```

`sanitizeWardrobeMetrics` already routes `raw.torso` through `sanitizeBodySilhouette`, so a broken
or partial measurement degrades to `null` rather than producing a broken cut.

## 4. Ownership

| Owner | Files | Job |
| --- | --- | --- |
| measure | `StudioVrmWardrobePropsProjection.tsx` | Collect torso samples from the skinned mesh, feed `metrics.torso` |
| cut | `studio-vrm-wardrobe.ts` | `torsoShell` / `skirtCone` / sleeve seating from the silhouette |
| render | `studio-vrm-skinned-garment.ts` | Per-ring `depth` in `buildStudioVrmGarmentGeometry` |
| fit-report | `studio-vrm-garment-fit.ts` | `referenceRadiusM` + signature use the measurement |

Each owner writes its own colocated `*.test.ts`. Nobody edits another owner's file.

## 5. Acceptance rules

1. **Measurement is honest.** No silhouette ⇒ `torso: null` ⇒ the skeleton fallback runs unchanged.
   Never synthesise rings to make a cut look better.
2. **Clearance, not scale.** The measured surface is the body. The garment is body + clearance.
   `fit` scales the *clearance*, never the body — a fit of 1 must not shrink inside the mesh.
3. **Determinism.** Same VRM ⇒ same rings ⇒ same signature. No randomness, no frame dependence.
4. **Ellipse per ring.** A garment whose chest and waist share one depth ratio is the bug, not the fix.
5. **Outliers are rejected.** Torso-weighted vertices include hair tips and accessories; rings use a
   percentile, never a max.
6. **No new dependencies.** No `eslint.legacy-exceptions.json` entries. Tests are colocated and real.

## 6. Verification gates

- `pnpm vitest run` over the four touched modules — measurement math, cutting, geometry, fit report.
- `pnpm exec tsc --noEmit`, `pnpm lint` on changed files.
- `scripts/verify-studio-character-shaper.mts` — the browser gate must still pass, and records the
  garment tile delta so the fit change is visible in pixels, not just in numbers.
