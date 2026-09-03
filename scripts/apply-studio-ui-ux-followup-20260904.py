#!/usr/bin/env python3
"""Apply ToonStudio UX follow-up wave on blue45f/toonspectrum main@915d68a4.

Changes:
- section the 52-row Filter menu into named families;
- opt filter commands into safe direct activation from unified search;
- publish live menu command bindings to a tiny strangler registry;
- promote text/bubble editing to the first Inspector action;
- add focused regression tests.

The script is intentionally assertion-heavy: it aborts instead of applying a partial patch
when the target source has drifted.
"""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

BASE_SHA = "915d68a4e899c8f40bc0cd0d9fbef9d5a1a94626"


def run(cmd: list[str], cwd: Path, check: bool = True) -> subprocess.CompletedProcess[str]:
    print("+", " ".join(cmd))
    return subprocess.run(cmd, cwd=cwd, text=True, check=check)


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if new and new in text:
        print(f"= already applied: {path}")
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"expected exactly one match in {path}, found {count}\n--- needle ---\n{old[:500]}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"✓ updated {path}")


def write_new(path: Path, content: str) -> None:
    if path.exists():
        existing = path.read_text(encoding="utf-8")
        if existing == content:
            print(f"= already present: {path}")
            return
        raise RuntimeError(f"refusing to overwrite drifted existing file: {path}")
    path.write_text(content, encoding="utf-8")
    print(f"✓ created {path}")


