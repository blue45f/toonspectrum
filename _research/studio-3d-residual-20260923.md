# Studio 3D residual closeout — 2026-09-23 KST

Branch: `feat/studio-3d-residual-20260923`
Base: `origin/main` @ post-#2006 (`bce5a89cc`)
**No production / Vercel deploy.**

## Residuals fixed
1. **LT light/background production undo** — Live slider ticks only preview the document and arm a gesture; `finishLtDocumentGesture` (pointer-up / change-end / 800ms safety) dual-writes one `bg3d.grade.*` adapter entry + grade past/future. Debounce skipped while gesture open.
2. **GPU/live plate capture** — LT / scene-ops / transform hosts call `captureStudio3dPlatesFromAdapter(..., captureRef.current?.adapter)` so multipass/RGBA is used when the live capture adapter exists; CPU synthetic remains the fallback.
