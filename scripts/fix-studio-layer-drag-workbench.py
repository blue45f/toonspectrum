from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(relative: str, old: str, new: str) -> None:
    path = ROOT / relative
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(
            f"{relative}: expected one fix target, found {count}: {old[:120]!r}"
        )
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


shortcut_contract = (
    "ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Space F2 Shift+F10 "
    "Control+A Meta+A Control+G Meta+G Shift+Control+G Shift+Meta+G "
    "Control+] Meta+] Shift+Control+] Shift+Meta+] Control+[ Meta+[ "
    "Shift+Control+[ Shift+Meta+[ Alt+ArrowUp Alt+ArrowDown "
    "Shift+Alt+ArrowUp Shift+Alt+ArrowDown"
)

# The navigator already exposes a visible result counter with role=status. Keep the new
# reorder announcer as a dedicated polite live region without creating a second status role.
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx",
    '<p role="status" aria-live="polite" className="sr-only">\n          {dragAnnouncement}\n        </p>',
    '<p aria-live="polite" aria-atomic="true" className="sr-only">\n          {dragAnnouncement}\n        </p>',
)

# The keyboard contract intentionally grew; lock the exact accessible affordance in both SSR
# and focused row tests.
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.test.tsx",
    '      \'aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Space F2 Shift+F10 Control+A Meta+A Control+G Meta+G Shift+Control+G Shift+Meta+G"\'\n',
    f'      \'aria-keyshortcuts="{shortcut_contract}"\'\n',
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigatorItemRow.test.tsx",
    '      "ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Space F2 Shift+F10 Control+A Meta+A Control+G Meta+G Shift+Control+G Shift+Meta+G"\n',
    f'      "{shortcut_contract}"\n',
)

# Drag handles are deliberate row controls: 표시 · 잠금 · 불투명도 · … · drag.
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.test.tsx",
    "    // 표시 · 잠금 · 불투명도 · … — four inline controls per row after Wave C.\n"
    "    expect(html.match(/data-layer-row-control=\"true\"/g)).toHaveLength(2_000);\n",
    "    // 표시 · 잠금 · 불투명도 · … · drag — five inline controls per row.\n"
    "    expect(html.match(/data-layer-row-control=\"true\"/g)).toHaveLength(2_500);\n"
    "    expect(html.match(/data-studio-layer-drag-handle=\"item\"/g)).toHaveLength(500);\n",
)

# React state updates around dragstart may replace the test node. Mock geometry at the prototype
# level and re-query after each render rather than pinning a stale element instance.
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.drag.test.tsx",
    "afterEach(cleanup);\n",
    "afterEach(() => {\n  cleanup();\n  vi.restoreAllMocks();\n});\n",
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.drag.test.tsx",
    '''    const target = layerRow(/주인공 대사/);
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 300,
      width: 300,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.dragStart(handle, { dataTransfer: transfer });
    fireEvent.dragOver(target, { dataTransfer: transfer, clientY: 105 });
    expect(target.getAttribute("data-studio-layer-drop-side")).toBe("front");
    expect(target.querySelector('[data-studio-layer-drop-indicator="front"]')).toBeTruthy();
    fireEvent.drop(target, { dataTransfer: transfer, clientY: 105 });
''',
    '''    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 300,
      width: 300,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.dragStart(handle, { dataTransfer: transfer });
    fireEvent.dragOver(layerRow(/주인공 대사/), {
      dataTransfer: transfer,
      clientY: 105,
    });
    const target = layerRow(/주인공 대사/);
    expect(target.getAttribute("data-studio-layer-drop-side")).toBe("front");
    expect(target.querySelector('[data-studio-layer-drop-indicator="front"]')).toBeTruthy();
    fireEvent.drop(target, { dataTransfer: transfer, clientY: 105 });
''',
)
replace_once(
    "apps/web/src/domains/creator/layer/StudioLayerNavigator.drag.test.tsx",
    '''    const target = layerRow(/캐릭터, 그룹, 2개 레이어/);
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 300,
      width: 300,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.dragStart(handle, { dataTransfer: transfer });
    fireEvent.dragOver(target, { dataTransfer: transfer, clientY: 120 });
    expect(target.getAttribute("data-studio-layer-group-drop")).toBe("inside");
    fireEvent.drop(target, { dataTransfer: transfer, clientY: 120 });
''',
    '''    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 300,
      width: 300,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.dragStart(handle, { dataTransfer: transfer });
    fireEvent.dragOver(layerRow(/캐릭터, 그룹, 2개 레이어/), {
      dataTransfer: transfer,
      clientY: 120,
    });
    const target = layerRow(/캐릭터, 그룹, 2개 레이어/);
    expect(target.getAttribute("data-studio-layer-group-drop")).toBe("inside");
    fireEvent.drop(target, { dataTransfer: transfer, clientY: 120 });
''',
)

print("studio layer drag workbench regression fixes applied")
