/**
 * Help 그룹 배선 계약.
 *
 * 감사가 판정한 것은 "기능이 없다"가 아니라 "문이 없다"였다. 그러니 여기서 보는
 * 것은 각 줄이 **실제로 무엇인가를 여는가**다. 라벨만 있고 아무 데도 닿지 않는
 * 줄은 감사 결과를 숫자로만 좋게 만들 뿐이므로 여기서 잡힌다.
 */

import { describe, expect, it, vi } from "vitest";

import {
  subscribeStudioCommandSearchRequests,
  subscribeStudioHelpCenter,
} from "./studio-help-center-channel";
import { buildStudioHelpGroupItems } from "./studio-help-menu-items";
import { STUDIO_MENU_GROUP_SPEC } from "./studio-main-menu-group-spec";

import type { StudioHelpCenterRequest } from "./studio-help-center-channel";
import type {
  StudioMainMenuBuilderState,
  StudioMainMenuEditorActions,
  StudioMainMenuUiActions,
} from "./studio-main-menu-contract";

function helpItems(activeToolCommandId: string | null = "tool.pen") {
  const editor = new Proxy({} as StudioMainMenuEditorActions, {
    get: () => vi.fn(),
  });
  const ui = new Proxy({} as StudioMainMenuUiActions, { get: () => vi.fn() });
  const state = { activeToolCommandId } as unknown as StudioMainMenuBuilderState;
  return buildStudioHelpGroupItems({ state, editor, ui, helpGroupLabel: "도움말" });
}

describe("§15.3 Help 그룹", () => {
  it("§15.3 여덟 행에 각각 문을 내고, 기존 두 줄을 복제하지 않는다", () => {
    const ids = helpItems().map((item) => item.id);
    expect(ids).toEqual([
      "command-search",
      "terminology-search",
      "current-tool",
      "feature-tutorials",
      "shortcuts",
      "diagnostics",
      "recovery",
      "licenses",
      "bug-report",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("한국어가 아닌 로케일에서는 영어 라벨을 낸다", () => {
    const editor = new Proxy({} as StudioMainMenuEditorActions, { get: () => vi.fn() });
    const ui = new Proxy({} as StudioMainMenuUiActions, { get: () => vi.fn() });
    const english = buildStudioHelpGroupItems({
      state: { activeToolCommandId: "tool.pen" } as unknown as StudioMainMenuBuilderState,
      editor,
      ui,
      helpGroupLabel: "Help",
    });
    // 75개 팩은 키 개수가 같아야 해서 두 팩에만 키를 넣을 수 없다. Help 그룹이 이미
    // 쓰던 로케일 프로브를 그대로 재사용한다.
    expect(english.find((item) => item.id === "bug-report")?.label).toBe(
      "Bug report package…",
    );
    expect(helpItems().find((item) => item.id === "bug-report")?.label).toBe(
      "버그 리포트 패키지…",
    );
  });

  it("모든 줄이 카탈로그 명령 id 를 참조한다", () => {
    for (const item of helpItems()) {
      expect(item.commandId, item.id).toMatch(/^help\./u);
    }
  });

  it("통합 검색 줄은 F1 을 광고하고 실제로 검색을 연다", () => {
    const search = helpItems().find((item) => item.id === "command-search");
    expect(search?.shortcut).toBe("F1");
    let opened = 0;
    const unsubscribe = subscribeStudioCommandSearchRequests(() => {
      opened += 1;
    });
    search?.onSelect();
    unsubscribe();
    expect(opened).toBe(1);
  });

  it("나머지 다섯 줄은 각자의 도움말 구역을 연다", () => {
    const seen: StudioHelpCenterRequest[] = [];
    const unsubscribe = subscribeStudioHelpCenter((request) => seen.push(request));
    for (const item of helpItems()) {
      if (item.id === "command-search") continue;
      if (item.id === "feature-tutorials" || item.id === "shortcuts") continue;
      item.onSelect();
    }
    unsubscribe();
    expect(seen.map((request) => request.section)).toEqual([
      "terminology",
      "current-tool",
      "diagnostics",
      "recovery",
      "license",
      "bug-report",
    ]);
  });

  it("현재 도구 줄은 메뉴를 연 순간의 도구를 실어 보낸다", () => {
    const seen: StudioHelpCenterRequest[] = [];
    const unsubscribe = subscribeStudioHelpCenter((request) => seen.push(request));
    helpItems("tool.wet-mix").find((item) => item.id === "current-tool")?.onSelect();
    helpItems(null).find((item) => item.id === "current-tool")?.onSelect();
    unsubscribe();
    expect(seen).toEqual([
      { section: "current-tool", toolCommandId: "tool.wet-mix" },
      // 도구를 알 수 없으면 추측한 값을 붙이지 않는다.
      { section: "current-tool" },
    ]);
  });

  it("커버리지 표가 Help 8행을 전부 어떤 항목엔가 연결한다", () => {
    const help = STUDIO_MENU_GROUP_SPEC.find((group) => group.id === "help");
    expect(help?.rows).toHaveLength(8);
    expect(help?.rows.filter((row) => row.coverage === "absent")).toEqual([]);
    // 산문 도움말과 튜토리얼 프로젝트는 여전히 부분이다 — 이유가 적혀 있어야 한다.
    const partial = help?.rows.filter((row) => row.coverage === "partial") ?? [];
    expect(partial.map((row) => row.spec)).toEqual([
      "Current Tool Help",
      "Tutorial Project",
    ]);
    expect(partial.every((row) => (row.note ?? "").trim().length > 0)).toBe(true);
  });
});
