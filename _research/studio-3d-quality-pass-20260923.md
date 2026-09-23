# Studio 3D quality pass — inventory + fixes (2026-09-23 KST)

Checkout: `feat/studio-3d-quality-pass-20260923` @ post-#2003 (`2d2f1c1d6`)
Worktree: `/workspace/toonspectrum-worktrees/studio-3d-quality-pass-20260923`
**No production / Vercel deploy.**

## A) Exhaustive surface map (main)

### A1. Tool IDs / routes
| ID / surface | Entry |
| --- | --- |
| `vrm3d` | Studio rail → VRM poser (`StudioVrmPoserHost` + panel bodies) |
| `character-shaper` | Character shaper dialog/landing; binding over VRM host |
| `bg3d` | Background 3D editor (LT / transform / scene-ops hosts) |
| routed surfaces | `bg3d` / `poser` / `character` via studio editor routes |
| related | `scene3d`, `scene-3d`, `lift3d`, generic-3d mode, linked-3d pass |

### A2. Domain scale (approx)
| Domain | Source files | Vitest files |
| --- | --- | --- |
| `bg3d/` | ~678 | ~311 |
| `vrm/` | ~464 | ~229 |
| `character-shaper/` | ~99 | ~46 |
| `scene-3d/` + `scene3d/` | ~248 | ~120 |
| `lift3d/` | ~25 | ~11 |
| shared `studio-*3d*` | ~133 files | (mixed) |

### A3. Grade path after #2003
- Shaper: `character-shaper-grade.ts` + `character-shaper-grade-bridge.ts`
- BG3D: `studio-bg3d-grade-plates.ts` — `set-camera` / `set-light` / `set-fill-light` / `set-background` / `place-prop` / `remove-prop` + redo + `output.line` plates
- Hosts: LT (light/fill/background), transform (camera), scene-ops (place-prop, **now remove-prop**)

## B) Quality risks found (this pass)

| Pri | Finding | Disposition |
| --- | --- | --- |
| P0 | Photo tab advanced grade twin **before** host photo apply succeeded | **Fixed** — sync only after success (+ pure policy helper) |
| P0 | Offered `remove-prop` never ran on delete / plates stale | **Fixed** — scene-ops removal runs remove-prop + plate capture |
| P1 | Shelf `pose-preset` commits left grade twin stale (`planShaperGradePosePreset` unused) | **Fixed** |
| P1 | `mirrorGradePose` / hand-pose could mark applied when host method missing | **Fixed** |
| P1 | Mirror control lacked `data-testid` / `aria-label` | **Fixed** |
| P2 | Grade history still not production BG3D undo spine | Backlog |
| P2 | Grade character capture still synthetic | Backlog |
| P2 | `StudioVrmPoserHost = Record<string, any>` | Backlog |
| P2 | Full bg3d panel polish / ML Pose Scanner / VRoid sculpt | Out of scope |

## C) Leftover backlog
1. Unify production BG3D undo with grade past/future (or mark plates preview-only in UX)
2. Optional production plate path → semantic PSD / VRM raster
3. Narrow VRM poser host typing for shaper-critical methods
4. Hand-pose glyph + apply-plan coverage expansion
5. scene-3d / lift3d deep audit
