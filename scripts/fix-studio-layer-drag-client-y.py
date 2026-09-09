from pathlib import Path

path = Path(__file__).resolve().parents[1] / "apps/web/src/domains/creator/layer/StudioLayerNavigator.drag.test.tsx"
source = path.read_text(encoding="utf-8")

marker = '''function layerRow(name: RegExp): HTMLElement {
'''
helper = '''function dragOverAt(target: HTMLElement, transfer: DataTransfer, clientY: number) {
  // jsdom does not expose DragEvent, so Testing Library's convenience constructor may discard
  // MouseEventInit coordinates. Define the two native drag fields explicitly.
  const event = new Event("dragover", { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientY: { configurable: true, value: clientY },
    dataTransfer: { configurable: true, value: transfer },
  });
  fireEvent(target, event);
}

'''
if source.count(marker) != 1:
    raise SystemExit("expected one layerRow helper marker")
source = source.replace(marker, helper + marker, 1)

replacements = {
    '''    fireEvent.dragOver(target, { dataTransfer: transfer, clientY: 105 });
''': '''    dragOverAt(target, transfer, 105);
''',
    '''    fireEvent.dragOver(target, { dataTransfer: transfer, clientY: 120 });
''': '''    dragOverAt(target, transfer, 120);
''',
}
for old, new in replacements.items():
    if source.count(old) != 1:
        raise SystemExit(f"expected one clientY replacement: {old!r}")
    source = source.replace(old, new, 1)

path.write_text(source, encoding="utf-8")
print("studio layer drag clientY fix applied")
