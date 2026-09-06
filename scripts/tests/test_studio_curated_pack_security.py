"""Synthetic regression fixtures for the offline glTF packer's trust boundaries."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pack_studio_curated_gltf as p


class PackSecurityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / 'model.gltf'
        self.output = self.root / 'model.glb'
        self.provenance = self.output.with_suffix('.provenance.json')
        (self.root / 'a.bin').write_bytes(b'1234')
        (self.root / 'a.png').write_bytes(b'\x89PNG\r\n\x1a\nsynthetic')
        self.doc = {'asset': {'version': '2.0'}, 'buffers': [{'uri': 'a.bin', 'byteLength': 4}],
                    'bufferViews': [{'buffer': 0, 'byteLength': 4}], 'images': [{'uri': 'a.png'}]}
        self.save()

    def save(self):
        self.source.write_text(json.dumps(self.doc), encoding='utf-8')

    def test_encoded_windows_separator_drive_and_control_characters_rejected(self):
        for name in ['%5c%5cserver%5cimage.png', 'C%3aimage.png', 'a%00.png', 'a%0a.png', '%2fetc/passwd', 'a//b.png', '%2e%2e/a.png']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                p.dependency(self.root, name)

    def test_legitimate_encoded_filename_is_preserved(self):
        (self.root / '한 글.png').write_bytes(b'content')
        self.assertEqual(p.dependency(self.root, '%ED%95%9C%20%EA%B8%80.png'), self.root / '한 글.png')

    def test_existing_provenance_never_overwritten_or_model_created(self):
        self.provenance.write_text('keep')
        with self.assertRaises(ValueError):
            p.pack_with_provenance(self.source, self.output)
        self.assertEqual(self.provenance.read_text(), 'keep')
        self.assertFalse(self.output.exists())

    def test_symlink_provenance_does_not_modify_target(self):
        victim = self.root / 'important.json'
        victim.write_text('keep')
        self.provenance.symlink_to(victim)
        with self.assertRaises(ValueError):
            p.pack_with_provenance(self.source, self.output)
        self.assertEqual(victim.read_text(), 'keep')
        self.assertFalse(self.output.exists())

    def test_broken_symlink_provenance_is_also_rejected(self):
        self.provenance.symlink_to(self.root / 'absent.json')
        with self.assertRaises(ValueError):
            p.pack_with_provenance(self.source, self.output)
        self.assertFalse(self.output.exists())

    def test_provenance_race_never_overwrites_concurrent_file(self):
        original = p.pack
        def competing_write(source, destination):
            result = original(source, destination)
            self.provenance.write_text('concurrent owner')
            return result
        with patch.object(p, 'pack', side_effect=competing_write), self.assertRaises(FileExistsError):
            p.pack_with_provenance(self.source, self.output)
        self.assertEqual(self.provenance.read_text(), 'concurrent owner')

    def test_valid_pair_records_exact_output_hash(self):
        result = p.pack_with_provenance(self.source, self.output)
        self.assertEqual(json.loads(self.provenance.read_text()), result)
        self.assertEqual(result['glbSha256'], p.digest(self.output.read_bytes()))

    def test_malformed_asset_views_images_fail_before_output(self):
        mutations = [('asset', None), ('bufferViews', [None]), ('images', {}), ('images', [None])]
        for key, value in mutations:
            with self.subTest(key=key, value=value):
                original = self.doc[key]
                self.doc[key] = value
                self.save()
                with self.assertRaises(ValueError):
                    p.pack(self.source, self.output)
                self.assertFalse(self.output.exists())
                self.doc[key] = original

    def test_image_count_budget_before_dependency_reads(self):
        self.doc['images'] = [{'uri': 'missing.png'}] * (p.MAX_IMAGES + 1)
        self.save()
        with self.assertRaisesRegex(ValueError, 'image count'):
            p.pack(self.source, self.output)
        self.assertFalse(self.output.exists())

    def test_bool_is_not_buffer_index(self):
        self.doc['bufferViews'][0]['buffer'] = False
        self.save()
        with self.assertRaises(ValueError):
            p.pack(self.source, self.output)

    def test_output_must_have_glb_extension(self):
        with self.assertRaises(ValueError):
            p.pack(self.source, self.root / 'unexpected.json')


if __name__ == '__main__':
    unittest.main()
