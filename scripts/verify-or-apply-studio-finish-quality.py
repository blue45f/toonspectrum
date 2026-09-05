#!/usr/bin/env python3
"""Apply the one-shot quality patch when present, otherwise verify that it already landed."""

from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]
applicator = ROOT / "scripts/apply-studio-finish-quality-integration.py"

if applicator.exists():
    runpy.run_path(str(applicator), run_name="__main__")
else:
    required = {
        "src/domains/creator/studio-finish-quality.ts": "inspectStudioFinishQuality",
        "src/domains/creator/StudioFinishQualityView.tsx": "data-studio-finish-quality-view",
        "src/domains/creator/StudioContinuityPanel.tsx": "qualityPages?: readonly PageState[]",
        "src/domains/creator/StudioLazyPanelStack.tsx": "qualityPages={pages}",
        "src/domains/creator/StudioProjectReviewActions.tsx": "원고 구조·대사·말풍선·이미지·레이어·검토 상태",
    }
    missing = []
    for relative, marker in required.items():
        path = ROOT / relative
        if not path.exists() or marker not in path.read_text(encoding="utf-8"):
            missing.append(f"{relative}: {marker}")
    if missing:
        raise RuntimeError("Finish-quality integration is incomplete:\n" + "\n".join(missing))
    print("Studio finish-quality integration already applied")
