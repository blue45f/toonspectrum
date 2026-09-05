# Studio asset review status — 2026-09-06

This is an evidence ledger, not a claim that all Studio assets are artistically approved.

## Existing delivery and merge

PR #770 contains 1,097 original CC0 assets and the compatible retirement of eight blockout-only SVG backgrounds from new selection. Its reviewed head is `b5746b0f20a749319e35ccc6150d90f839d1289e`. In CI run 33982928639 the three root test shards, frontend/API/Worker type checks, serial tests, filter-dialog checks, the fast 3D visual lane and in-app feature sweep were observed passing. The required `core` check was still queued when an immediate merge was attempted; GitHub correctly rejected that attempt with HTTP 405, `Required status check "core" is queued.` Auto-merge was then enabled without modifying branch protection or check results. This record does not assert that merge or deployment has completed.

The Vercel status separately reports `Deployment rate limited — retry in 24 hours.` This is not a successful deployment and must not be represented as one.

## Prepared visual evidence

Workflow run 33983544842 completed actual preview generation. Evidence commit: `0c99edac76dc728f8ba3a58b887a3ce35bcfab7b`. Artifact: 9974508464, SHA-256 `beaca1b82c92d2b80683d4483b91de601221f33db684d05443876f8ed4cea6f8`.

The 57 pages in five PDFs map 1,351 visual inventory entries to their IDs and source paths: 1,097 CC0 originals, 89 existing GLB models, 32 original SVG entries and 133 existing raster entries. Raster entries can include thumbnails; the total is not a count of distinct new original assets. These pages do not cover every procedural brush mark, clothing combination, pose, dynamic template or runtime state in Studio.

Generation and nonempty-frame checks are not artistic inspection. The review index deliberately retains `visuallyReviewed: false`. Attempts to open the complete pixel evidence were blocked by repeated local runtime errors and unsuccessful PDF/image access through alternative viewers. No new per-item artistic approvals or quality-based deletions are asserted. User uploads, works and OPFS/SQLite data were not removed.

## Additional detailed PBR acquisition

Branch `feat/studio-pbr-visual-quality-20260906`, acquisition implementation commit `8dc07398b5364adf5d7b8ef49941914846d3558e`, adds `scripts/acquire_studio_pbr_originals.py` and a read-only acquisition/render workflow. It selects up to 18 model candidates and 36 surface-material candidates from the official Poly Haven API by intended use. These are selection ceilings, not delivered counts or quality scores.

The pipeline requires explicit native 2K file records, allowed HTTPS sources and redirects, official byte sizes/checksums, bounded dependencies, self-contained GLB textures, finite geometry, duplicate checks and actual browser rendering. It also retains source metadata, SHA-256 receipts and CC0 provenance. Candidate previews are rendered locally from the downloaded originals rather than redistributed supplier example renders.

Run 33984865255 was still waiting for a runner at the last check. No additional acquired-asset count is claimed here. The pipeline is review-only and does not publish candidates to the active Studio manifest. It leaves `visualReviewed: false` and `studioRuntimeVerified: false` until those checks actually happen.

## Remaining acceptance gates

1. Confirm the actual merged state of #770 and its resulting main SHA; confirm deployment separately.
2. Inspect all 57 inventory pages, then inspect flagged assets at native size and model views. Record decisions by ID with reasons; do not convert generated evidence into blanket approval.
3. Inspect actual PBR acquisition/render results and previews. Keep incomplete or rejected folders out of any final delivery and reconcile counts against the admitted manifest.
4. Integrate only approved additions with category/style labels that distinguish detailed PBR assets from low-poly assets. Preserve existing IDs and user works.
5. Execute manifest integrity, picker/regression tests, strict lint, frontend types, production build and Studio insertion/save/restore checks for the integration commit.
