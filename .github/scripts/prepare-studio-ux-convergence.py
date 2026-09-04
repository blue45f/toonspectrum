#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATCHER = ROOT / ".github/scripts/apply-studio-ux-convergence.py"


def replace_once(path: Path, old: str, new: str) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise RuntimeError(
            f"{path.relative_to(ROOT)}: expected one preparation anchor, found {count}: {old[:90]!r}"
        )
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


replace_once(
    PATCHER,
    '''WORKSPACE = "src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorWorkspace.tsx"
replace_once(
    WORKSPACE,
    "  return (\\n      <div\\n        className={cn(\\n",
    "  return (\\n      <div\\n        id=\\"studio-workspace\\"\\n        role=\\"group\\"\\n        aria-label=\\"편집 작업공간\\"\\n        tabIndex={-1}\\n        className={cn(\\n",
)''',
    '''WORKSPACE = "src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorWorkspace.tsx"
replace_once(
    WORKSPACE,
    "  return (\\n      <div\\n        data-studio-mobile-canvas-workspace={isMobile ? \\\"true\\\" : undefined}\\n        className={cn(\\n",
    "  return (\\n      <div\\n        id=\\"studio-workspace\\"\\n        role=\\"group\\"\\n        aria-label=\\"편집 작업공간\\"\\n        tabIndex={-1}\\n        data-studio-mobile-canvas-workspace={isMobile ? \\\"true\\\" : undefined}\\n        className={cn(\\n",
)''',
)

replace_once(
    PATCHER,
    '''CANVAS = "src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorCanvasColumn.tsx"
replace_once(
    CANVAS,
    "  return (\\n      <div\\n        className={cn(\\n",
    "  return (\\n      <div\\n        id=\\"studio-canvas-workspace\\"\\n        role=\\"region\\"\\n        aria-label=\\"캔버스 작업영역\\"\\n        tabIndex={-1}\\n        className={cn(\\n",
)''',
    '''CANVAS = "src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorCanvasColumn.tsx"
replace_once(
    CANVAS,
    "  return (\\n          <div\\n            className={cn(\\n",
    "  return (\\n          <div\\n            id=\\"studio-canvas-workspace\\"\\n            role=\\"region\\"\\n            aria-label=\\"캔버스 작업영역\\"\\n            tabIndex={-1}\\n            className={cn(\\n",
)''',
)

# Preserve the existing shared-chrome source contract while keeping the status bar focusable.
replace_once(
    PATCHER,
    """    '''    <div
      id={id}
      role="group"
      tabIndex={-1}
      aria-label={ariaLabel}
      data-studio-status-bar="true"''',""",
    """    '''    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      data-studio-status-bar="true"
      tabIndex={-1}''',""",
)

INSPECTOR_CONTRACT = (
    ROOT / "src/domains/creator/StudioInspectorAsideShell.accessibility-contract.test.ts"
)
replace_once(
    INSPECTOR_CONTRACT,
    'expect(asideSource).toContain(\'aria-label={isMobile ? "작업 패널" : undefined}\');',
    'expect(asideSource).toContain(\'aria-label="작업 패널"\');',
)

# The source label and the two fully maintained locale packs move together, so the visible
# command bar and File menu cannot retain the former terminology after the component changes.
KO = ROOT / "public/i18n/studio/ko.json"
replace_once(
    KO,
    '"studio.mainMenu.item.file.project":"프로젝트 도구…"',
    '"studio.mainMenu.item.file.project":"프로젝트 센터…"',
)
replace_once(
    KO,
    '"studio.commandBar.command.project":"프로젝트 작업"',
    '"studio.commandBar.command.project":"프로젝트 센터"',
)

EN = ROOT / "public/i18n/studio/en.json"
replace_once(
    EN,
    '"studio.mainMenu.item.file.project":"Project tools…"',
    '"studio.mainMenu.item.file.project":"Project center…"',
)
replace_once(
    EN,
    '"studio.commandBar.command.project":"Project tools"',
    '"studio.commandBar.command.project":"Project center"',
)

print("Studio UX patcher anchors prepared successfully.")
