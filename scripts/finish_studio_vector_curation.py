#!/usr/bin/env python3
"""Two follow-up defects found while viewing the actual transparent SVG comparisons."""
from pathlib import Path
from apply_studio_visual_curation import replace

p = Path(__file__).resolve().parents[1] / 'src/domains/creator/studio-original-free-asset-packs.ts'
replace(p,
    'M26 118 V176 L98 210 V152 M174 118 V176 L98 210',
    'M26 118 L98 152 V210 L26 176 Z M98 152 L174 118 V176 L98 210 Z')
replace(p,
    'M92 54 V106 L170 142 V96 M230 70 V118 L170 142',
    'M92 54 L170 96 V142 L92 106 Z M170 96 L230 70 V118 L170 142 Z')
replace(p,
    '    + Array.from({ length: 10 }, (_, index) => {\n'
    '      const x = 18 + ((index * 101) % 324);\n'
    '      const y = 18 + ((index * 59) % 204);',
    '    + createStarterDotPositions(10, 360, 240, "golden-dust-sparkles").map(([x, y]) => {')
print('Closed four box side faces; independently scattered all ten dust sparkles.')
