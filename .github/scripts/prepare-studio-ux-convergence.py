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

INSPECTOR_CONTRACT = (
    ROOT / "src/domains/creator/StudioInspectorAsideShell.accessibility-contract.test.ts"
)
replace_once(
    INSPECTOR_CONTRACT,
    'expect(asideSource).toContain(\'aria-label={isMobile ? "작업 패널" : undefined}\');',
    'expect(asideSource).toContain(\'aria-label="작업 패널"\');',
)

print("Studio UX patcher anchors prepared successfully.")
