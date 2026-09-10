#!/usr/bin/env python3
"""Idempotently compose thumbnail and model technical admission into vrm-library.ts."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

IMPORTS = (
    'import {\n'
    '  isStudioVrmTechnicallyAdmittedThumbnail,\n'
    '} from "./studio-vrm-thumbnail-technical-denylist.generated";\n'
    'import { isStudioVrmProductionThumbnailUrl } from "./studio-vrm-thumbnail-quality";\n'
    'import {\n'
    '  isStudioVrmTechnicallyAdmittedModel,\n'
    '} from "./studio-vrm-model-technical-denylist.generated";\n'
    'import { isStudioVrmProductionModelUrl } from "./studio-vrm-model-quality";\n'
)

REQUIRED_IMPORT_PATHS = (
    "./studio-vrm-thumbnail-technical-denylist.generated",
    "./studio-vrm-thumbnail-quality",
    "./studio-vrm-model-technical-denylist.generated",
    "./studio-vrm-model-quality",
)

REQUIRED_FILTER_MARKERS = (
    'sample.visibility !== "legacy"',
    "isStudioVrmProductionThumbnailUrl(sample.thumbnailUrl)",
    "isStudioVrmTechnicallyAdmittedThumbnail(sample.id)",
    "isStudioVrmProductionModelUrl(sample.url)",
    "isStudioVrmTechnicallyAdmittedModel(sample.id)",
)

CANONICAL_FILTER = '''.filter(
    (sample) =>
      sample.visibility !== "legacy"
      && isStudioVrmProductionThumbnailUrl(sample.thumbnailUrl)
      && isStudioVrmTechnicallyAdmittedThumbnail(sample.id)
      && isStudioVrmProductionModelUrl(sample.url)
      && isStudioVrmTechnicallyAdmittedModel(sample.id),
  )'''


def import_block_end(text: str) -> int:
    lines = text.splitlines(keepends=True)
    offset = 0
    index = 0
    last_end = -1

    while index < len(lines):
        line = lines[index]
        if line.strip() == "":
            offset += len(line)
            index += 1
            continue
        if not line.startswith("import "):
            break

        while index < len(lines):
            current = lines[index]
            offset += len(current)
            index += 1
            if current.rstrip().endswith(";"):
                last_end = offset
                break
        else:
            raise RuntimeError("Unterminated import declaration in vrm-library.ts")

    if last_end < 0:
        raise RuntimeError("Could not locate the initial import block in vrm-library.ts")
    return last_end


def patch_imports(text: str) -> str:
    missing = [path for path in REQUIRED_IMPORT_PATHS if path not in text]
    if not missing:
        return text
    if len(missing) != len(REQUIRED_IMPORT_PATHS):
        raise RuntimeError(
            "Partial VRM quality imports found; refusing to guess how to merge them: "
            + ", ".join(missing)
        )

    insertion = import_block_end(text)
    prefix = text[:insertion]
    suffix = text[insertion:]
    if suffix.startswith("\n"):
        return prefix + IMPORTS + suffix
    return prefix + "\n" + IMPORTS + "\n" + suffix


def patch_filter(text: str) -> str:
    entries_start = text.find("export const SAMPLE_VRM_ENTRIES")
    if entries_start < 0:
        raise RuntimeError("SAMPLE_VRM_ENTRIES export was not found")
    map_start = text.find(".map(", entries_start)
    if map_start < 0:
        raise RuntimeError("SAMPLE_VRM_ENTRIES .map() boundary was not found")

    pipeline = text[entries_start:map_start]
    present = [marker in pipeline for marker in REQUIRED_FILTER_MARKERS]
    if all(present):
        return text
    if any(present[1:]):
        missing = [marker for marker, is_present in zip(REQUIRED_FILTER_MARKERS, present) if not is_present]
        raise RuntimeError(
            "Partial VRM quality filter found; refusing to overwrite it. Missing: "
            + ", ".join(missing)
        )

    pattern = re.compile(
        r"\.filter\(\s*\(sample\)\s*=>\s*sample\.visibility\s*!==\s*\"legacy\"\s*\)",
        re.MULTILINE,
    )
    match = pattern.search(pipeline)
    if match is None:
        raise RuntimeError(
            "The expected visibility-only SAMPLE_VRM_ENTRIES filter changed; manual review is required"
        )

    absolute_start = entries_start + match.start()
    absolute_end = entries_start + match.end()
    return text[:absolute_start] + CANONICAL_FILTER + text[absolute_end:]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("repo_root", type=Path)
    args = parser.parse_args()

    library = args.repo_root / "apps/web/src/domains/creator/vrm/vrm-library.ts"
    if not library.is_file():
        raise SystemExit(f"VRM library not found: {library}")

    original = library.read_text(encoding="utf-8")
    patched = patch_filter(patch_imports(original))

    for path in REQUIRED_IMPORT_PATHS:
        if path not in patched:
            raise RuntimeError(f"Required import was not composed: {path}")
    entries_start = patched.find("export const SAMPLE_VRM_ENTRIES")
    map_start = patched.find(".map(", entries_start)
    pipeline = patched[entries_start:map_start]
    for marker in REQUIRED_FILTER_MARKERS:
        if marker not in pipeline:
            raise RuntimeError(f"Required discovery admission was not composed: {marker}")

    library.write_text(patched, encoding="utf-8")
    status = "unchanged" if patched == original else "patched"
    print(f"{status}: {library}")


if __name__ == "__main__":
    main()
