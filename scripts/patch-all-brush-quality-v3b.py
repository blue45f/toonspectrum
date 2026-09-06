from __future__ import annotations

import re
from pathlib import Path


path = Path("scripts/aggregate-studio-all-brush-long-stroke.mts")
source = path.read_text(encoding="utf-8")

old = '''    const a = pixel * baselineCommitted.channels;
    const b = pixel * gpuCommitted.channels;
    // Compare the operation's effect against each mode's own blank, not the absolute'''
new = '''    // Compare the operation's effect against each mode's own blank, not the absolute'''
if source.count(old) != 1:
    raise SystemExit(f"cross-engine obsolete offsets: expected one marker, found {source.count(old)}")
source = source.replace(old, new, 1)

source, count = re.subn(
    r'''\nfunction transitionRatio\(.*?\n\}\n\nfunction settleRatio\(.*?\n\}\n\nfunction performanceEvidence''',
    "\nfunction performanceEvidence",
    source,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"obsolete transition helpers: expected one block, found {count}")

source, count = re.subn(
    r'''\nfunction ownQualityPassed\(.*?\n\}\n\nfunction qualityEvidence''',
    "\nfunction qualityEvidence",
    source,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"obsolete own-quality helper: expected one block, found {count}")

path.write_text(source, encoding="utf-8")
print("Removed obsolete generic-quality helpers")
