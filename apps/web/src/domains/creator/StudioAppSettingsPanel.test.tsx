import { readFileSync } from "node:fs";

// @ts-expect-error -- jsdom is a test-only runtime fixture and does not bundle TypeScript types.
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readStudioCanvasViewportStack } from "./canvas/read-studio-canvas-viewport-stack";
import {
  defaultStudioAppSettings,
  type StudioAppSettings,
  type StudioAppSettingsTab,
} from "./studio-app-settings";
import { readStudioCuttoonEditorSource } from "./studio-cuttoon-editor/read-studio-cuttoon-editor-source";
import {
  MAX_STUDIO_TOOL_HINT_TOUCH_HOLD_MS,
  MIN_STUDIO_TOOL_HINT_TOUCH_HOLD_MS,
} from "./studio-tool-hint-preferences";
import { StudioAppSettingsPanel } from "./StudioAppSettingsPanel";

import { useI18n } from "@/shared/lib/i18n";

const { createPortalMock } = vi.hoisted(() => ({
  createPortalMock: vi.fn((children: unknown, _container: unknown) => children),
}));

vi.mock("react-dom", () => ({
  createPortal: createPortalMock,
}));

const studioPageSource = readStudioCuttoonEditorSource();
const studioCanvasViewportSource = readStudioCanvasViewportStack(import.meta.url, "./canvas/");
const appSettingsPanelSource = readFileSync(
  new URL("./StudioAppSettingsPanel.tsx", import.meta.url),
  "utf8"
);

function renderSettings(
  initialTab: StudioAppSettingsTab = "general",
  settings: StudioAppSettings = defaultStudioAppSettings()
) {
  const body = { nodeName: "BODY" };
  vi.stubGlobal("document", { body });
  const html = renderToStaticMarkup(
    <StudioAppSettingsPanel
      open
      settings={settings}
      initialTab={initialTab}
      onClose={() => undefined}
      onChange={() => undefined}
      onResetAll={() => undefined}
    />
  );
  return { body, html };
}

function openingButtonTagByAriaLabel(html: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return html.match(new RegExp(`<button(?=[^>]*aria-label="${escaped}")[^>]*>`, "u"))?.[0] ?? "";
}

function openingButtonTagByText(html: string, text: string): string {
  const fragment = JSDOM.fragment(html) as DocumentFragment;
  const button = Array.from(fragment.querySelectorAll("button")).find((element) =>
    element.textContent?.trim() === text
  );
  return button?.outerHTML.match(/^<button\b[^>]*>/u)?.[0] ?? "";
}

describe("settings button text lookup", () => {
  it("uses parsed text for nested markup and encoded literal tags", () => {
    expect(openingButtonTagByText(
      '<button data-target="nested"><span>High</span> quality</button>',
      "High quality",
    )).toContain('data-target="nested"');
    expect(openingButtonTagByText(
      '<button data-target="literal">&lt;script&gt; &amp; quality</button>',
      "<script> & quality",
    )).toContain('data-target="literal"');
    expect(openingButtonTagByText("<button>Other</button>", "Missing")).toBe("");
  });
});

