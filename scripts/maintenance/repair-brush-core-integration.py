#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one match, found {count}: {old[:160]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"[replace] {path}")


TEST_PATH = "apps/web/src/domains/creator/studio-integration-closure.test.ts"

replace_once(
    TEST_PATH,
    '      expect(routes).toContain(`path: "/studio/p/:projectId/${section}"`);',
    '      expect(routes).toContain(`path: studioRoutePath("project-${section}")`);',
)
replace_once(
    TEST_PATH,
    '    expect(routes).toContain(\'path: "/studio/assets/brushes/new"\');',
    '    expect(routes).toContain(\'path: studioRoutePath("asset-brush-new")\');',
)
replace_once(
    TEST_PATH,
    '    expect(routes).toContain(\'path: "/studio/assets/brushes/:brushId/edit"\');',
    '    expect(routes).toContain(\'path: studioRoutePath("asset-brush-edit")\');',
)

# These workflows were temporary branch-mutating installers/repair jobs. They are not product CI
# and the permanent ToonStudio integration contract explicitly requires them to be absent.
TRANSIENT_WORKFLOWS = (
    ".github/workflows/apply-toonstudio-project-contract-repair.yml",
    ".github/workflows/apply-toonstudio-ui-lint-fixes.yml",
    ".github/workflows/apply-toonstudio-session-fixes.yml",
    ".github/workflows/apply-toonstudio-session-tests.yml",
    ".github/workflows/apply-toonstudio-session-verifier-fix.yml",
    ".github/workflows/apply-toonstudio-runtime-contract-fix.yml",
    ".github/workflows/apply-toonstudio-tests-fix.yml",
    ".github/workflows/apply-toonstudio-publish-test-fixture-fix.yml",
    ".github/workflows/fix-toonstudio-palette-test.yml",
    ".github/workflows/fix-toonstudio-template-typecheck.yml",
    ".github/workflows/fix-toonstudio-ts2741.yml",
    ".github/workflows/apply-toonstudio-final-integration-code.yml",
    ".github/workflows/repair-toonstudio-finalization-v3.yml",
    ".github/workflows/toonstudio-v3-ci.yml",
    ".github/workflows/toonstudio-session-ci-fix.yml",
    ".github/workflows/toonstudio-session-ci-repair.yml",
    ".github/workflows/repair-sync-toonstudio-session.yml",
    ".github/workflows/install-toonstudio-session-gate.yml",
    ".github/workflows/toonstudio-session-unit-tests.yml",
    ".github/workflows/toonstudio-session-typecheck.yml",
    ".github/workflows/toonstudio-session-build.yml",
    ".github/workflows/install-toonstudio-session-typecheck.yml",
    ".github/workflows/toonstudio-final-sync-v2.yml",
    ".github/workflows/integrate-toonstudio-branches.yml",
    ".github/workflows/consolidate-toonstudio-branches-once.yml",
    ".github/workflows/merge-toonstudio-session-alt.yml",
    ".github/workflows/stage-toonstudio-continuation-fixes.yml",
    ".github/workflows/toonstudio-stage-remaining-fixes.yml",
    ".github/workflows/toonstudio-session-helper-install.yml",
)

for relative in TRANSIENT_WORKFLOWS:
    target = ROOT / relative
    if target.exists():
        target.unlink()
        print(f"[delete] {relative}")

remaining = [relative for relative in TRANSIENT_WORKFLOWS if (ROOT / relative).exists()]
if remaining:
    raise RuntimeError(f"transient workflows remain: {remaining}")

print("[done] integration closure matches the restored core gate")
