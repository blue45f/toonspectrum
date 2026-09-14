"""Deterministic, bounded runtime ZIPs. Source .blend files stay on the author's disk."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tempfile
from typing import Any, Mapping
import zipfile

MAX_ENTRY_BYTES = 256_000_000
MAX_TOTAL_BYTES = 512_000_000
MAX_MANIFEST_BYTES = 1_000_000
MAX_ENTRIES = 256
MANIFEST_NAME = "character-package.json"


class Utf8ZipInfo(zipfile.ZipInfo):
    """Our strict browser reader requires UTF-8 even for ASCII-only filenames.

    ZipFile resets flag_bits when opening a writer, so setting it on ZipInfo is
    insufficient. The filename encoder is used for both local and central headers.
    """
    def _encodeFilenameFlags(self):
        return self.filename.encode("utf-8"), self.flag_bits | 0x0800


def _safe_path(value: object) -> str:
    if not isinstance(value, str) or not value or len(value) > 300:
        raise ValueError("invalid package path")
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValueError("unsafe package path")
    if re.search(r'[<>:"|?*\\]', value) or value.startswith("/"):
        raise ValueError("unsafe package path")
    if any(part in {"", ".", ".."} for part in value.split("/")):
        raise ValueError("unsafe package path")
    return value


def _runtime_paths(manifest: Mapping[str, Any]) -> dict[str, Mapping[str, Any]]:
    if manifest.get("kind") != "toonstudio.character-package" or manifest.get("schemaVersion") != 1:
        raise ValueError("unsupported character package")
    quality = manifest.get("quality", {})
    score, minimum = quality.get("score"), quality.get("minimumScore")
    if (quality.get("passed") is not True or type(score) not in (int, float)
            or type(minimum) not in (int, float) or not 0 <= minimum <= score <= 100):
        raise ValueError("character package did not pass its quality gate")
    files = manifest.get("files", {})
    if not isinstance(files, dict) or not any(role in files for role in ("vrm", "glb")):
        raise ValueError("package has no runtime asset")
    selected: dict[str, Mapping[str, Any]] = {}
    names: dict[str, str] = {}
    for role, receipt in files.items():
        if role not in {"vrm", "glb", "qualityReport", "thumbnail"} and not role.startswith("preview:"):
            continue
        if not isinstance(receipt, dict):
            raise ValueError("invalid package receipt")
        path = _safe_path(receipt.get("path"))
        extension = PurePosixPath(path).suffix.casefold()
        expected = {"vrm": ".vrm", "glb": ".glb", "qualityReport": ".json"}.get(role, ".png")
        if extension != expected or path.casefold() == MANIFEST_NAME:
            raise ValueError("package role does not match its file type")
        key = path.casefold()
        if key in names and (names[key] != path or selected[names[key]] != receipt):
            raise ValueError("ambiguous package path")
        names[key] = path
        selected[path] = receipt
    if len(selected) + 1 > MAX_ENTRIES:
        raise ValueError("too many package entries")
    return selected


def create_runtime_archive(output_dir: Path, manifest: Mapping[str, Any]) -> Path:
    """Hash every included artifact and atomically publish a ZIP32 with stored entries.

    Only declared runtime/review files are included; no folder crawl, network calls,
    arbitrary HTML, source project, or symlink targets are added to the archive.
    """
    root = output_dir.resolve(strict=True)
    selected = _runtime_paths(manifest)
    payload = (json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")
    if len(payload) > MAX_MANIFEST_BYTES:
        raise ValueError("manifest exceeds browser limit")
    character_id = manifest.get("characterId", "")
    if not isinstance(character_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9._-]{1,62}", character_id):
        raise ValueError("invalid character ID")
    destination = root / f"{character_id}.toonchar.zip"
    descriptor, temporary_name = tempfile.mkstemp(prefix=".toonchar-", suffix=".tmp", dir=root)
    os.close(descriptor)
    temporary = Path(temporary_name)
    total = len(payload)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_STORED, allowZip64=False) as archive:
            def info(path: str) -> zipfile.ZipInfo:
                entry = Utf8ZipInfo(path, date_time=(1980, 1, 1, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_STORED
                entry.external_attr = 0o100644 << 16
                return entry

            archive.writestr(info(MANIFEST_NAME), payload)
            for relative, receipt in sorted(selected.items()):
                path = root / relative
                if any(parent.is_symlink() for parent in (path, *path.parents) if parent != root):
                    raise ValueError("symlinks are not package artifacts")
                path.resolve(strict=True).relative_to(root)
                expected_bytes = receipt.get("bytes")
                if type(expected_bytes) is not int or not 0 < expected_bytes <= MAX_ENTRY_BYTES:
                    raise ValueError("entry exceeds browser limit")
                if path.stat().st_size != expected_bytes:
                    raise ValueError(f"size mismatch: {relative}")
                total += expected_bytes
                if total > MAX_TOTAL_BYTES:
                    raise ValueError("package exceeds browser memory limit")
                digest, actual = hashlib.sha256(), 0
                with path.open("rb") as source, archive.open(info(relative), "w") as target:
                    while chunk := source.read(1024 * 1024):
                        actual += len(chunk)
                        if actual > expected_bytes:
                            raise ValueError(f"file changed during packaging: {relative}")
                        digest.update(chunk)
                        target.write(chunk)
                if actual != expected_bytes or digest.hexdigest() != receipt.get("sha256"):
                    raise ValueError(f"SHA-256 mismatch: {relative}")
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination
