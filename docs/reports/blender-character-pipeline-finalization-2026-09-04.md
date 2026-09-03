# Blender character pipeline finalization · 2026-09-04

## Scope

This report records the final stabilization of the ToonStudio Blender character authoring pipeline before protected-branch integration.

## Resolved regressions

- Blender 5.2 expression-preview filtering now reads ToonStudio-generated Shape Key provenance from the owning mesh object. It no longer assumes that `ShapeKey` RNA values support arbitrary ID-property access.
- `quality-report.json` is finalized exactly once before `character-package.json` computes its immutable file receipt. The package no longer hashes a report and then rewrites that report.
- Regression contracts cover both boundaries and fail if the unsafe Shape Key access or mutable receipt order returns.

## Verification performed by the finalizer

- Python byte-code compilation for the changed Blender modules and regression contract.
- Full `tests/blender/test_*.py` discovery.
- Repository architecture validation.
- Static Blender pipeline verifier.
- Character-package TypeScript regression tests.
- Root TypeScript no-emit check.

The feature branch remains subject to the repository's protected `core` check and the dedicated Blender pipeline workflow before merge.
