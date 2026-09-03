#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import io
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[1]
PARTS = sorted((ROOT / "scripts").glob(".blender-character-pipeline.part*"))
EXPECTED_SHA256 = "12112b5dcc38cbf72e937e308ce108b32779f5a04cf0c993c3c1d83949e10a7c"
ALLOWED_PREFIXES = (
    ".github/workflows/blender-character-pipeline.yml",
    "config/blender/",
    "docs/studio/blender-character-pipeline.md",
    "scripts/blender/",
    "scripts/import-blender-character-package.mts",
    "scripts/setup-toonstudio-blender-pipeline.mts",
    "scripts/verify-blender-character-pipeline.mjs",
    "src/domains/creator/vrm/studio-vrm-blender-character-package",
    "tests/blender/",
    "tools/blender/toonstudio_blender_kit/",
)


def allowed(name: str) -> bool:
    return any(name == prefix or name.startswith(prefix) for prefix in ALLOWED_PREFIXES)


def main() -> None:
    if not PARTS:
        raise RuntimeError("Blender pipeline payload parts are missing")
    encoded = "".join(part.read_text(encoding="utf-8").strip() for part in PARTS)
    archive = base64.b64decode(encoded, validate=True)
    actual = hashlib.sha256(archive).hexdigest()
    if actual != EXPECTED_SHA256:
        raise RuntimeError(f"payload SHA-256 mismatch: {actual}")
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as bundle:
        members = bundle.getmembers()
        for member in members:
            name = member.name.replace("\\", "/")
            path = Path(name)
            if (
                member.issym()
                or member.islnk()
                or path.is_absolute()
                or ".." in path.parts
                or not allowed(name)
            ):
                raise RuntimeError(f"unsafe or unexpected payload member: {name}")
        bundle.extractall(ROOT, members=members, filter="data")
    print(f"Applied ToonStudio Blender character pipeline ({len(members)} files)")


if __name__ == "__main__":
    main()
