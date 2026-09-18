#!/usr/bin/env python3
import argparse
from pathlib import Path
import re
import sys

TARGETS = ['marketplace-integrity.yml', 'marketplace-authoring.yml', 'studio-mesh-sync-repair.yml', 'character-merge-validation.yml', 'studio-cc0-library.yml', 'feedback-community-validation.yml', 'studio-manual.yml', 'studio-2d-asset-quality.yml', 'character-shaper-discovery-quality.yml', 'studio-production-integrity.yml', 'studio-ai-comic-director-complete.yml', 'studio-finishing-quality.yml', 'learning-quality.yml', 'studio-collaboration-sync.yml', 'studio-promo-video.yml', 'character-contact-naturalness.yml', 'studio-brush-filter-stability.yml', 'studio-discovery-ux.yml', 'creator-resources.yml', 'studio-vrm-asset-quality.yml', 'kmas-reference-library.yml']
FOCUSED_ONLY = {'studio-cc0-library.yml', 'studio-vrm-asset-quality.yml'}
ROOT_GATE_PATTERNS = (
    (re.compile(r"^\s*(?:(?:-\s*)?run:\s*)?pnpm exec tsc -p tsconfig\.json(?:\s+[^#\n]+)?\s*$", re.MULTILINE), 'repository-wide TypeScript'),
    (re.compile(r"^\s*(?:(?:-\s*)?run:\s*)?pnpm (?:run )?typecheck(?:\s+[^#\n]+)?\s*$", re.MULTILINE), 'repository-wide typecheck'),
    (re.compile(r"^\s*(?:(?:-\s*)?run:\s*)?pnpm (?:run )?build\s*$", re.MULTILINE), 'repository-wide production build'),
)


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


def list_field(block, key):
    """Read only the flow/block string lists used in our reviewed event filters."""
    lines = block.splitlines()
    for index, line in enumerate(lines):
        match = re.fullmatch(r"    " + re.escape(key) + r":\s*(.*)", line)
        if not match:
            continue
        value = match.group(1).strip()
        if value:
            assert value.startswith("[") and value.endswith("]"), f"unsupported {key} list"
            return [item.strip().strip("\"'") for item in value[1:-1].split(",") if item.strip()]
        values = []
        for item in lines[index + 1:]:
            if not item.strip() or item.lstrip().startswith("#"):
                continue
            if not item.startswith("      - "):
                break
            values.append(item[8:].strip().strip("\"'"))
        return values
    return None


def validate_focused_ownership(filename, text):
    if filename not in FOCUSED_ONLY:
        return
    for pattern, gate in ROOT_GATE_PATTERNS:
        assert not pattern.search(text), f"focused workflow repeats {gate}; CI/core owns global gates"


def validate_repository(root):
    failures = []
    for filename in TARGETS:
        try:
            text = (root / ".github/workflows" / filename).read_text(encoding="utf-8")
            pr = section(text, "pull_request")
            push = section(text, "push")
            assert list_field(pr, "types") == ["opened", "reopened", "synchronize", "ready_for_review"], "PR must validate every new head (synchronize)"
            expected = list_field(pr, "branches") or ["main"]
            assert list_field(push, "branches") == expected, "push must target only PR base branches, never every feature branch"
            assert all(name in ["main", "release/salvage-integration-20260908"] for name in expected), "unreviewed target branch"
            assert not re.search(r"^    branches-ignore:", push, re.MULTILINE), "negative push filters are forbidden"
            paths = list_field(pr, "paths")
            assert paths and paths == list_field(push, "paths"), "PR/push changed-area filters must match"
            assert f".github/workflows/{filename}" in paths, "workflow must validate its own changes"
            section(text, "workflow_dispatch")
            concurrency = re.search(r"^concurrency:\n((?:[ \t].*\n|\n|#.*\n)*)", text, re.MULTILINE)
            assert concurrency, "missing workflow concurrency"
            assert "  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}" in concurrency.group(1).splitlines(), "concurrency must be scoped to workflow and PR/ref, not SHA"
            assert "  cancel-in-progress: true" in concurrency.group(1).splitlines(), "obsolete runs must be cancelled"
            validate_focused_ownership(filename, text)
        except (AssertionError, StopIteration, OSError) as error:
            failures.append(f"{filename}: {error}")
    return failures


def main():
    parser = argparse.ArgumentParser(description="Validate deduplicated, current-head PR CI without installing dependencies.")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    failures = validate_repository(args.root)
    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    print(f"Verified PR updates, target-branch pushes, cancellation, and focused ownership for {len(TARGETS)} product workflows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
