from pathlib import Path

path = Path(__file__).resolve().parents[1] / "apps/web/src/domains/creator/layer/StudioLayerNavigator.drag.test.tsx"
source = path.read_text(encoding="utf-8")
old = 'vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")'
count = source.count(old)
if count != 2:
    raise SystemExit(f"expected two jsdom geometry mocks, found {count}")
path.write_text(source.replace(old, 'vi.spyOn(Element.prototype, "getBoundingClientRect")'), encoding="utf-8")
print("studio layer drag jsdom geometry fix applied")
