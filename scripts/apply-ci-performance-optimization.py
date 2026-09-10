from pathlib import Path
import re

TARGETS = [
    "marketplace-integrity.yml",
    "marketplace-authoring.yml",
    "studio-mesh-sync-repair.yml",
    "character-merge-validation.yml",
    "studio-cc0-library.yml",
    "feedback-community-validation.yml",
    "studio-manual.yml",
    "studio-2d-asset-quality.yml",
    "character-shaper-discovery-quality.yml",
    "studio-production-integrity.yml",
    "studio-ai-comic-director-complete.yml",
    "studio-finishing-quality.yml",
    "learning-quality.yml",
    "studio-collaboration-sync.yml",
    "studio-promo-video.yml",
    "character-contact-naturalness.yml",
    "studio-brush-filter-stability.yml",
    "studio-discovery-ux.yml",
    "creator-resources.yml",
    "studio-vrm-asset-quality.yml",
    "kmas-reference-library.yml",
]

def top_level_end(lines, start):
    pattern = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]*:\s*(?:#.*)?$")
    for i in range(start + 1, len(lines)):
        if pattern.match(lines[i].rstrip("\n")):
            return i
    return len(lines)

def event_sections(block):
    found = []
    for i, line in enumerate(block):
        match = re.match(r"^  ([A-Za-z_][A-Za-z0-9_-]*):(?:\s*#.*)?\s*$", line.rstrip("\n"))
        if match:
            found.append((match.group(1), i))
    result = {}
    for pos, (name, start) in enumerate(found):
        end = found[pos + 1][1] if pos + 1 < len(found) else len(block)
        result[name] = block[start:end]
    preamble = block[: found[0][1]] if found else block
    return preamble, result

def field(section, key):
    if not section:
        return []
    starts = []
    for i, line in enumerate(section[1:], start=1):
        match = re.match(r"^    ([A-Za-z_][A-Za-z0-9_-]*):", line)
        if match:
            starts.append((match.group(1), i))
    for pos, (name, start) in enumerate(starts):
        if name != key:
            continue
        end = starts[pos + 1][1] if pos + 1 < len(starts) else len(section)
        return section[start:end]
    return []

def replace_events(text, filename):
    lines = text.splitlines(keepends=True)
    on_start = next((i for i, line in enumerate(lines) if line.rstrip("\n") == "on:"), None)
    if on_start is None:
        raise RuntimeError(f"{filename}: block-form on: not found")
    on_end = top_level_end(lines, on_start)
    preamble, sections = event_sections(lines[on_start + 1:on_end])
    pr = sections.get("pull_request", [])
    push = sections.get("push", [])
    pr_paths = field(pr, "paths") or field(push, "paths")
    push_paths = field(push, "paths") or pr_paths
    if not pr_paths or not push_paths:
        raise RuntimeError(f"{filename}: paths filter missing")
    workflow_path = f".github/workflows/{filename}"
    if workflow_path not in "".join(pr_paths + push_paths):
        raise RuntimeError(f"{filename}: workflow self-path missing")
    pr_branches = field(pr, "branches") or field(pr, "branches-ignore")
    if not pr and not pr_branches:
        pr_branches = field(push, "branches") or ["    branches: [main]\n"]

    new_block = list(preamble)
    new_block += ["  pull_request:\n", "    types: [opened, reopened, ready_for_review]\n"]
    new_block += pr_branches
    new_block += pr_paths
    new_block += ["  push:\n"]
    new_block += push_paths
    dispatch = sections.get("workflow_dispatch")
    new_block += dispatch if dispatch else ["  workflow_dispatch:\n"]
    for name, section in sections.items():
        if name not in {"pull_request", "push", "workflow_dispatch"}:
            new_block += section
    return "".join(lines[:on_start + 1] + new_block + lines[on_end:])

def replace_concurrency(text):
    lines = text.splitlines(keepends=True)
    replacement = [
        "concurrency:\n",
        "  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}\n",
        "  cancel-in-progress: true\n",
    ]
    start = next((i for i, line in enumerate(lines) if line.rstrip("\n") == "concurrency:"), None)
    if start is None:
        jobs = next(i for i, line in enumerate(lines) if line.rstrip("\n") == "jobs:")
        return "".join(lines[:jobs] + replacement + ["\n"] + lines[jobs:])
    end = top_level_end(lines, start)
    return "".join(lines[:start] + replacement + ["\n"] + lines[end:])

def optimize_product(path):
    text = path.read_text(encoding="utf-8")
    text = replace_events(text, path.name)
    text = replace_concurrency(text)
    text = re.sub(
        r"pnpm install --frozen-lockfile(?!\s+--prefer-offline)",
        "pnpm install --frozen-lockfile --prefer-offline",
        text,
    )
    path.write_text(text, encoding="utf-8")

def replace_between(text, start_marker, end_marker, replacement):
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[:start] + replacement + text[end:]

for filename in TARGETS:
    optimize_product(Path(".github/workflows") / filename)

ci_path = Path(".github/workflows/ci.yml")
ci = ci_path.read_text(encoding="utf-8")
ci = ci.replace("test(3 shard)", "test(4 shard)")
ci = ci.replace("루트 Vitest 스위트는 3 shard", "루트 Vitest 스위트는 4 shard")
required_ci_fragments = [
    "shard: [1, 2, 3, 4]",
    'if [[ "$GITHUB_EVENT_NAME" == "push" && "$GITHUB_REF" == "refs/heads/main" ]]; then',
    "python3 scripts/verify-pr-workflow-fanout.py",
    "studio-3d-visual:\n    needs: core",
    "studio-inapp-browser:\n    needs: core",
    "studio-inapp-feature-sweep:\n    needs: core",
    "studio-filter-dialog:\n    needs: core",
    "studio-p5-brush-real-runtime:\n    needs: core",
]
for fragment in required_ci_fragments:
    if fragment not in ci:
        raise RuntimeError(f"ci.yml optimized contract missing: {fragment}")
ci_path.write_text(ci, encoding="utf-8")

sonar_path = Path(".github/workflows/sonarqube.yml")
sonar = sonar_path.read_text(encoding="utf-8")
sonar = sonar.replace("CI's three test shards", "CI's four test shards")
sonar = sonar.replace("Require all three nonempty coverage reports", "Require all four nonempty coverage reports")
sonar = sonar.replace("for shard in 1 2 3; do", "for shard in 1 2 3 4; do")
sonar = sonar.replace(
    "pnpm install --frozen-lockfile",
    "pnpm install --frozen-lockfile --prefer-offline",
)
if "for shard in 1 2 3 4; do" not in sonar:
    raise RuntimeError("Sonar four-shard guard was not generated")
sonar_path.write_text(sonar, encoding="utf-8")

properties_path = Path("sonar-project.properties")
properties = properties_path.read_text(encoding="utf-8")
coverage4 = "coverage/sonar-coverage-4/lcov.info"
line_pattern = re.compile(r"(?m)^sonar\.javascript\.lcov\.reportPaths=(.*)$")
match = line_pattern.search(properties)
if match is None:
    raise RuntimeError("Sonar LCOV property missing")
values = [item.strip() for item in match.group(1).split(",") if item.strip()]
if coverage4 not in values:
    values.append(coverage4)
properties = line_pattern.sub(
    "sonar.javascript.lcov.reportPaths=" + ",".join(values),
    properties,
    count=1,
)
properties_path.write_text(properties, encoding="utf-8")

policy_path = Path("scripts/integration-test-runner-ci-policy.test.mjs")
policy = policy_path.read_text(encoding="utf-8")
policy = policy.replace('import { parseCLI } from "vitest/node";\n', "")
policy = re.sub(
    r'const ROOT_SHARD_COMMAND =\n  ".*?";\n',
    'const ROOT_SHARD_ARGUMENT = "--shard=${{ matrix.shard }}/${{ strategy.job-total }}";\n',
    policy,
    count=1,
    flags=re.DOTALL,
)
policy = policy.replace(
'''  it.each([
    "ci.yml", "bg3d-runtime-regression.yml", "studio-ink-live-commit.yml",
    "studio-production-integrity.yml", "character-merge-validation.yml",
    "studio-finishing-quality.yml",
  ])(
''',
'''  it.each([
    "ci.yml", "bg3d-runtime-regression.yml", "studio-ink-live-commit.yml",
  ])(
''',
)

product_test_start = '''  it.each([
    "feedback-community-validation.yml", "studio-2d-asset-quality.yml",
    "studio-brush-filter-stability.yml", "studio-manual.yml", "studio-mesh-sync-repair.yml",
  ])("keeps %s enabled while its changes are integrated before main", (filename) => {
'''
product_test_end = '''  it("reruns the ink gate when its tracked preview harness source changes", () => {
'''
product_replacement = '''  it.each([
    "marketplace-integrity.yml",
    "marketplace-authoring.yml",
    "studio-mesh-sync-repair.yml",
    "character-merge-validation.yml",
    "studio-cc0-library.yml",
    "feedback-community-validation.yml",
    "studio-manual.yml",
    "studio-2d-asset-quality.yml",
    "character-shaper-discovery-quality.yml",
    "studio-production-integrity.yml",
    "studio-ai-comic-director-complete.yml",
    "studio-finishing-quality.yml",
    "learning-quality.yml",
    "studio-collaboration-sync.yml",
    "studio-promo-video.yml",
    "character-contact-naturalness.yml",
    "studio-brush-filter-stability.yml",
    "studio-discovery-ux.yml",
    "creator-resources.yml",
    "studio-vrm-asset-quality.yml",
    "kmas-reference-library.yml",
  ])("runs %s on initial PR validation and changed-area branch pushes", (filename) => {
    const workflow = readYaml(`.github/workflows/${filename}`);
    expect(workflow.on.pull_request.types).toEqual(["opened", "reopened", "ready_for_review"]);
    expect(workflow.on.pull_request.paths).toEqual(workflow.on.push.paths);
    expect(workflow.on.push.branches).toBeUndefined();
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.concurrency).toEqual({
      group: "${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}",
      "cancel-in-progress": true,
    });
  });

'''
policy = replace_between(policy, product_test_start, product_test_end, product_replacement)

matrix_test_start = '''  it.each([1, 2, 3])("passes matrix shard %i to the actual Vitest CLI parser", (shard) => {
'''
matrix_test_end = '''  it("imports every shard's measured coverage before SonarQube analysis", () => {
'''
matrix_replacement = '''  it.each([1, 2, 3, 4])("keeps matrix shard %i in the four-way root suite", (shard) => {
    const workflow = readYaml(".github/workflows/ci.yml");
    const matrix = workflow.jobs.test.strategy.matrix.shard;
    expect(matrix).toEqual([1, 2, 3, 4]);
    expect(matrix).toContain(shard);

    const step = workflow.jobs.test.steps.find(
      (candidate) => candidate.name === "Run this shard of the root Vitest suite with per-file progress",
    );
    expect(step?.run).toContain(`args=(${ROOT_SHARD_ARGUMENT})`);
    expect(step?.run).toContain(
      'if [[ "$GITHUB_EVENT_NAME" == "push" && "$GITHUB_REF" == "refs/heads/main" ]]; then',
    );
    expect(step?.run).toContain(
      'args+=(--coverage --coverage.reportsDirectory=coverage/shard-${{ matrix.shard }} --testTimeout=120000)',
    );
    expect(step?.run).toContain('pnpm run test:root "${args[@]}"');
  });

'''
policy = replace_between(policy, matrix_test_start, matrix_test_end, matrix_replacement)
policy = policy.replace("Require all three nonempty coverage reports", "Require all four nonempty coverage reports")
policy = policy.replace("toEqual([1, 2, 3]);", "toEqual([1, 2, 3, 4]);")
policy = re.sub(
    r"pnpm install --frozen-lockfile(?!\s+--prefer-offline)",
    "pnpm install --frozen-lockfile --prefer-offline",
    policy,
)
policy = policy.replace(
'    const shardStepIndex = (shardJob?.steps ?? []).findIndex(\n      (step) => step.run === ROOT_SHARD_COMMAND,\n    );\n',
'    const shardStepIndex = (shardJob?.steps ?? []).findIndex(\n      (step) => step.name === "Run this shard of the root Vitest suite with per-file progress",\n    );\n',
)
policy = policy.replace(
'''    expect(shardJob?.steps?.[shardStepIndex]).toMatchObject({
      name: "Run this shard of the root Vitest suite with per-file progress",
      "timeout-minutes": 20,
      run: ROOT_SHARD_COMMAND,
    });
    expect(shardCommands.filter((command) => command === ROOT_SHARD_COMMAND)).toHaveLength(1);
''',
'''    expect(shardJob?.steps?.[shardStepIndex]).toMatchObject({
      name: "Run this shard of the root Vitest suite with per-file progress",
      "timeout-minutes": 20,
    });
    expect(shardJob?.steps?.[shardStepIndex]?.run).toContain(ROOT_SHARD_ARGUMENT);
''',
)
policy = policy.replace(
'''      "pnpm run verify:toolchain-coverage",
      "pnpm run lint",
''',
'''      "pnpm run verify:toolchain-coverage",
      "python3 scripts/verify-pr-workflow-fanout.py",
      "pnpm run lint",
''',
)
policy = policy.replace("      expect(job?.needs).toBeUndefined();", '      expect(job?.needs).toBe("core");')
if "parseCLI" in policy or "ROOT_SHARD_COMMAND" in policy:
    raise RuntimeError("stale parser-based shard policy remains")
if "Require all three" in policy or "toEqual([1, 2, 3]);" in policy:
    raise RuntimeError("stale three-shard policy remains")
policy_path.write_text(policy, encoding="utf-8")

verifier_template = r'''#!/usr/bin/env python3
from pathlib import Path
import re
import sys

TARGETS = __TARGETS__

def top_level_end(lines, start):
    for i in range(start + 1, len(lines)):
        if re.match(r"^[A-Za-z_][A-Za-z0-9_-]*:", lines[i]):
            return i
    return len(lines)

def section(text, event):
    lines = text.splitlines()
    on = next(i for i, line in enumerate(lines) if line == "on:")
    end = top_level_end(lines, on)
    starts = []
    for i in range(on + 1, end):
        match = re.match(r"^  ([A-Za-z_][A-Za-z0-9_-]*):", lines[i])
        if match:
            starts.append((match.group(1), i))
    for pos, (name, start) in enumerate(starts):
        if name == event:
            stop = starts[pos + 1][1] if pos + 1 < len(starts) else end
            return "\n".join(lines[start:stop])
    raise AssertionError(f"{event} missing")

failures = []
for filename in TARGETS:
    path = Path(".github/workflows") / filename
    text = path.read_text(encoding="utf-8")
    try:
        pr = section(text, "pull_request")
        push = section(text, "push")
        assert "types: [opened, reopened, ready_for_review]" in pr
        assert "synchronize" not in pr
        assert not re.search(r"^    branches(?:-ignore)?:", push, re.MULTILINE)
        assert f".github/workflows/{filename}" in pr
        assert f".github/workflows/{filename}" in push
        assert "group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}" in text
    except (AssertionError, StopIteration) as error:
        failures.append(f"{filename}: {error}")
if failures:
    print("\n".join(failures), file=sys.stderr)
    raise SystemExit(1)
print(f"Verified changed-area trigger policy for {len(TARGETS)} product workflows.")
'''
verifier = verifier_template.replace("__TARGETS__", repr(TARGETS))
Path("scripts/verify-pr-workflow-fanout.py").write_text(verifier, encoding="utf-8")

Path(".qa").mkdir(exist_ok=True)
report = (
    "# CI performance optimization\n\n"
    "- Required check preserved: `CI / core`.\n"
    "- Root Vitest uses four shards; PR runs skip V8 coverage.\n"
    "- Coverage and SonarQube run on main with four LCOV artifacts.\n"
    "- Non-required browser jobs start after `core`.\n"
    "- 21 product workflows run on PR opened/reopened/ready-for-review and on changed-area branch pushes.\n"
    "- Product installs use pnpm `--prefer-offline`.\n"
)
Path(".qa/ci-performance-optimization-2026-09-11.md").write_text(report, encoding="utf-8")
print("Generated CI performance optimization.")
