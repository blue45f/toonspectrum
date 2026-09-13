"""Synthetic regression tests; these do not constitute visual approval of real assets."""
import math
from pathlib import Path
import runpy
import unittest

import numpy as np
from PIL import Image

MODULE = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'studio-premium-assets-20260913.py'))
project = MODULE['project_panorama']
select = MODULE['select_backgrounds']


class ProjectionTests(unittest.TestCase):
    def test_preserves_constant_color_and_output_dimensions(self):
        image = Image.new('RGB', (256, 128), (40, 100, 170))
        result = project(image, 64, 36)
        self.assertEqual(result.size, (64, 36))
        np.testing.assert_array_equal(np.asarray(result), np.full((36, 64, 3), [40, 100, 170], dtype=np.uint8))

    def test_horizon_and_vertical_orientation(self):
        pixels = np.zeros((128, 256, 3), dtype=np.uint8)
        pixels[:64, :, 0] = 255
        pixels[64:, :, 2] = 255
        result = np.asarray(project(Image.fromarray(pixels), 64, 36))
        self.assertGreater(result[0, 32, 0], 200)
        self.assertGreater(result[-1, 32, 2], 200)

    def test_yaw_selects_opposite_longitude(self):
        pixels = np.zeros((128, 256, 3), dtype=np.uint8)
        pixels[:, 64:192, 1] = 255
        front = np.asarray(project(Image.fromarray(pixels), 64, 36, 0))
        back = np.asarray(project(Image.fromarray(pixels), 64, 36, math.pi))
        self.assertGreater(front[18, 32, 1], 240)
        self.assertLess(back[18, 32, 1], 10)

    def test_refuses_upsampled_angular_resolution(self):
        with self.assertRaisesRegex(ValueError, 'angular resolution'):
            project(Image.new('RGB', (128, 64)), 64, 36)

    def test_refuses_non_panorama(self):
        with self.assertRaises(ValueError):
            project(Image.new('RGB', (256, 256)), 64, 36)

    def test_refuses_nonfinite_and_unbounded_arguments(self):
        image = Image.new('RGB', (256, 128))
        for width, height, yaw in [(0, 36, 0), (64, 0, 0), (8192, 36, 0), (64, 36, math.inf), (64, 36, math.nan)]:
            with self.subTest(width=width, height=height, yaw=yaw), self.assertRaises(ValueError):
                project(image, width, height, yaw)


class SelectionTests(unittest.TestCase):
    def test_native_resolution_and_existing_sources_are_enforced(self):
        metadata = {
            'forest_small': {'type': 0, 'max_resolution': [4096, 2048], 'download_count': 1000},
            'forest_large': {'type': 0, 'max_resolution': [8192, 4096], 'download_count': 500},
            'forest_existing': {'type': 0, 'max_resolution': [8192, 4096]},
            'forest_model': {'type': 2, 'max_resolution': [8192, 4096]},
            'forest_huge': {'type': 0, 'max_resolution': [32768, 16384]},
        }
        self.assertEqual([row[0] for row in select(metadata, {'forest_existing'})], ['forest_large'])

    def test_source_deduplication_across_overlapping_categories(self):
        metadata = {'street_alley': {'type': 0, 'max_resolution': [8192, 4096], 'category': 'street alley'}}
        self.assertEqual(len(select(metadata, set())), 1)

    def test_disallows_path_injection(self):
        metadata = {'../forest': {'type': 0, 'max_resolution': [8192, 4096]}}
        self.assertEqual(select(metadata, set()), [])


if __name__ == '__main__':
    unittest.main()
