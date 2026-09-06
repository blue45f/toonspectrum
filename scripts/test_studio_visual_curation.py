"""Tests for conservative exact-pixel curation; no network or user state."""
import unittest
from PIL import Image
from apply_studio_visual_curation import is_component, rotation_match


class ExactRotationTests(unittest.TestCase):
    def fixture(self):
        image = Image.new('RGBA', (5, 3), (0, 0, 0, 0))
        image.putpixel((0, 0), (240, 30, 70, 255))
        image.putpixel((4, 1), (10, 100, 200, 128))
        return image

    def test_exact_rotations_are_proven_not_guessed(self):
        original = self.fixture()
        for degrees, op in [(90, Image.Transpose.ROTATE_90), (180, Image.Transpose.ROTATE_180), (270, Image.Transpose.ROTATE_270)]:
            with self.subTest(degrees=degrees):
                self.assertEqual(rotation_match(original, original.transpose(op)), degrees)

    def test_one_changed_visible_pixel_prevents_retirement(self):
        original = self.fixture()
        candidate = original.transpose(Image.Transpose.ROTATE_90)
        candidate.putpixel((0, 0), (255, 255, 255, 255))
        self.assertIsNone(rotation_match(original, candidate))

    def test_alpha_difference_prevents_retirement(self):
        original = self.fixture()
        candidate = original.transpose(Image.Transpose.ROTATE_90)
        r, g, b, _ = candidate.getpixel((0, 0))
        candidate.putpixel((0, 0), (r, g, b, 1))
        self.assertIsNone(rotation_match(original, candidate))

    def test_no_resizing_or_unrelated_mirror_is_treated_as_identity(self):
        original = self.fixture()
        self.assertIsNone(rotation_match(original, original.resize((10, 6))))
        self.assertIsNone(rotation_match(original, original.transpose(Image.Transpose.FLIP_LEFT_RIGHT)))

    def test_component_boundary_does_not_retire_finished_props(self):
        self.assertTrue(is_component('kenney-building-wall'))
        self.assertTrue(is_component('kenney-roads-road-straight'))
        self.assertTrue(is_component('polyhaven-modular-street-seating'))
        for identifier in ['kenney-roads-traffic-light', 'kenney-nature-tree-pine', 'kenney-survival-tent', 'polyhaven-modern-arm-chair-01']:
            self.assertFalse(is_component(identifier))


if __name__ == '__main__':
    unittest.main()
