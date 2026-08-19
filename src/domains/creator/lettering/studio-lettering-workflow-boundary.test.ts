import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (fileName: string) =>
  readFileSync(new URL(fileName, import.meta.url), "utf8");

describe("Studio lettering workflow boundary", () => {
  it("keeps the advertised T shortcut connected to the shipped lettering handler", () => {
    const settings = read("../studio-app-settings.ts");
    const page = read("../StudioPage.tsx");
    const help = read("../StudioShortcutsHelp.tsx");

    expect(settings).toContain('{ id: "tool-lettering", label: "레터링(텍스트·말풍선)", labelKey: "studio.settings.shortcut.toolLettering", defaultKeys: "T" }');
    expect(page).toContain('matchStudioShortcut(sc["tool-lettering"], e)');
    expect(page).toContain("void startEditText(selected.id)");
    expect(page).toContain("addBubble(lastLettering.variant, undefined, true)");
    const textShortcutStart = help.indexOf('keys: "T",');
    const textShortcutEnd = help.indexOf("},", textShortcutStart);
    const textShortcut = help.slice(textShortcutStart, textShortcutEnd);
    expect(textShortcutStart).toBeGreaterThanOrEqual(0);
    expect(textShortcut).toContain('labelKey: "studio.shortcuts.row.edit.text"');
    expect(textShortcut).toContain('actionId: "tool-lettering"');
  });

  it("starts inline editing from click insertion but leaves drag-and-drop placement uninterrupted", () => {
    const bubblePopover = read("./StudioBubbleToolPopoverBody.tsx");
    const rail = read("../StudioLeftToolRail.tsx");

    expect(bubblePopover).toContain("addBubble(v.id, undefined, true)");
    expect(bubblePopover).toContain('data-studio-shortcut-boundary="true"');
    expect(bubblePopover).toContain('(event.metaKey || event.ctrlKey) && event.key === "Enter"');
    expect(bubblePopover).toContain("writeStudioInsertDragPayload(event.dataTransfer");
    expect(bubblePopover).toContain('id="studio-bubble-placement-help"');
    expect(bubblePopover.indexOf('id="studio-bubble-placement-help"')).toBeLessThan(
      bubblePopover.indexOf('role="menu" aria-label={localizeText(')
    );
    expect(bubblePopover.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(4);
    expect(rail).toContain('addBubble("speech", undefined, true)');
    expect(rail).toContain("addText(undefined, true)");
  });

  it("does not commit or cancel inline lettering while a Korean IME event is composing", () => {
    const overlay = read("./StudioTextEditOverlay.tsx");

    expect(overlay).toContain("event.nativeEvent.isComposing");
    expect(overlay).toContain("event.nativeEvent.keyCode === 229");
    expect(overlay.indexOf("event.nativeEvent.isComposing")).toBeLessThan(
      overlay.indexOf('event.key === "Escape"')
    );
  });

  it("captures the Konva restore snapshot only once across zoom rerenders", () => {
    const overlay = read("./StudioTextEditOverlay.tsx");

    expect(overlay).toContain("if (!originalRef.current)");
    expect(overlay.indexOf("if (!originalRef.current)")).toBeLessThan(
      overlay.indexOf("originalRef.current = {")
    );
  });
});
