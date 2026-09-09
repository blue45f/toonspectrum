from __future__ import annotations

from pathlib import Path

SCRIPT = Path(__file__).resolve().with_name("apply-studio-pixel-pencil-pro-ui.py")
source = SCRIPT.read_text(encoding="utf-8")

symmetry_old = '''  | "horizontal"
  | "radial"
  | "kaleidoscope";
'''
symmetry_new = '''  | "horizontal"
  | "radial"
  | "kaleidoscope"
  | "silk";
'''
if symmetry_old in source:
    source = source.replace(symmetry_old, symmetry_new, 1)
elif '  | "silk";\n' not in source:
    raise RuntimeError("pixel-pencil UI patch: symmetry union marker not found")

labels_old = '''  horizontal: "가로",
  radial: "방사",
  kaleidoscope: "만화경",
};
'''
labels_new = '''  horizontal: "가로",
  radial: "방사",
  kaleidoscope: "만화경",
  silk: "실크",
};
'''
if labels_old in source:
    source = source.replace(labels_old, labels_new, 1)
elif '  silk: "실크",\n' not in source:
    raise RuntimeError("pixel-pencil UI patch: symmetry label marker not found")

SCRIPT.write_text(source, encoding="utf-8")
print("Prepared complete pixel-pencil UI symmetry contract")
