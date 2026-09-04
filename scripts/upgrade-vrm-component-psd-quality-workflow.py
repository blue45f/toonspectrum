#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/vrm-component-psd-quality.yml"


def replace_once(old: str, new: str) -> None:
    source = WORKFLOW.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"expected one match, found {count}: {old[:120]!r}")
    WORKFLOW.write_text(source.replace(old, new, 1), encoding="utf-8")


replace_once(
    '''            src/domains/creator/vrm/studio-vrm-component-pass-plan.test.ts \\\n            src/domains/creator/vrm/studio-vrm-component-psd.ts \\\n            src/domains/creator/vrm/studio-vrm-component-psd.test.ts\n''',
    '''            src/domains/creator/vrm/studio-vrm-component-pass-plan.test.ts \\\n            src/domains/creator/vrm/studio-vrm-component-psd.ts \\\n            src/domains/creator/vrm/studio-vrm-component-psd.test.ts \\\n            src/domains/creator/vrm/studio-vrm-component-psd-export-job.ts \\\n            src/domains/creator/vrm/studio-vrm-component-psd-export-job.test.ts\n''',
)
replace_once(
    '''            src/domains/creator/vrm/studio-vrm-component-pass-plan.test.ts \\\n            src/domains/creator/vrm/studio-vrm-component-psd.test.ts\n''',
    '''            src/domains/creator/vrm/studio-vrm-component-pass-plan.test.ts \\\n            src/domains/creator/vrm/studio-vrm-component-psd.test.ts \\\n            src/domains/creator/vrm/studio-vrm-component-psd-export-job.test.ts\n''',
)

source = WORKFLOW.read_text(encoding="utf-8")
if source.count("studio-vrm-component-psd-export-job.test.ts") != 2:
    raise RuntimeError("component PSD export job must appear in lint and test gates")
print("Extended the permanent component PSD quality gate through capture orchestration")
