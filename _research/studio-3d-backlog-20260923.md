# Studio 3D leftover backlog — 2026-09-23 KST

Branch: `feat/studio-3d-backlog-20260923`
Base: `origin/main` @ post-#2005 (`c274b34b9`)
**No production / Vercel deploy.**

## Implemented
1. Unify production BG3D undo with grade past/future (`studio-bg3d-grade-history-bridge.ts`)
2. Production plate → semantic PSD / VRM raster bridges (BG3D + character)
3. Narrow `StudioVrmPoserHost` off `any`
4. Hand-pose glyph contract + apply-plan coverage
5. scene-3d / lift3d audit: linked-layer diverged scenes now fail as `scene-revision-diverged`; delete/add dual-write history

## Residual gaps
- Closed on `feat/studio-3d-residual-20260923` — see `_research/studio-3d-residual-20260923.md`.
