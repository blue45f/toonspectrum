// @vitest-environment jsdom

import { cleanup, isInaccessible, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import canvasKo from "../apps/web/public/i18n/studio/canvas/ko.json";
import mainMenuKo from "../apps/web/public/i18n/studio/mainMenu/ko.json";
import { resetStudioInspectorSectionStateCache } from "../apps/web/src/domains/creator/studio-inspector-section-state";
import { buildStudio3dMenuItems } from "../apps/web/src/domains/creator/studio-main-menu-items-story";
import {
  StudioInspectorCanvasControls,
  type StudioInspectorCanvasControlsProps,
} from "../apps/web/src/domains/creator/StudioInspectorCanvasControls";

import {
  canvasHeightSnapshotMatches,
  resolveMenuVerifierCandidateUrl,
  THREE_D_MENU_ENTRIES,
} from "./verify-studio-menus.mts";

import type {
  StudioMainMenuBuilderState,
  StudioMainMenuEditorActions,
  StudioMainMenuUiActions,
} from "../apps/web/src/domains/creator/studio-main-menu-contract";

const translations = vi.hoisted(() => ({ dictionary: {} as Record<string, string> }));

vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (key: string) => translations.dictionary[key] ?? key,
}));

vi.mock("../apps/web/src/domains/creator/StudioMagicResizePanel", () => ({
  StudioMagicResizePanel: () => null,
}));

beforeEach(() => {
  translations.dictionary = {};
  localStorage.clear();
  resetStudioInspectorSectionStateCache();
});

afterEach(cleanup);

function canvasProps(canvasHeight: number): StudioInspectorCanvasControlsProps {
  return {
    background: "#ffffff",
    backgroundGradient: null,
    canvasHeight,
    controlsDisabled: false,
    controlsDisabledReason: null,
    gridSize: 40,
    hidden: false,
    magicResizeStrategy: "reposition",
    masterEditMode: false,
    panelGutter: 24,
    paperGrainKind: "cold-press",
    paperGrainVisible: true,
    showGrid: false,
    showAlignmentGuides: false,
    showWebtoonGuides: false,
    snapEnabled: false,
    templateGutterUnavailableReason: null,
    userGuides: [],
    webtoonGuides: null,
    webtoonTheme: "classic",
    onAddUserGuide: vi.fn(),
    onApplyBackgroundPreset: vi.fn(),
    onApplyMagicResizePreset: vi.fn(),
    onBackgroundChange: vi.fn(),
    onCanvasHeightDelta: vi.fn(),
    onClearUserGuides: vi.fn(),
    onDeleteUserGuide: vi.fn(),
    onGradientChange: vi.fn(),
    onGridSizeChange: vi.fn(),
    onMagicResizeStrategyChange: vi.fn(),
    onMoveUserGuide: vi.fn(),
    onOpenBackgroundEditor: vi.fn(),
    onPaperGrainKindChange: vi.fn(),
    onPaperGrainVisibleChange: vi.fn(),
    onApplyPaperTintBackground: vi.fn(),
    onPanelGutterChange: vi.fn(),
    onShowGridChange: vi.fn(),
    onShowWebtoonGuidesChange: vi.fn(),
    onShowAlignmentGuidesChange: vi.fn(),
    onSnapEnabledChange: vi.fn(),
    onWarmWebtoonGuides: vi.fn(),
    onWebtoonThemeChange: vi.fn(),
  };
}