describe("StudioAppSettingsPanel", () => {
  beforeEach(() => {
    useI18n.getState().setLang("ko");
  });

  afterEach(() => {
    createPortalMock.mockClear();
    vi.unstubAllGlobals();
  });

  it("모바일 하단 시트와 데스크톱 중앙 모달을 같은 접근 가능한 대화상자로 제공한다", () => {
    const { body, html } = renderSettings();

    expect(createPortalMock).toHaveBeenCalledOnce();
    expect(createPortalMock.mock.calls[0]?.[1]).toBe(body);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("place-items-end");
    expect(html).toContain("sm:place-items-center");
    expect(html).toContain("rounded-t-2xl");
    expect(html).toContain("sm:rounded-2xl");
    expect(html).toContain('aria-label="설정 탭"');
  });

  it("짧게·동작 미리보기·끄기 세 단계 설명 모드를 노출한다", () => {
    const { html } = renderSettings();

    expect(html).toContain("도구 설명");
    expect(html).toContain(">짧게<");
    expect(html).toContain(">동작 미리보기<");
    expect(html).toContain(">끄기<");
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>동작 미리보기<\/button>/);
  });

  it("입력 안정화 지연을 확인할 수 있는 선 보정 안내선 토글을 제공한다", () => {
    const { html } = renderSettings();

    expect(html).toContain("선 보정 안내선");
    expect(html).toContain("실제 포인터와 그려지는 위치를 연결해 보여 줍니다");
    expect(openingButtonTagByText(html, "숨김")).toContain('aria-pressed="false"');
  });

  it("터치 탭에서 조절 가능한 도구 설명 길게 누르기 시간을 제공한다", () => {
    const { html } = renderSettings("touch");
    const range = html.match(
      /<input(?=[^>]*aria-label="도구 설명을 여는 길게 누르기 시간")[^>]*>/u
    )?.[0] ?? "";

    expect(html).toContain('aria-label="도구 설명을 여는 길게 누르기 시간"');
    expect(html).toContain(`min="${MIN_STUDIO_TOOL_HINT_TOUCH_HOLD_MS}"`);
    expect(html).toContain(`max="${MAX_STUDIO_TOOL_HINT_TOUCH_HOLD_MS}"`);
    expect(html).toContain("480ms");
    expect(range).toContain("min-h-11");
    expect(range).toContain("pointer-coarse:min-h-11");
  });

  it("공용 모달 계약으로 배경 격리·포커스 순환·Escape·복귀를 한 곳에서 관리한다", () => {
    expect(appSettingsPanelSource).toContain('import { activateStudioModalSheet } from "./useStudioModalSheet";');
    expect(appSettingsPanelSource).toContain("return activateStudioModalSheet({");
    expect(appSettingsPanelSource).toContain("root: dialog.ownerDocument.body");
    expect(appSettingsPanelSource).toContain("onDismiss: dismissModal");
    expect(appSettingsPanelSource).toContain("tabIndex={-1}");
    expect(appSettingsPanelSource).not.toContain("const focusable = Array.from(");
  });

  it("단축키·가이드·초기화 조작도 좁은 화면에서 44px 높이를 유지한다", () => {
    const shortcuts = renderSettings("shortcuts").html;
    const grids = renderSettings("grids").html;
    const other = renderSettings("other").html;
    const gridSelect = grids.match(/<select\b[^>]*>/u)?.[0] ?? "";

    expect(openingButtonTagByText(shortcuts, "V")).toContain("min-h-11");
    expect(openingButtonTagByText(shortcuts, "기본 단축키로 되돌리기")).toContain("min-h-11");
    expect(grids).toContain("캔버스 눈금자");
    expect(grids).toContain("실제 문서 좌표를 표시합니다");
    expect(gridSelect).toContain("min-h-11");
    expect(openingButtonTagByText(other, "추천 기본값으로 되돌리기")).toContain("min-h-11");
  });

  it("단축키 충돌 시 안내와 행 배지를 표시한다", () => {
    const defaults = defaultStudioAppSettings();
    const settings: StudioAppSettings = {
      ...defaults,
      shortcuts: {
        ...defaults.shortcuts,
        "tool-pen": "K",
        "flip-canvas": "K",
      },
    };
    const { html } = renderSettings("shortcuts", settings);
    expect(html).toContain("같은 키 조합이");
    expect(html).toContain("충돌");
    expect(html).toContain("캔버스 좌우 반전");
  });

  it("도구막대 설정을 검색 가능한 두 개의 독립 스크롤 목록으로 제공한다", () => {
    const { html } = renderSettings("toolbar");

    expect(html).toContain('type="search"');
    expect(html).toContain("도구막대에서 도구 찾기");
    expect(html).toContain("도구 이름 검색");
    expect(html).toContain("도구막대에 표시");
    expect(html).toContain("숨긴 도구 · 모든 도구에서 사용");
    // 신규 기본값은 핵심 9개만 표시하므로 표시/숨김 목록이 둘 다 실제 스크롤 영역이다.
    expect(html.match(/max-h-\[min\(26rem,50dvh\)\]/g)).toHaveLength(2);
    expect(html).toContain("순서와 표시 상태는 바로 적용됩니다.");
    expect(html).toContain("변경한 설정은 이 기기에 자동으로 저장됩니다.");
    expect(html).toContain("모든 도구 표시");
  });

  it("설정 저장 실패를 현재 창 한정 상태와 재시도 동작으로 분명히 알린다", () => {
    const body = { nodeName: "BODY" };
    vi.stubGlobal("document", { body });
    const html = renderToStaticMarkup(
      <StudioAppSettingsPanel
        open
        settings={defaultStudioAppSettings()}
        persistenceState="session-only"
        onClose={() => undefined}
        onChange={() => undefined}
        onResetAll={() => undefined}
        onRetryPersistence={() => undefined}
      />
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("설정을 이 기기에 저장하지 못해 현재 창에서만 적용됩니다.");
    expect(html).toContain("설정 다시 저장");
    expect(html).not.toContain("변경한 설정은 이 기기에 자동으로 저장됩니다.");
    expect(studioCanvasViewportSource).toContain(
      "persistenceState={appSettingsPersistenceState}",
    );
    expect(studioCanvasViewportSource).toContain(
      "onRetryPersistence={retryAppSettingsPersistence}",
    );
  });

  it("설정 hydration이 끝나기 전에는 저장 완료로 표시하지 않는다", () => {
    const body = { nodeName: "BODY" };
    vi.stubGlobal("document", { body });
    const html = renderToStaticMarkup(
      <StudioAppSettingsPanel
        open
        settings={defaultStudioAppSettings()}
        persistenceState="loading"
        onClose={() => undefined}
        onChange={() => undefined}
        onResetAll={() => undefined}
      />
    );

    expect(html).toContain('data-studio-app-settings-persistence="loading"');
    expect(html).toContain("SQLite/OPFS에서 설정을 확인하는 중입니다.");
    expect(html).not.toContain("변경한 설정은 이 기기에 자동으로 저장됩니다.");
  });

  it("가로형 터치 화면에서도 도구막대 설정의 모든 핵심 조작을 44px 이상으로 유지한다", () => {
    const defaults = defaultStudioAppSettings();
    const settings: StudioAppSettings = {
      ...defaults,
      toolbar: { visibleIds: defaults.toolbar.visibleIds.slice(0, -1) },
    };
    const { html } = renderSettings("toolbar", settings);
    const activeToolbarTab = html.match(
      /<button(?=[^>]*aria-current="page")[^>]*>도구막대<\/button>/u
    )?.[0] ?? "";
    const search = html.match(/<input(?=[^>]*type="search")[^>]*>/u)?.[0] ?? "";

    expect(openingButtonTagByAriaLabel(html, "설정 닫기")).toContain(
      "pointer-coarse:min-h-11 pointer-coarse:min-w-11"
    );
    expect(activeToolbarTab).toContain("pointer-coarse:min-h-11");
    expect(activeToolbarTab).toContain("pointer-coarse:min-w-11");
    expect(search).toContain("pointer-coarse:h-11");
    for (const label of [
      "선택 위로",
      "선택 아래로",
      "선택 도구막대에서 숨기기",
      "화면 회전 도구막대에 표시",
    ]) {
      const action = openingButtonTagByAriaLabel(html, label);
      expect(action, label).toContain("pointer-coarse:min-h-11");
      expect(action, label).toContain("pointer-coarse:min-w-11");
    }
    expect(openingButtonTagByText(html, "모든 도구 표시")).toContain("pointer-coarse:min-h-11");
    expect(openingButtonTagByText(html, "완료")).toContain("pointer-coarse:min-h-11");
    expect(html.match(/max-h-\[min\(26rem,50dvh\)\]/gu)).toHaveLength(2);
  });

  it("설정 모달은 단축키 모달 상태와 독립적으로 마운트된다", () => {
    const shortcutsStart = studioCanvasViewportSource.indexOf("{shortcutsOpen ? (");
    const appSettingsStart = studioCanvasViewportSource.indexOf(
      "{appSettingsOpen ? (",
      shortcutsStart,
    );
    const shortcutsClose = studioCanvasViewportSource.indexOf(") : null}", shortcutsStart);

    expect(shortcutsStart).toBeGreaterThanOrEqual(0);
    expect(shortcutsClose).toBeGreaterThan(shortcutsStart);
    expect(appSettingsStart).toBeGreaterThan(shortcutsClose);
    expect(studioPageSource).toContain("<StudioToolHintPreferencesProvider");
    expect(studioPageSource).toContain("mode={appSettings.general.toolHintMode}");
    expect(studioPageSource).toContain("touchHoldDelayMs={appSettings.touch.toolHintHoldMs}");
    expect(studioPageSource).toContain("reduceMotion={appSettings.other.reduceMotion}");
  });

  it("닫힌 상태에서는 포털과 대화상자를 만들지 않는다", () => {
    const html = renderToStaticMarkup(
      <StudioAppSettingsPanel
        open={false}
        settings={defaultStudioAppSettings()}
        onClose={() => undefined}
        onChange={() => undefined}
        onResetAll={() => undefined}
      />
    );

    expect(html).toBe("");
    expect(createPortalMock).not.toHaveBeenCalled();
  });
});
