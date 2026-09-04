from pathlib import Path

path = Path("scripts/verify-studio-brushes.mts")
source = path.read_text(encoding="utf-8")
old = "(performance as Performance & {"
new = "(performance as unknown as Performance & {"
count = source.count(old)
if count != 2:
    raise SystemExit(f"expected two generated browser performance casts, found {count}")
path.write_text(source.replace(old, new), encoding="utf-8")
print("Normalized two browser Performance.memory casts through unknown")