describe("메뉴 브라우저 검증의 3D 명령 의미", () => {
  it("현재 한국어 이름과 세 명령의 식별자 및 실행 대상을 각각 보존한다", () => {
    const expectedEntries = [
      { id: "mannequin3d", commandId: "insert.mannequin-3d", label: "기본 데생 인형" },
      { id: "char", commandId: "insert.character-3d", label: "인물·포즈 편집" },
      { id: "bg3d", commandId: "insert.background-3d", label: "장면 도우미" },
    ];
    expect(THREE_D_MENU_ENTRIES).toEqual(expectedEntries);

    const callbacks = {
      openMannequinPoser: vi.fn(),
      openVrmPoser: vi.fn(),
      openBackground3d: vi.fn(),
      openCharacterShaper: vi.fn(),
      openSculptWorkbench: vi.fn(),
    };
    const items = buildStudio3dMenuItems({
      state: {} as StudioMainMenuBuilderState,
      editor: {} as StudioMainMenuEditorActions,
      ui: callbacks as StudioMainMenuUiActions,
    });
    const callbackForId = {
      mannequin3d: "openMannequinPoser",
      char: "openVrmPoser",
      bg3d: "openBackground3d",
    } as const;
    const dictionary: Readonly<Record<string, string>> = mainMenuKo;

    for (const expected of THREE_D_MENU_ENTRIES) {
      const item = items.find((candidate) => candidate.id === expected.id);
      expect(item).toBeDefined();
      if (!item) throw new Error(`3D 메뉴 명령 누락: ${expected.id}`);
      expect(item.commandId).toBe(expected.commandId);
      expect(item.label).toBe(expected.label);
      expect(dictionary[`studio.mainMenu.item.insert.${expected.id}`]).toBe(expected.label);
      expect(item.disabled).not.toBe(true);

      for (const callback of Object.values(callbacks)) callback.mockClear();
      item.onSelect();
      for (const [name, callback] of Object.entries(callbacks)) {
        expect(callback).toHaveBeenCalledTimes(name === callbackForId[expected.id] ? 1 : 0);
      }
    }
  });
});

describe("캔버스 높이의 화면 숫자와 접근성 이름", () => {
  it.each([
    ["번역 namespace가 없을 때", {}],
    ["현재 한국어 canvas namespace를 읽었을 때", canvasKo],
  ] as const)("%s 모든 높이 변경을 같은 값으로 알린다", (_name, dictionary) => {
    translations.dictionary = dictionary;
    const view = render(createElement(StudioInspectorCanvasControls, canvasProps(8_348)));

    // prop 전달/표시 계약만 검증한다. 실제 문서의 단일 undo는 브라우저 시나리오가 담당한다.
    for (const height of [8_348, 8_000, 8_348]) {
      view.rerender(createElement(StudioInspectorCanvasControls, canvasProps(height)));
      const heightValue = screen.getByText(String(height), { exact: true, selector: "span" });
      expect(isInaccessible(heightValue)).toBe(false);
      expect(heightValue.getAttribute("aria-label")).toBe(`높이 ${height}px`);
      expect(screen.getByLabelText(`높이 ${height}px`, { exact: true })).toBe(heightValue);
    }
    expect(screen.queryByLabelText("높이 240px", { exact: true })).toBeNull();
  });

  it("접근성 이름과 숫자를 모두 확인하여 오래된 표시나 다른 텍스트를 통과시키지 않는다", () => {
    expect(canvasHeightSnapshotMatches({ text: "8348", label: "높이 8348px" }, 8_348)).toBe(true);
    expect(canvasHeightSnapshotMatches({ text: "8000", label: "높이 8348px" }, 8_348)).toBe(false);
    expect(canvasHeightSnapshotMatches({ text: "8348", label: "높이 240px" }, 8_348)).toBe(false);
    expect(canvasHeightSnapshotMatches({ text: "8348", label: null }, 8_348)).toBe(false);
    expect(canvasHeightSnapshotMatches({ text: "네이버 8348", label: "높이 8348px" }, 8_348)).toBe(false);
    expect(canvasHeightSnapshotMatches({ text: "8348px", label: "높이 8348px" }, 8_348)).toBe(false);
  });
});

describe("메뉴 검증의 로컬 후보 주소 경계", () => {
  it.each(["127.0.0.1", "localhost", "[::1]"])("%s의 로컬 캔버스 주소만 받는다", (host) => {
    const candidate = `http://${host}:5417/studio/canvas`;
    expect(resolveMenuVerifierCandidateUrl(candidate)).toBe(candidate);
  });

  it.each([
    "https://toonstudio.example/studio/canvas",
    "http://192.168.1.1:5417/studio/canvas",
    "https://localhost:5417/studio/canvas",
    "http://user:password@127.0.0.1:5417/studio/canvas",
    "http://127.0.0.1:5417/studio/canvas?work=existing",
    "http://127.0.0.1:5417/studio/canvas#existing",
    "http://127.0.0.1:5417/studio/space",
    "http://127.0.0.1:5417/studio/canvas/",
    "/studio/canvas",
  ])("허용 범위 밖 주소 %s를 거부한다", (candidate) => {
    expect(() => resolveMenuVerifierCandidateUrl(candidate)).toThrow();
  });
});