def apply(root: Path) -> None:
    src = root / "src/domains/creator"

    # ---------------------------------------------------------------- model opt-in
    replace_once(
        src / "studio-main-menu-model.ts",
        """  danger?: boolean;\n  separatorAfter?: boolean;\n  /**\n   * Caption drawn above this row when a composite title (삽입·도구) presents rows\n""",
        """  danger?: boolean;\n  separatorAfter?: boolean;\n  /**\n   * Explicit opt-in for unified-search direct activation. The default stays help-only:\n   * save, publish, delete and other consequential commands must never become executable\n   * merely because they gained a menu row. Opted-in rows reuse this item's `onSelect`\n   * closure, so menu and search cannot drift into two implementations.\n   */\n  searchActivation?: \"execute\";\n  /**\n   * Caption drawn above this row when a composite title (삽입·도구) presents rows\n""",
    )

    # ---------------------------------------------------------- execution registry
    write_new(
        src / "studio-command-execution-registry.ts",
        r'''/**
 * Live command-execution bridge for unified search.
 *
 * This is a deliberately small strangler in front of the full CommandRegistry migration.
 * Menu rows remain the product execution authority; only rows that explicitly declare
 * `searchActivation: "execute"` are published. Search therefore calls the exact same
 * `onSelect` closure as the menu, while save/publish/delete and every unreviewed command
 * remain help-only by default.
 */

export interface StudioCommandExecutionBinding {
  readonly commandId: string;
  readonly label: string;
  readonly execute: () => void;
  readonly disabled: boolean;
  readonly unavailableReason?: string;
}

export interface StudioCommandExecutionMenuItem {
  readonly commandId?: string;
  readonly label: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly unavailableReason?: string;
  readonly danger?: boolean;
  readonly searchActivation?: "execute";
}

export interface StudioCommandExecutionMenuGroup {
  readonly items: readonly StudioCommandExecutionMenuItem[];
}

const EMPTY_BINDINGS: ReadonlyMap<string, StudioCommandExecutionBinding> = new Map();
let bindingsSnapshot: ReadonlyMap<string, StudioCommandExecutionBinding> = EMPTY_BINDINGS;
let activeInstallation: symbol | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Flattens menu groups into direct-search bindings. First declaration wins so a duplicate
 * CommandId cannot silently change meaning just because presentation order changed.
 */
export function createStudioCommandExecutionBindings(
  groups: readonly StudioCommandExecutionMenuGroup[],
): readonly StudioCommandExecutionBinding[] {
  const seen = new Set<string>();
  const result: StudioCommandExecutionBinding[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      const commandId = item.commandId?.trim();
      if (
        !commandId
        || item.searchActivation !== "execute"
        || item.danger === true
        || seen.has(commandId)
      ) {
        continue;
      }
      seen.add(commandId);
      result.push({
        commandId,
        label: item.label,
        execute: item.onSelect,
        disabled: item.disabled === true,
        ...(item.unavailableReason
          ? { unavailableReason: item.unavailableReason }
          : {}),
      });
    }
  }
  return result;
}

/** Installs one live Studio host. A stale StrictMode cleanup cannot clear a newer host. */
export function installStudioCommandExecutionBindings(
  bindings: readonly StudioCommandExecutionBinding[],
): () => void {
  const installation = Symbol("studio-command-execution-bindings");
  const next = new Map<string, StudioCommandExecutionBinding>();
  for (const binding of bindings) {
    if (!next.has(binding.commandId)) next.set(binding.commandId, binding);
  }
  activeInstallation = installation;
  bindingsSnapshot = next;
  emit();

  return () => {
    if (activeInstallation !== installation) return;
    activeInstallation = null;
    bindingsSnapshot = EMPTY_BINDINGS;
    emit();
  };
}

export function subscribeStudioCommandExecutionBindings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStudioCommandExecutionBindings(): ReadonlyMap<
  string,
  StudioCommandExecutionBinding
> {
  return bindingsSnapshot;
}

/** Test-only reset; product code installs and disposes through the host effect above. */
export function resetStudioCommandExecutionBindingsForTests(): void {
  activeInstallation = null;
  bindingsSnapshot = EMPTY_BINDINGS;
  emit();
}
''',
    )

    write_new(
        src / "studio-command-execution-registry.test.ts",
        r'''import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudioCommandExecutionBindings,
  getStudioCommandExecutionBindings,
  installStudioCommandExecutionBindings,
  resetStudioCommandExecutionBindingsForTests,
  subscribeStudioCommandExecutionBindings,
} from "./studio-command-execution-registry";

afterEach(resetStudioCommandExecutionBindingsForTests);

describe("studio command execution registry", () => {
  it("publishes only explicitly opted-in, non-dangerous menu rows", () => {
    const execute = vi.fn();
    const bindings = createStudioCommandExecutionBindings([
      {
        items: [
          { commandId: "filter.blur", label: "블러", onSelect: execute, searchActivation: "execute" },
          { commandId: "file.publish", label: "게시", onSelect: vi.fn() },
          {
            commandId: "edit.delete",
            label: "삭제",
            onSelect: vi.fn(),
            searchActivation: "execute",
            danger: true,
          },
        ],
      },
    ]);

    expect(bindings.map((binding) => binding.commandId)).toEqual(["filter.blur"]);
    expect(bindings[0]?.execute).toBe(execute);
  });

  it("keeps the first duplicate CommandId and exposes live disabled reasons", () => {
    const first = vi.fn();
    const bindings = createStudioCommandExecutionBindings([
      {
        items: [
          {
            commandId: "filter.blur",
            label: "블러",
            onSelect: first,
            searchActivation: "execute",
            disabled: true,
            unavailableReason: "이미지를 선택하세요.",
          },
          {
            commandId: "filter.blur",
            label: "중복",
            onSelect: vi.fn(),
            searchActivation: "execute",
          },
        ],
      },
    ]);

    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toMatchObject({
      label: "블러",
      disabled: true,
      unavailableReason: "이미지를 선택하세요.",
    });
    expect(bindings[0]?.execute).toBe(first);
  });

  it("notifies subscribers and ignores stale installation cleanup", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStudioCommandExecutionBindings(listener);
    const disposeFirst = installStudioCommandExecutionBindings([
      { commandId: "view.fit", label: "맞춤", execute: vi.fn(), disabled: false },
    ]);
    const disposeSecond = installStudioCommandExecutionBindings([
      { commandId: "filter.blur", label: "블러", execute: vi.fn(), disabled: false },
    ]);

    disposeFirst();
    expect([...getStudioCommandExecutionBindings().keys()]).toEqual(["filter.blur"]);
    disposeSecond();
    expect(getStudioCommandExecutionBindings().size).toBe(0);
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
});
''',
    )

    # ------------------------------------------------------------- filter sections + opt-in
    filter_path = src / "studio-main-menu-items-filter.ts"
    replace_once(
        filter_path,
        """const STUDIO_FILTER_PACK_MENU_SEPARATORS: ReadonlySet<StudioFilterPackKind> = new Set([\n  \"tileable-blur\",\n  \"lens-flare\",\n  \"surface-blur\",\n  \"noise-add\",\n  \"lens-distortion\",\n  \"perlin-texture\",\n]);\n\n/** Core rows keep their bespoke drafts, their ⌘⇧n chords, and their declaration order. */\n""",
        """const STUDIO_FILTER_PACK_MENU_SEPARATORS: ReadonlySet<StudioFilterPackKind> = new Set([\n  \"tileable-blur\",\n  \"lens-flare\",\n  \"surface-blur\",\n  \"noise-add\",\n  \"lens-distortion\",\n  \"perlin-texture\",\n]);\n\n/** First row of each visible family in the otherwise 52-row Filter menu. */\nconst STUDIO_FILTER_PACK_MENU_SECTION_LABELS = Object.freeze({\n  mosaic: \"픽셀화\",\n  \"radial-blur\": \"블러\",\n  \"chromatic-aberration\": \"렌즈·화면 효과\",\n  emboss: \"스타일화\",\n  \"line-cleanup\": \"선화·복원\",\n  \"noise-add\": \"노이즈\",\n  \"wave-warp\": \"왜곡\",\n  \"film-grain-pro\": \"질감·변환\",\n} satisfies Partial<Record<StudioFilterPackKind, string>>);\n\n/** Core rows keep their bespoke drafts, their ⌘⇧n chords, and their declaration order. */\n""",
    )
    replace_once(
        filter_path,
        """      commandId: \"filter.last\",\n      label: state.lastFilterDraft ? \"마지막 필터 다시 열기\" : \"마지막 필터…\",\n""",
        """      commandId: \"filter.last\",\n      searchActivation: \"execute\",\n      label: state.lastFilterDraft ? \"마지막 필터 다시 열기\" : \"마지막 필터…\",\n""",
    )
    replace_once(
        filter_path,
        """    ...STUDIO_FILTER_CORE_MENU_ROWS.map(({ id, label, icon, shortcut }) => ({\n      id,\n      commandId: `filter.${id}`,\n      label,\n      icon,\n      shortcut,\n""",
        """    ...STUDIO_FILTER_CORE_MENU_ROWS.map(({ id, label, icon, shortcut }, index) => ({\n      id,\n      commandId: `filter.${id}`,\n      searchActivation: \"execute\" as const,\n      ...(index === 0 ? { sectionLabel: \"기본 필터\" } : {}),\n      label,\n      icon,\n      shortcut,\n""",
    )
    replace_once(
        filter_path,
        """    ] as const).map(({ id, commandId, label, icon, ...rest }) => ({\n      id,\n      commandId,\n      label,\n""",
        """    ] as const).map(({ id, commandId, label, icon, ...rest }, index) => ({\n      id,\n      commandId,\n      searchActivation: \"execute\" as const,\n      ...(index === 0 ? { sectionLabel: \"레이어 보정\" } : {}),\n      label,\n""",
    )
    replace_once(
        filter_path,
        """    ...STUDIO_FILTER_PACK_KINDS.map((kind) => ({\n      id: kind,\n      commandId: `filter.${kind}`,\n      label: STUDIO_FILTER_PACK_LABELS[kind],\n""",
        """    ...STUDIO_FILTER_PACK_KINDS.map((kind) => ({\n      id: kind,\n      commandId: `filter.${kind}`,\n      searchActivation: \"execute\" as const,\n      ...(STUDIO_FILTER_PACK_MENU_SECTION_LABELS[kind]\n        ? { sectionLabel: STUDIO_FILTER_PACK_MENU_SECTION_LABELS[kind] }\n        : {}),\n      label: STUDIO_FILTER_PACK_LABELS[kind],\n""",
    )

    # -------------------------------------------------------- publish live menu bindings
    menubar_path = src / "StudioMenubarContent.tsx"
    replace_once(
        menubar_path,
        """import { STUDIO_CANVAS_WIDTH as CANVAS_W } from \"./canvas/studio-canvas-constants\";\nimport { createStudioMainMenuPresentation } from \"./studio-main-menu-presentation\";\n""",
        """import { STUDIO_CANVAS_WIDTH as CANVAS_W } from \"./canvas/studio-canvas-constants\";\nimport {\n  createStudioCommandExecutionBindings,\n  installStudioCommandExecutionBindings,\n} from \"./studio-command-execution-registry\";\nimport { createStudioMainMenuPresentation } from \"./studio-main-menu-presentation\";\n""",
    )
    replace_once(
        menubar_path,
        """  const presentedStudioMainMenuGroups = mainMenuPresentation.groups;\n\n  const menubarLaneRef = useRef<HTMLDivElement | null>(null);\n""",
        """  const presentedStudioMainMenuGroups = mainMenuPresentation.groups;\n\n  // Unified search executes only explicitly reviewed rows, using the menu's own closure.\n  // This is the first safe slice of the CommandRegistry strangler: no second implementation.\n  useEffect(\n    () =>\n      installStudioCommandExecutionBindings(\n        createStudioCommandExecutionBindings(studioMainMenuGroups),\n      ),\n    [studioMainMenuGroups],\n  );\n\n  const menubarLaneRef = useRef<HTMLDivElement | null>(null);\n""",
    )

    # ------------------------------------------------------- search direct activation
    search_path = src / "StudioCommandSearchDialog.tsx"
    replace_once(
        search_path,
        'import { Ban, ChevronRight, HelpCircle, Search, X } from "lucide-react";\n',
        'import { Ban, ChevronRight, HelpCircle, Play, Search, X } from "lucide-react";\n',
    )
    replace_once(
        search_path,
        'import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";\n',
        'import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";\n',
    )
    replace_once(
        search_path,
        """import { buildStudioSearchIndex, searchStudio } from \"./studio-command-search\";\nimport {\n""",
        """import {\n  getStudioCommandExecutionBindings,\n  subscribeStudioCommandExecutionBindings,\n  type StudioCommandExecutionBinding,\n} from \"./studio-command-execution-registry\";\nimport { buildStudioSearchIndex, searchStudio } from \"./studio-command-search\";\nimport {\n""",
    )
    replace_once(
        search_path,
        """export type StudioCommandSearchActionKind =\n  | \"inspector\"\n""",
        """export type StudioCommandSearchActionKind =\n  | \"execute\"\n  | \"inspector\"\n""",
    )
    replace_once(
        search_path,
        """function studioCommandSearchAction(\n  entry: StudioSearchEntry,\n  available: StudioCommandSearchHandlerAvailability,\n  inspectorContext?: StudioInspectorActionContext,\n): StudioCommandSearchAction {\n""",
        """function studioCommandSearchAction(\n  entry: StudioSearchEntry,\n  available: StudioCommandSearchHandlerAvailability,\n  inspectorContext: StudioInspectorActionContext | undefined,\n  commandBindings: ReadonlyMap<string, StudioCommandExecutionBinding>,\n): StudioCommandSearchAction {\n""",
    )
    replace_once(
        search_path,
        """    case \"command\":\n      // 명령을 **실행**하려면 CommandRegistry 배선이 StudioPage 밖으로 나와야\n      // 한다(아직 없다). 그때까지 명령 행이 할 수 있는 정직한 최선은 \"이게\n      // 무엇이고 어디 있는지\"를 여는 것이고, 배지·푸터가 실행이 아니라\n      // 도움말이라고 말한다.\n      return available.help\n        ? { kind: \"help\", badge: \"도움말\", hint: \"도움말 열기\" }\n        : NO_ACTION;\n""",
        """    case \"command\": {\n      const binding = commandBindings.get(target.commandId);\n      if (binding) {\n        return binding.disabled\n          ? {\n            kind: \"none\",\n            badge: \"사용 불가\",\n            hint: binding.unavailableReason ?? \"현재 상태에서는 이 명령을 사용할 수 없습니다\",\n          }\n          : { kind: \"execute\", badge: \"실행\", hint: \"명령 실행\" };\n      }\n      // Unreviewed and consequential commands stay help-only until their menu row explicitly\n      // opts in. Search never infers safety from a missing `danger` flag.\n      return available.help\n        ? { kind: \"help\", badge: \"도움말\", hint: \"도움말 열기\" }\n        : NO_ACTION;\n    }\n""",
    )
    replace_once(
        search_path,
        """const ACTION_ICON: Readonly<\n  Record<StudioCommandSearchActionKind, typeof ChevronRight>\n> = Object.freeze({\n  inspector: ChevronRight,\n""",
        """const ACTION_ICON: Readonly<\n  Record<StudioCommandSearchActionKind, typeof ChevronRight>\n> = Object.freeze({\n  execute: Play,\n  inspector: ChevronRight,\n""",
    )
    replace_once(
        search_path,
        """  const inputRef = useRef<HTMLInputElement>(null);\n  const dialogRef = useRef<HTMLDivElement>(null);\n\n  const searchIndex = useMemo(\n""",
        """  const inputRef = useRef<HTMLInputElement>(null);\n  const dialogRef = useRef<HTMLDivElement>(null);\n  const commandExecutionBindings = useSyncExternalStore(\n    subscribeStudioCommandExecutionBindings,\n    getStudioCommandExecutionBindings,\n    getStudioCommandExecutionBindings,\n  );\n\n  const searchIndex = useMemo(\n""",
    )
    replace_once(
        search_path,
        """          action: studioCommandSearchAction(\n            result.entry,\n            available,\n            inspectorContext,\n          ),\n""",
        """          action: studioCommandSearchAction(\n            result.entry,\n            available,\n            inspectorContext,\n            commandExecutionBindings,\n          ),\n""",
    )
    replace_once(
        search_path,
        """  }, [available, inspectorContext, listboxId, outcome]);\n""",
        """  }, [available, commandExecutionBindings, inspectorContext, listboxId, outcome]);\n""",
    )
    replace_once(
        search_path,
        """      const action = studioCommandSearchAction(\n        result.entry,\n        available,\n        inspectorContext,\n      );\n""",
        """      const action = studioCommandSearchAction(\n        result.entry,\n        available,\n        inspectorContext,\n        commandExecutionBindings,\n      );\n""",
    )
    replace_once(
        search_path,
        """        case \"help\": {\n          if (target.type !== \"command\") return;\n""",
        """        case \"execute\": {\n          if (target.type !== \"command\") return;\n          const binding = commandExecutionBindings.get(target.commandId);\n          if (!binding || binding.disabled) return;\n          binding.execute();\n          onClose(\"action\");\n          return;\n        }\n        case \"help\": {\n          if (target.type !== \"command\") return;\n""",
    )
    replace_once(
        search_path,
        """    [\n      available,\n      inspectorContext,\n""",
        """    [\n      available,\n      commandExecutionBindings,\n      inspectorContext,\n""",
    )

    # -------------------------------------------------- Inspector primary text/bubble action
    body_path = src / "StudioInspectorAsideBody.tsx"
    replace_once(
        body_path,
        """import type { StudioInspectorAsideProps } from \"./StudioInspectorAsideTypes\";\n\nexport function StudioInspectorAsideBody(props: StudioInspectorAsideProps) {\n""",
        """import type { StudioInspectorAsideProps } from \"./StudioInspectorAsideTypes\";\n\nimport { buttonClass } from \"@/components/ui/button-utils\";\n\nexport function StudioInspectorAsideBody(props: StudioInspectorAsideProps) {\n""",
    )
    replace_once(
        body_path,
        """    inspectorInteractionPolicy,\n    applyFigmaSelectionLayoutPatch,\n""",
        """    inspectorInteractionPolicy,\n    startEditText,\n    applyFigmaSelectionLayoutPatch,\n""",
    )
    replace_once(
        body_path,
        """      >\n          {inspectorContentMode === \"selection\" && (\n            <div>\n""",
        """      >\n          {inspectorContentMode === \"selection\"\n            && !hasMultiSelection\n            && selected\n            && (selected.type === \"text\"\n              || selected.type === \"bubble\"\n              || selected.type === \"sticker\") ? (\n            <button\n              type=\"button\"\n              disabled={inspectorInteractionPolicy.selection.disabled}\n              title={inspectorInteractionPolicy.selection.reason}\n              aria-label={selected.type === \"bubble\" ? \"대사 편집\" : \"글자 편집\"}\n              data-studio-inspector-primary-text-edit=\"true\"\n              data-inspector-priority=\"essential\"\n              data-inspector-control-id=\"element.edit-text\"\n              onClick={() => startEditText(selected.id)}\n              className={buttonClass({\n                size: \"md\",\n                variant: \"solid\",\n                className: \"min-h-11 w-full justify-between px-3 text-left\",\n              })}\n            >\n              <span>{selected.type === \"bubble\" ? \"대사 편집\" : \"글자 편집\"}</span>\n              <span className=\"text-[0.6875rem] font-semibold opacity-80\">내용 수정</span>\n            </button>\n          ) : null}\n          {inspectorContentMode === \"selection\" && (\n            <div>\n""",
    )

    selection_path = src / "StudioInspectorSelectionSection.tsx"
    replace_once(
        selection_path,
        """    splitFrameSelected,\n    startEditText,\n    studioFilterPreparationBusy,\n""",
        """    splitFrameSelected,\n    studioFilterPreparationBusy,\n""",
    )
    replace_once(
        selection_path,
        """              <div className=\"mt-3 flex flex-wrap gap-1.5 border-t border-line/50 pt-3\">\n                {(selected.type === \"text\" || selected.type === \"bubble\" || selected.type === \"sticker\") && (\n                  <button type=\"button\" onClick={() => startEditText(selected.id)} className={buttonClass({ size: \"sm\", variant: \"quiet\" })}>\n                    글자 편집\n                  </button>\n                )}\n              </div>\n""",
        """""",
    )
    replace_once(
        selection_path,
        'import { buttonClass } from "@/components/ui/button-utils";\n',
        "",
    )

    # ------------------------------------------------------------------- tests
    filter_test = src / "studio-main-menu-items-filter.test.ts"
    replace_once(
        filter_test,
        """  it(\"carries the host's unavailable reason onto every destructive row\", () => {\n""",
        """  it(\"groups the long menu into stable, named filter families\", () => {\n    const { items } = filterRows();\n    expect(\n      items.flatMap((item) =>\n        item.sectionLabel ? [[item.id, item.sectionLabel] as const] : [],\n      ),\n    ).toEqual([\n      [\"gaussian-blur\", \"기본 필터\"],\n      [\"levels\", \"레이어 보정\"],\n      [\"mosaic\", \"픽셀화\"],\n      [\"radial-blur\", \"블러\"],\n      [\"chromatic-aberration\", \"렌즈·화면 효과\"],\n      [\"emboss\", \"스타일화\"],\n      [\"line-cleanup\", \"선화·복원\"],\n      [\"noise-add\", \"노이즈\"],\n      [\"wave-warp\", \"왜곡\"],\n      [\"film-grain-pro\", \"질감·변환\"],\n    ]);\n  });\n\n  it(\"opts every filter row into the reviewed direct-search execution path\", () => {\n    const { items } = filterRows();\n    expect(items.every((item) => item.searchActivation === \"execute\")).toBe(true);\n  });\n\n  it(\"carries the host's unavailable reason onto every destructive row\", () => {\n""",
    )

    search_test = src / "StudioCommandSearchDialog.test.tsx"
    replace_once(
        search_test,
        """import {\n  STUDIO_SEARCH_DEFAULT_SECTION_LIMIT,\n  STUDIO_SEARCH_DEFAULT_TOTAL_LIMIT,\n} from \"./studio-command-search\";\n""",
        """import {\n  installStudioCommandExecutionBindings,\n  resetStudioCommandExecutionBindingsForTests,\n} from \"./studio-command-execution-registry\";\nimport {\n  STUDIO_SEARCH_DEFAULT_SECTION_LIMIT,\n  STUDIO_SEARCH_DEFAULT_TOTAL_LIMIT,\n} from \"./studio-command-search\";\n""",
    )
    replace_once(
        search_test,
        """afterEach(cleanup);\n""",
        """afterEach(() => {\n  cleanup();\n  resetStudioCommandExecutionBindingsForTests();\n});\n""",
    )
    replace_once(
        search_test,
        """describe(\"StudioCommandSearchDialog — 결과 활성화\", () => {\n  it(\"명령 행을 클릭하면 도움말 소비자가 helpNodeId 와 commandId 를 함께 받는다\", () => {\n""",
        """describe(\"StudioCommandSearchDialog — 결과 활성화\", () => {\n  it(\"검토된 메뉴 명령은 검색에서 같은 실행 함수를 직접 호출한다\", () => {\n    const execute = vi.fn();\n    installStudioCommandExecutionBindings([\n      {\n        commandId: \"filter.gaussian-blur\",\n        label: \"가우시안 블러\",\n        execute,\n        disabled: false,\n      },\n    ]);\n    const onOpenHelp = vi.fn();\n    const { onClose } = openDialog({ onOpenHelp });\n    type(\"가우시안 블러\");\n    const option = screen.getByRole(\"option\", { name: /가우시안 블러/u });\n    expect(option.getAttribute(\"data-action\")).toBe(\"execute\");\n    expect(within(option).getByText(\"실행\")).toBeTruthy();\n    fireEvent.click(option);\n    expect(execute).toHaveBeenCalledOnce();\n    expect(onOpenHelp).not.toHaveBeenCalled();\n    expect(onClose).toHaveBeenCalledWith(\"action\");\n  });\n\n  it(\"현재 비활성인 직접 명령은 실행하지 않고 이유를 푸터에 표시한다\", () => {\n    const execute = vi.fn();\n    installStudioCommandExecutionBindings([\n      {\n        commandId: \"filter.gaussian-blur\",\n        label: \"가우시안 블러\",\n        execute,\n        disabled: true,\n        unavailableReason: \"이미지 레이어를 먼저 선택하세요.\",\n      },\n    ]);\n    openDialog({ onOpenHelp: vi.fn() });\n    type(\"가우시안 블러\");\n    const option = screen.getByRole(\"option\", { name: /가우시안 블러/u });\n    expect(option.getAttribute(\"aria-disabled\")).toBe(\"true\");\n    expect(within(option).getByText(\"사용 불가\")).toBeTruthy();\n    expect(footerText()).toContain(\"이미지 레이어를 먼저 선택하세요\");\n    fireEvent.click(option);\n    expect(execute).not.toHaveBeenCalled();\n  });\n\n  it(\"명령 행을 클릭하면 도움말 소비자가 helpNodeId 와 commandId 를 함께 받는다\", () => {\n""",
    )
    replace_once(
        search_test,
        """    const BADGE: Record<string, string> = {\n      inspector: \"이동\",\n""",
        """    const BADGE: Record<string, string> = {\n      execute: \"실행\",\n      inspector: \"이동\",\n""",
    )

    write_new(
        src / "studio-inspector-primary-text-edit.test.ts",
        r'''import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const body = readFileSync(
  new URL("./StudioInspectorAsideBody.tsx", import.meta.url),
  "utf8",
);
const selection = readFileSync(
  new URL("./StudioInspectorSelectionSection.tsx", import.meta.url),
  "utf8",
);

describe("Inspector text and balloon primary action", () => {
  it("puts content editing before geometry and the long property stack", () => {
    const primary = body.indexOf('data-studio-inspector-primary-text-edit="true"');
    const geometry = body.indexOf("<StudioFigmaDesignPanel");
    const selectionPanel = body.indexOf("<StudioInspectorSelectionSection");

    expect(primary).toBeGreaterThan(-1);
    expect(primary).toBeLessThan(geometry);
    expect(primary).toBeLessThan(selectionPanel);
    expect(body).toContain('data-inspector-priority="essential"');
    expect(body).toContain('data-inspector-control-id="element.edit-text"');
  });

  it("uses dialogue-first copy for balloons and keeps one execution owner", () => {
    expect(body).toContain('selected.type === "bubble" ? "대사 편집" : "글자 편집"');
    expect(body.match(/startEditText\(selected\.id\)/gu)).toHaveLength(1);
    expect(selection).not.toContain("startEditText");
  });
});
''',
    )

    # --------------------------------------------------------------- follow-up note
    write_new(
        root / "docs/rewrite/ux-audit-2026-09-04-followup.md",
        f'''# ToonStudio UI/UX 후속 개선 — 2026-09-04

기준 main: `{BASE_SHA}`

## 반영

- 필터 메뉴를 기본 필터·레이어 보정·픽셀화·블러·렌즈/화면·스타일화·선화/복원·노이즈·왜곡·질감/변환으로 구획화.
- 메뉴 행이 명시적으로 승인한 비파괴 진입점만 통합 검색에서 직접 실행. 첫 적용 범위는 실제 적용이 아니라 미리보기/편집면을 여는 필터 명령 전체.
- 메뉴와 검색은 같은 `onSelect` 클로저를 사용하며, 저장·게시·삭제 등은 기본적으로 계속 도움말 전용.
- 텍스트·말풍선·스티커 선택 시 글자/대사 편집을 위치·크기보다 앞선 최상위 인스펙터 액션으로 승격.

## 검증

- `studio-command-execution-registry.test.ts`
- `StudioCommandSearchDialog.test.tsx`
- `studio-main-menu-items-filter.test.ts`
- `studio-inspector-primary-text-edit.test.ts`
''',
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", nargs="?", default=".", help="toonspectrum repository root")
    parser.add_argument("--allow-dirty", action="store_true")
    parser.add_argument("--skip-base-check", action="store_true")
    parser.add_argument("--test", action="store_true")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    if not (root / ".git").exists():
        raise SystemExit(f"not a git repository: {root}")

    if not args.skip_base_check:
        head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
        if head != BASE_SHA:
            raise SystemExit(f"expected HEAD {BASE_SHA}, got {head}; rebase the patch deliberately")
    if not args.allow_dirty:
        dirty = subprocess.check_output(["git", "status", "--porcelain"], cwd=root, text=True)
        if dirty.strip():
            raise SystemExit("worktree is dirty; use a fresh worktree or --allow-dirty")

    apply(root)

    if args.test:
        focused = [
            "src/domains/creator/studio-command-execution-registry.test.ts",
            "src/domains/creator/StudioCommandSearchDialog.test.tsx",
            "src/domains/creator/studio-main-menu-items-filter.test.ts",
            "src/domains/creator/studio-inspector-primary-text-edit.test.ts",
        ]
        run(["pnpm", "exec", "vitest", "run", *focused], root)
        run(["pnpm", "run", "typecheck"], root)
        run(["pnpm", "run", "lint"], root)


if __name__ == "__main__":
    main()
