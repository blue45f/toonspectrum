"""Package a bounded offline QA preview without changing the production dist."""
from pathlib import Path
import json
import tarfile

root = Path("dist")
allowed = {".html", ".js", ".mjs", ".css", ".json", ".svg", ".ico", ".png", ".jpg", ".jpeg", ".webp", ".woff", ".woff2", ".webmanifest", ".txt"}
files = set(path for path in root.iterdir() if path.is_file() and path.suffix in allowed)
# Vite bundles live directly in assets. Recursive asset libraries contain editor media.
assets = root / "assets"
if assets.is_dir():
    files.update(path for path in assets.iterdir() if path.is_file() and path.suffix in allowed)
for directory in ("brand", "fonts", "icons", "i18n", "locales"):
    path = root / directory
    if path.is_dir():
        files.update(item for item in path.rglob("*") if item.is_file() and item.suffix in allowed and item.stat().st_size < 8_000_000)
# Include compact static catalog data, but not any large downloaded asset corpora.
for directory in ("data", "catalog"):
    path = root / directory
    if path.is_dir():
        files.update(item for item in path.rglob("*.json") if item.stat().st_size < 8_000_000)
total = sum(path.stat().st_size for path in files)
print(json.dumps({"files": len(files), "uncompressedBytes": total, "scope": "offline non-Studio QA subset; full dist is used for CI browser tests"}))
if total > 250_000_000:
    raise SystemExit("QA preview exceeds 250 MB; inspect selection rather than upload an unbounded asset library")
with tarfile.open("/tmp/non-studio-web-preview.tar.gz", "w:gz") as archive:
    for path in sorted(files):
        archive.add(path, arcname=str(path), recursive=False)
