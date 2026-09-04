#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/cleanup-merged-branches.mjs"
TEST = ROOT / "scripts/cleanup-merged-branches.test.ts"


def replace_once(path: Path, old: str, new: str) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:120]!r}")
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


replace_once(
    SCRIPT,
    '''async function inspectAndMaybeDelete(repository, rawBranch, context) {\n''',
    '''async function currentRefSha(repository, branch, token) {\n  try {\n    const ref = await github(\n      `/repos/${repository.owner}/${repository.repo}/git/ref/heads/${encodeGitRef(branch)}`,\n      { token },\n    );\n    return typeof ref?.object?.sha === "string" ? ref.object.sha : null;\n  } catch (error) {\n    if (error.status === 404) return null;\n    throw error;\n  }\n}\n\nasync function inspectAndMaybeDelete(repository, rawBranch, context) {\n''',
)
replace_once(
    SCRIPT,
    '''  await closeIntegratedPullRequests(repository, name, token, apply, report);\n  if (apply) {\n    try {\n      await github(`/repos/${repository.owner}/${repository.repo}/git/refs/heads/${encodeGitRef(name)}`, {\n        method: "DELETE",\n        token,\n      });\n''',
    '''  const verifiedSha = await currentRefSha(repository, name, token);\n  if (verifiedSha === null) {\n    report.skipped.push({ branch: name, sha: currentSha, reason: "already-deleted" });\n    return;\n  }\n  if (verifiedSha !== currentSha) {\n    report.skipped.push({\n      branch: name,\n      sha: currentSha,\n      currentSha: verifiedSha,\n      reason: "head-changed-after-verification",\n    });\n    return;\n  }\n\n  await closeIntegratedPullRequests(repository, name, token, apply, report);\n  if (apply) {\n    try {\n      await github(`/repos/${repository.owner}/${repository.repo}/git/refs/heads/${encodeGitRef(name)}`, {\n        method: "DELETE",\n        token,\n      });\n''',
)
replace_once(
    TEST,
    '''    | "invalid-sha"\n    | "unique-commits";\n''',
    '''    | "invalid-sha"\n    | "unique-commits";\n''',
) if False else None

# Source-level regression: the ref must be re-read before an open PR is closed or the ref is deleted.
source = SCRIPT.read_text(encoding="utf-8")
marker = '''  it("rechecks the remote ref before closing a stale PR or deleting its branch", () => {\n    const source = readFileSync(new URL("./cleanup-merged-branches.mjs", import.meta.url), "utf8");\n    const decision = source.indexOf("if (!decision.allowed)");\n    const recheck = source.indexOf("const verifiedSha = await currentRefSha", decision);\n    const closePulls = source.indexOf("await closeIntegratedPullRequests", decision);\n    const deleteRef = source.indexOf('method: "DELETE"', closePulls);\n    expect(recheck).toBeGreaterThan(decision);\n    expect(closePulls).toBeGreaterThan(recheck);\n    expect(deleteRef).toBeGreaterThan(closePulls);\n    expect(source).toContain('reason: "head-changed-after-verification"');\n  });\n'''
test = TEST.read_text(encoding="utf-8")
if 'from "node:fs"' not in test:
    test = test.replace(
        'import { describe, expect, it } from "vitest";\n',
        'import { readFileSync } from "node:fs";\n\nimport { describe, expect, it } from "vitest";\n',
        1,
    )
insert_at = test.rfind("});\n")
if insert_at < 0:
    raise RuntimeError("could not find test suite boundary")
test = test[:insert_at] + "\n" + marker + test[insert_at:]
TEST.write_text(test, encoding="utf-8")

for required in (
    "async function currentRefSha",
    "const verifiedSha = await currentRefSha",
    'reason: "head-changed-after-verification"',
):
    if required not in SCRIPT.read_text(encoding="utf-8"):
        raise RuntimeError(f"missing branch cleanup hardening marker: {required}")

print("Hardened merged-branch cleanup against branch-head races")
