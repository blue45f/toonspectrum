#!/usr/bin/env python3
from pathlib import Path
import re
import sys

TARGETS = ['marketplace-integrity.yml', 'marketplace-authoring.yml', 'studio-mesh-sync-repair.yml', 'character-merge-validation.yml', 'studio-cc0-library.yml', 'feedback-community-validation.yml', 'studio-manual.yml', 'studio-2d-asset-quality.yml', 'character-shaper-discovery-quality.yml', 'studio-production-integrity.yml', 'studio-ai-comic-director-complete.yml', 'studio-finishing-quality.yml', 'learning-quality.yml', 'studio-collaboration-sync.yml', 'studio-promo-video.yml', 'character-contact-naturalness.yml', 'studio-brush-filter-stability.yml', 'studio-discovery-ux.yml', 'creator-resources.yml', 'studio-vrm-asset-quality.yml', 'kmas-reference-library.yml']

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
