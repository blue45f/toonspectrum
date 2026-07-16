import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultStudioAppSettings } from "./studio-app-settings";
import {
  MAX_STUDIO_TOOL_HINT_TOUCH_HOLD_MS,
  MIN_STUDIO_TOOL_HINT_TOUCH_HOLD_MS,
} from "./studio-tool-hint-preferences";
import { StudioAppSettingsPanel } from "./StudioAppSettingsPanel";

const { createPortalMock } = vi.hoisted(() => ({
  createPortalMock: vi.fn((children: unknown, _container: unknown) => children),
}));

vi.mock("react-dom", () => ({
  createPortal: createPortalMock,
}));

const studioPageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

function renderSettings(initialTab: "general" | "touch" = "general") {
  const body = { nodeName: "BODY" };
  vi.stubGlobal("document", { body });
  const html = renderToStaticMarkup(
    <StudioAppSettingsPanel
      open
      settings={defaultStudioAppSettings()}
      initialTab={initialTab}
      onClose={() => undefined}
      onChange={() => undefined}
      onResetAll={() => undefined}
    />
  );
  return { body, html };
}

describe("StudioAppSettingsPanel", () => {
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

  it("간단·동작 미리보기·끔 세 단계 도움말 모드를 노출한다", () => {
    const { html } = renderSettings();

    expect(html).toContain("도구 도움말");
    expect(html).toContain(">간단<");
    expect(html).toContain(">동작 미리보기<");
    expect(html).toContain(">끔<");
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>동작 미리보기<\/button>/);
  });

  it("터치 탭에서 조절 가능한 Motion Coach 길게 누르기 시간을 제공한다", () => {
    const { html } = renderSettings("touch");

    expect(html).toContain('aria-label="도구 도움말 길게 누르기 시간"');
    expect(html).toContain(`min="${MIN_STUDIO_TOOL_HINT_TOUCH_HOLD_MS}"`);
    expect(html).toContain(`max="${MAX_STUDIO_TOOL_HINT_TOUCH_HOLD_MS}"`);
    expect(html).toContain("480ms");
  });

  it("설정 모달은 단축키 모달 상태와 독립적으로 마운트된다", () => {
    const shortcutsStart = studioPageSource.indexOf("{shortcutsOpen ? (");
    const appSettingsStart = studioPageSource.indexOf("{appSettingsOpen ? (", shortcutsStart);
    const shortcutsClose = studioPageSource.indexOf(") : null}", shortcutsStart);

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
