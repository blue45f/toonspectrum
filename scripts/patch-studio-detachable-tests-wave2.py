from pathlib import Path

path = Path("src/domains/creator/brush/StudioBrushLibrarySheet.test.tsx")
source = path.read_text(encoding="utf-8")
old = '''  it("keeps outside-pointer focus on the newly chosen control and fits short viewports", () => {\n    expect(sheetSource).toContain('onClose("outside-pointer")');\n    expect(sheetSource).toContain('onClose("escape")');\n    expect(sheetSource).toContain('onClose("selection")');\n    expect(sheetSource).toContain("spaceAbove >= spaceBelow");\n    expect(sheetSource).not.toContain("Math.max(224, viewportHeight - bottom - 8)");\n  });'''
new = '''  it("keeps mobile outside-pointer dismissal while desktop becomes a persistent comparison window", () => {\n    expect(sheetSource).toContain('onClose("outside-pointer")');\n    expect(sheetSource).toContain('onClose("escape")');\n    expect(sheetSource).toContain('if (closeOnSelection) onClose("selection")');\n    expect(sheetSource).toContain("dismissOnOutsidePointer={!desktop}");\n    expect(sheetSource).toContain("closeOnSelection={!desktop}");\n    expect(sheetSource).toContain("StudioFloatingSurface");\n    expect(sheetSource).toContain("useStudioFloatingSurfaceLayout");\n  });'''
if new not in source:
    if source.count(old) != 1:
        raise RuntimeError("Brush catalog test anchor changed")
    path.write_text(source.replace(old, new, 1), encoding="utf-8")
print("Updated brush catalog floating-window expectations")
