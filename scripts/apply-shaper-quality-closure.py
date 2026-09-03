#!/usr/bin/env python3
from __future__ import annotations

import base64
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAYLOAD_DIR = ROOT / "scripts" / ".shaper-quality-payload"

encoded = "".join(
    (PAYLOAD_DIR / f"{index:02d}.txt").read_text(encoding="utf-8").strip()
    for index in range(6)
)
source = zlib.decompress(base64.b64decode(encoded, validate=True)).decode("utf-8")
# Some transport layers rewrite comment openers inside compressed generator literals.
# Restore the four audited JSDoc markers before compiling the migration itself.
source = source.replace("**()", "/**")
exec(compile(source, str(Path(__file__).with_name("shaper-quality-closure.payload.py")), "exec"))

# Keep generated imports in the repository's type-import ordering contract.
semantic_path = ROOT / "src/domains/creator/vrm/studio-vrm-semantic-face-morph.ts"
semantic = semantic_path.read_text(encoding="utf-8")
semantic = semantic.replace(
    'import type * as THREE from "three";\n\nimport {\n',
    'import {\n',
    1,
)
semantic = semantic.replace(
    'import type { VRM } from "@pixiv/three-vrm";\n',
    'import type { VRM } from "@pixiv/three-vrm";\nimport type * as THREE from "three";\n',
    1,
)
semantic_path.write_text(semantic, encoding="utf-8")

# The supported standing-pose path now calls commitPose directly.
mannequin_path = ROOT / "src/domains/creator/scene-3d/StudioMannequinPoserPanel.tsx"
mannequin = mannequin_path.read_text(encoding="utf-8")
old_dependencies = '  }, [applyPosePreset, commitParams, params]);'
new_dependencies = '  }, [applyPosePreset, commitParams, commitPose, params]);'
if mannequin.count(old_dependencies) != 1:
    raise RuntimeError("mannequin Shaper callback dependency anchor changed")
mannequin_path.write_text(
    mannequin.replace(old_dependencies, new_dependencies, 1),
    encoding="utf-8",
)
