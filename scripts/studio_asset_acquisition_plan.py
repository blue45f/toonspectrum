"""Validate explicit source selections without treating them as visual approval."""
from __future__ import annotations
import re


def select_planned_assets(metadata: dict, plan: object, excluded: set[str]) -> list[tuple]:
    if not isinstance(plan, dict) or plan.get('schema') != 'toonspectrum.asset-acquisition-plan.v1':
        raise ValueError('Unsupported acquisition plan schema')
    rows = plan.get('assets')
    if not isinstance(rows, list) or not 1 <= len(rows) <= 160:
        raise ValueError('An acquisition plan requires 1–160 selections')
    result, seen = [], set()
    excluded = {identifier.lower() for identifier in excluded}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError('Invalid acquisition selection')
        slug, kind = row.get('sourceId'), row.get('kind')
        if not isinstance(slug, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', slug):
            raise ValueError('Unsafe source identifier')
        identifier = 'polyhaven-' + slug.replace('_', '-').lower()
        if identifier in seen:
            raise ValueError('Duplicate normalized source identifier')
        seen.add(identifier)
        if kind not in ('model', 'surface-texture'):
            raise ValueError('Unsupported planned asset kind')
        for key, maximum in (('name', 160), ('category', 80), ('selectionTerm', 100)):
            value = row.get(key)
            if not isinstance(value, str) or not 1 <= len(value) <= maximum or any(ord(c) < 32 for c in value):
                raise ValueError('Invalid localized selection metadata')
        source = metadata.get(slug)
        if not isinstance(source, dict) or source.get('type') != (2 if kind == 'model' else 1):
            raise ValueError('Source does not exist or has an incompatible kind')
        if kind == 'model':
            polygons = source.get('polycount')
            if type(polygons) is not int or not 0 < polygons <= 250_000:
                raise ValueError('Planned model exceeds geometry budget')
        if identifier not in excluded:
            result.append((slug, kind, row['selectionTerm'], source))
    return result
