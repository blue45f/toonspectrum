#!/usr/bin/env python3
"""Apply narrowly scoped, idempotent type-contract repairs before quality validation."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "src/domains/creator"
pending = {}

def edit(path, before, after):
    text = pending.get(path, path.read_text(encoding="utf-8"))
    count = text.count(before)
    if count == 0 and after in text:
        return
    if count != 1:
        raise RuntimeError(f"Expected one source anchor in {path.name}: {before[:100]!r}")
    pending[path] = text.replace(before, after, 1)

engine = BASE / "studio-finish-quality.ts"
edit(engine, "  El,\n  ImageEl,\n", "  El,\n")
edit(engine, "  image: ImageEl,", '  image: Extract<El, { type: "image" }>,')
# Retain the discriminated-union reference in callbacks; image metadata is taken
# from the canonical El union instead of recreating the private layer contract.
edit(engine, "  for (const thread of comments.threads) {\n    const owner = pageById.get(thread.anchor.pageId);",
     "  for (const thread of comments.threads) {\n    const anchor = thread.anchor;\n    const owner = pageById.get(anchor.pageId);")
text = pending.get(engine, engine.read_text(encoding="utf-8"))
start = text.index("  for (const thread of comments.threads) {")
end = text.index("\nexport function", start)
region = text[start:end].replace("thread.anchor.", "anchor.")
pending[engine] = text[:start] + region + text[end:]

test = BASE / "studio-finish-quality.test.ts"
edit(test, '            strokeWidth: 0,\n            rotation: 0,', '            strokeWidth: 0,')
edit(test, '              height: 600,\n              rotation: 0,\n              name: "rough guide",',
     '              height: 600,\n              name: "rough guide",')

changed = [p for p, content in pending.items() if p.read_text(encoding="utf-8") != content]
if "--check" in sys.argv:
    if changed:
        raise RuntimeError("Type repairs are not applied: " + ", ".join(p.name for p in changed))
else:
    for path in changed:
        path.write_text(pending[path], encoding="utf-8")
print(f"Quality type contracts verified; changed files: {len(changed)}")
