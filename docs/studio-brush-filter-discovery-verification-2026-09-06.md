# Brush/filter discovery: verification receipt (2026-09-06)

This is a draft implementation, not a release approval. PR #771 has not been merged or deployed.

## Scope

The compact brush palette is reduced from 23 to 18 entries in six purpose groups. Removed shortcuts remain available through their existing registered IDs. Naming, aliases, usage hints, illustrated stroke examples, search scope, keyboard interaction, and filter discovery metadata are presentation changes; rendering algorithms and saved document IDs are not intentionally changed.

## Observed automated run

Run: https://github.com/blue45f/toonspectrum/actions/runs/33982996144
Source revision: 67f2dd766a83d2691541f0fe049774e325486567

- Patch checksum and application against original Git blobs: passed.
- Unit tests: 431 passed, 2 failed (433 total); 52 passing files, 2 failing files (54 total).
- Reported failures: a legacy-name search assertion expected one option but received two; an ID-list assertion expected grouped order but received catalogue order.
- Strict lint reported two import-order warnings in `brush/studio-draw-ux.ts`. The follow-up commit reorders those imports; a clean rerun is still required before calling lint passed.
- Typecheck, production build, responsive/keyboard browser checks, representative-brush pixel/undo checks: no final passing result was established in this session.
- Remote Desktop returned no connected device. The local execution environment subsequently became unavailable, preventing completion of local browser and artifact inspection.

## Merge blockers

Resolve the two failing test contracts against the exact checked-out source, then rerun the checks. Do not weaken assertions merely to make the build green. The connector returned inconsistent file snapshots compared with the failed job's source excerpts, so the failures remain explicitly unresolved rather than applying speculative replacements.

Inspect responsive screenshots and actual engine-generated brush strokes. The new SVG examples are explanatory illustrations, not engine-rendered previews. Do not describe the complete brush/filter catalogue as visually audited or long-duration stability-tested based on this PR.

Menu/gallery taxonomy alignment and hiding groups with no dialog items need final integration verification. Local follow-up edits that were not confirmed in GitHub must not be counted as delivered.

## CI hygiene

Temporary encoded patch transport and the write-enabled bootstrap workflow are removed by the follow-up commit. The retained verification workflow is read-only, does not export installed dependencies or the Node runtime, and uploads only the build and browser evidence.
