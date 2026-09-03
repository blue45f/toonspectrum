"""Compatibility entry point for the authoritative ToonStudio Blender pipeline.

Earlier revisions depended on a removed generator module. The supported path
is now the versioned character-pipeline config.
Override the default with ``scene['toonstudio_pipeline_config']`` when called
from Blender MCP.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

import bpy


ROOT = Path(__file__).resolve().parents[2]
KIT_ROOT = ROOT / "tools" / "blender"
if str(KIT_ROOT) not in sys.path:
    sys.path.insert(0, str(KIT_ROOT))

from toonstudio_blender_kit.contracts import load_config  # noqa: E402
from toonstudio_blender_kit.pipeline import run_pipeline  # noqa: E402


def main() -> None:
    raw = bpy.context.scene.get(
        "toonstudio_pipeline_config",
        str(ROOT / "config/blender/avatar-orion-production.json"),
    )
    path = Path(str(raw)).expanduser()
    if not path.is_absolute():
        path = ROOT / path
    execution = run_pipeline(load_config(path.resolve()), project_root=ROOT)
    print(
        "VRM_CHARACTER_COMPLETE "
        + json.dumps(
            {
                "characterId": execution.report.character_id,
                "score": execution.report.score,
                "outputDir": str(execution.output_dir),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
