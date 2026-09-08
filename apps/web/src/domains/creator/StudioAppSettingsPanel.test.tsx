import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultStudioAppSettings, type StudioAppSettingsTab } from "./studio-app-settings";
import { StudioAppSettingsPanel } from "./StudioAppSettingsPanel";

import { useI18n } from "@/shared/lib/i18n";

const { createPortalMock } = vi.hoisted(() => ({
  createPortalMock: vi.fn((children: unknown, _container: unknown) => children),
}));

vi.mock("react-dom", () => ({ createPortal: createPortalMock }));

const panelSource = readFileSync(new URL("./StudioAppSettingsPanel.tsx", import.meta.url), "utf8");

function renderSettings(initialTab: StudioAppSettingsTab = "general", persistenceState: "loading" | "saved" | "session-only" = "saved") {
  const body = { nodeName: "BODY" };
  vi.stubGlobal("document", { body });
  const html = renderToStaticMarkup(
    <StudioAppSettingsPanel
      open
      settings={defaultStudioAppSettings()}
      initialTab={initialTab}
      persistenceState={persistenceState}
      onClose={() => undefined}
      onChange={() => undefined}
      onResetAll={() => undefined}
      onRetryPersistence={() => undefined}
    />
  );
  return { body, html };
}

describe("StudioAppSettingsPanel", () => {
  beforeEach(() => useI18n.getState().setLang("ko"));

  afterEach(() => {
    createPortalMock.mockClear();
    vi.unstubAllGlobals();
  });

  it("일반 진입에서 검색 가능한 설정 홈과 작업 환경 프로필을 제공한다", () => {
    const { body, html } = renderSettings();

    expect(createPortalMock).toHaveBeenCalledOnce();
    expect(createPortalMock.mock.calls[0]?.[1]).toBe(body);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("애플리케이션 설정 검색");
    expect(html).toContain("설정 검색: 필압, 제스처, 그리드, 단축키…");
    expect(html).toContain("작업 환경 빠른 맞춤");
    expect(html).toContain("펜 디스플레이");
    expect(html).toContain("터치 우선");
    expect(html).toContain("집중·접근성");
    expect(html).toContain("세부 설정");
    expect(html).toContain("JSON 백업");
    expect(html).toContain("환경 진단");
  });

  it("기존 일곱 카테고리와 탭별 복구를 설정 홈에 노출한다", () => {
    const { html } = renderSettings();

    for (const label of ["일반", "단축키", "마우스", "터치·펜", "도구막대", "그리드·가이드", "기타"]) {
      expect(html).toContain(label);
    }
    expect(html.match(/이 섹션 초기화/g)).toHaveLength(7);
    expect(html).toContain("추천 기본값 사용 중");
  });

  it("전용 진입점은 안정화된 기존 카테고리 편집기로 바로 연결한다", () => {
    const { html } = renderSettings("toolbar");

    expect(html).toContain("도구막대에서 도구 찾기");
    expect(html).toContain("도구막대에 표시");
    expect(html).toContain("숨긴 도구 · 모든 도구에서 사용");
    expect(html.match(/max-h-\[min\(26rem,50dvh\)\]/g)).toHaveLength(2);
  });

  it("모바일·거친 포인터 조작을 44px 이상으로 유지한다", () => {
    const { html } = renderSettings();

    expect(html).toContain("place-items-end");
    expect(html).toContain("sm:place-items-center");
    expect(html).toContain("rounded-t-2xl");
    expect(html).toContain("sm:rounded-2xl");
    expect(html).toContain("pointer-coarse:min-h-11");
    expect(html).toContain('aria-label="설정 닫기"');
  });

  it("SQLite/OPFS hydration과 세션 한정 저장 실패를 구분한다", () => {
    expect(renderSettings("general", "loading").html).toContain(
      'data-studio-app-settings-persistence="loading"'
    );
    const sessionOnly = renderSettings("general", "session-only").html;
    expect(sessionOnly).toContain('role="alert"');
    expect(sessionOnly).toContain("설정을 이 기기에 저장하지 못해 현재 창에서만 적용됩니다.");
    expect(sessionOnly).toContain("설정 다시 저장");
  });

  it("공용 모달 계약으로 배경 격리·포커스 순환·Escape·복귀를 관리한다", () => {
    expect(panelSource).toContain('import { activateStudioModalSheet } from "./useStudioModalSheet";');
    expect(panelSource).toContain("return activateStudioModalSheet({");
    expect(panelSource).toContain("root: dialog.ownerDocument.body");
    expect(panelSource).toContain("onDismiss: dismissModal");
    expect(panelSource).toContain("tabIndex={-1}");
    expect(panelSource).not.toContain("const focusable = Array.from(");
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
