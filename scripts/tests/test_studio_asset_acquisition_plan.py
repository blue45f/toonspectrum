"""Offline regressions for exact, localized source selection."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio_asset_acquisition_plan import select_planned_assets


class AcquisitionPlanTests(unittest.TestCase):
    def setUp(self):
        self.meta = {'SchoolDesk_01': {'type': 2, 'polycount': 4000}}
        self.row = {'sourceId': 'SchoolDesk_01', 'name': '교실 책상 · School Desk',
                    'kind': 'model', 'category': 'furniture', 'selectionTerm': 'desk'}

    def parse(self, rows=None, excluded=None):
        return select_planned_assets(self.meta, {'schema': 'toonspectrum.asset-acquisition-plan.v1',
                                    'assets': rows if rows is not None else [self.row]}, excluded or set())

    def test_preserves_case_sensitive_source_id(self):
        self.assertEqual(self.parse()[0][0], 'SchoolDesk_01')

    def test_excludes_existing_normalized_runtime_id(self):
        self.assertEqual(self.parse(excluded={'polyhaven-schooldesk-01'}), [])

    def test_rejects_duplicate_runtime_id(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            self.parse([self.row, self.row])

    def test_rejects_unsafe_or_missing_source(self):
        for slug in ['../model', 'https://example.com/a', 'missing', 'a\\b']:
            with self.subTest(slug=slug), self.assertRaises(ValueError):
                self.parse([{**self.row, 'sourceId': slug}])

    def test_rejects_mismatched_kind_and_excessive_geometry(self):
        with self.assertRaises(ValueError):
            self.parse([{**self.row, 'kind': 'surface-texture'}])
        self.meta['SchoolDesk_01']['polycount'] = 250001
        with self.assertRaises(ValueError):
            self.parse()

    def test_rejects_invalid_metadata(self):
        for change in [{'name': ''}, {'category': 'x' * 81}, {'selectionTerm': '\n'}, {'kind': 'background'}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.parse([{**self.row, **change}])

    def test_rejects_invalid_empty_or_unbounded_plans(self):
        for plan in [None, {}, [], {'schema': 'toonspectrum.asset-acquisition-plan.v1', 'assets': []},
                     {'schema': 'toonspectrum.asset-acquisition-plan.v1', 'assets': [self.row] * 161}]:
            with self.subTest(plan_type=type(plan)), self.assertRaises(ValueError):
                select_planned_assets(self.meta, plan, set())


if __name__ == '__main__':
    unittest.main()
