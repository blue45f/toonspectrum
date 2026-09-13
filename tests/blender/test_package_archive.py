from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/blender"))
from toonstudio_blender_kit.package_archive import create_runtime_archive


class PackageArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.payload = b"runtime-bytes"
        (self.root / "character.glb").write_bytes(self.payload)
        self.manifest = {
            "schemaVersion": 1, "kind": "toonstudio.character-package", "characterId": "test-character",
            "quality": {"score": 92, "minimumScore": 86, "passed": True},
            "files": {"glb": {"path": "character.glb", "bytes": len(self.payload), "sha256": hashlib.sha256(self.payload).hexdigest()}},
        }

    def tearDown(self):
        self.temporary.cleanup()

    def test_archive_is_deterministic_and_contains_runtime_and_manifest_only(self):
        (self.root / "private.blend").write_bytes(b"private")
        self.manifest["files"]["blend"] = {"path": "private.blend", "bytes": 7, "sha256": "a" * 64}
        path = create_runtime_archive(self.root, self.manifest)
        before = path.read_bytes()
        self.assertEqual(create_runtime_archive(self.root, self.manifest).read_bytes(), before)
        with zipfile.ZipFile(path) as archive:
            self.assertEqual(archive.namelist(), ["character-package.json", "character.glb"])
            self.assertTrue(all(entry.compress_type == zipfile.ZIP_STORED for entry in archive.infolist()))
            self.assertTrue(all(entry.flag_bits & 0x0800 for entry in archive.infolist()))
            self.assertEqual(json.loads(archive.read("character-package.json")), self.manifest)

    def test_tampering_does_not_replace_a_previous_valid_archive(self):
        archive = create_runtime_archive(self.root, self.manifest)
        original = archive.read_bytes()
        (self.root / "character.glb").write_bytes(b"X" * len(self.payload))
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            create_runtime_archive(self.root, self.manifest)
        self.assertEqual(archive.read_bytes(), original)
        self.assertFalse(list(self.root.glob(".toonchar-*")))

    def test_paths_cannot_escape_the_output_directory(self):
        for path in ("../character.glb", "/tmp/character.glb", "C:/character.glb", "bad\x00.glb", "a//b.glb"):
            with self.subTest(path=path):
                self.manifest["files"]["glb"]["path"] = path
                with self.assertRaises(ValueError):
                    create_runtime_archive(self.root, self.manifest)

    def test_symlinks_are_not_followed(self):
        (self.root / "linked.glb").symlink_to(self.root / "character.glb")
        self.manifest["files"]["glb"]["path"] = "linked.glb"
        with self.assertRaisesRegex(ValueError, "symlinks"):
            create_runtime_archive(self.root, self.manifest)

    def test_failed_or_inconsistent_quality_gate_cannot_be_packaged(self):
        for score, passed in ((92, False), (20, True), (float("nan"), True), (True, True)):
            self.manifest["quality"].update(score=score, passed=passed)
            with self.assertRaisesRegex(ValueError, "quality gate"):
                create_runtime_archive(self.root, self.manifest)

    def test_entry_limit_is_checked_before_reading(self):
        self.manifest["files"]["glb"]["bytes"] = 256_000_001
        with self.assertRaisesRegex(ValueError, "browser limit"):
            create_runtime_archive(self.root, self.manifest)

    def test_runtime_file_type_must_match_its_role(self):
        self.manifest["files"]["glb"]["path"] = "script.py"
        with self.assertRaisesRegex(ValueError, "file type"):
            create_runtime_archive(self.root, self.manifest)

    def test_identical_thumbnail_preview_alias_is_only_packed_once(self):
        path = self.root / "preview.png"; path.write_bytes(b"png")
        receipt = {"path": "preview.png", "bytes": 3, "sha256": hashlib.sha256(b"png").hexdigest()}
        self.manifest["files"].update(thumbnail=receipt, **{"preview:neutral:front": receipt})
        with zipfile.ZipFile(create_runtime_archive(self.root, self.manifest)) as archive:
            self.assertEqual(archive.namelist().count("preview.png"), 1)

    def test_current_scene_export_is_separate_from_destructive_regeneration(self):
        source = (ROOT / "tools/blender/toonstudio_blender_kit/current_scene.py").read_text()
        self.assertNotIn("run_pipeline(", source)
        self.assertNotIn("_clear_scene_objects", source)
        self.assertNotIn("_import_source", source)
        self.assertIn("staging.rename(final)", source)
        self.assertIn("create_runtime_archive(staging, manifest)", source)


if __name__ == "__main__":
    unittest.main()
