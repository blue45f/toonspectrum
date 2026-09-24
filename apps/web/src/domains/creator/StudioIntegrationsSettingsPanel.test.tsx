// Studio 연동 허브의 정적 렌더 계약. AI 섹션은 비밀값 없는 canonical 설정 진입 카드만
// 노출하고, Unsplash Access Key는 현재 탭 범위 입력으로 유지되는지 검증한다.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { STUDIO_AI_DEFAULT_SETTINGS, type StudioAiSettings } from "./ai/studio-ai-client";
import { STUDIO_STOCK_IMAGE_ACCESS_KEY_STORAGE_KEY } from "./studio-stock-image-client";
import { lockUserAi, setUserAiConfiguration } from "@/shared/ai/user-ai-store";
import { useI18n } from "@/shared/lib/i18n";
import { StudioIntegrationsSettingsPanel } from "./StudioIntegrationsSettingsPanel";

// StudioStockImagePanel.test.tsx의 fakeStorage와 동일한 최소 stub(중복 정의 — 두 BYOK 기능을 코드
// 레벨에서도 독립적으로 유지하는 studio-stock-image-client.ts의 설계 원칙과 결을 맞췄다).
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

const noopChange = (_next: StudioAiSettings) => {
  // 이 스위트는 정적 마운트 렌더만 검증한다 — onAiSettingsChange는 절대 호출되지 않는다(입력 이벤트가
  // 없다).
};

const INITIAL_LANGUAGE = useI18n.getState().lang;

describe("StudioIntegrationsSettingsPanel mount-time render contract", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    lockUserAi(false);
    useI18n.setState({ lang: INITIAL_LANGUAGE });
    Reflect.deleteProperty(globalThis, "localStorage");
    Reflect.deleteProperty(globalThis, "sessionStorage");
  });

  it("renders both the AI assist section and the Unsplash section, unconfigured by default", () => {
    globalThis.localStorage = fakeStorage() as unknown as Storage;
    globalThis.sessionStorage = fakeStorage() as unknown as Storage;

    const html = renderToStaticMarkup(
      <StudioIntegrationsSettingsPanel aiSettings={STUDIO_AI_DEFAULT_SETTINGS} onAiSettingsChange={noopChange} />
    );

    // Studio 안에서는 전체 키 편집기를 반복 렌더하지 않고 canonical 설정으로 가는 상태 카드만 보인다.
    expect(html).toContain("AI 어시스트 연결");
    expect(html).toContain("AI 설정 열기");
    expect(html).toContain('/settings/ai?source=studio');
    expect(html).not.toContain("클라우드 공급자 프리셋");
    expect(html).not.toContain("API 키 프로필");
    expect(html).not.toContain("http://localhost:8082/v1");

    // 무료 스톡 이미지(Unsplash) 섹션 — 헤더·미등록 상태.
    expect(html).toContain("무료 스톡 이미지 (Unsplash)");
    expect(html).toContain("Unsplash Access Key");
    expect(html).toContain("AI 연결은 통합 설정에서");
    expect(html).toContain("min-h-11 w-full");
    expect(html).toContain("size-11");
    expect(html).not.toContain("Access Key 등록됨");
  });

  it("reflects a saved AI API key and a saved Unsplash Access Key", () => {
    globalThis.localStorage = fakeStorage({
      [STUDIO_STOCK_IMAGE_ACCESS_KEY_STORAGE_KEY]: "legacy-key-must-not-import",
    }) as unknown as Storage;
    globalThis.sessionStorage = fakeStorage({
      [STUDIO_STOCK_IMAGE_ACCESS_KEY_STORAGE_KEY]: "unsplash-existing-key",
    }) as unknown as Storage;
    const aiSettings: StudioAiSettings = { ...STUDIO_AI_DEFAULT_SETTINGS, apiKey: "sk-test-123" };
    setUserAiConfiguration({
      version: 1,
      connections: [{
        ...aiSettings,
        id: "integration",
        label: "Studio 연결",
        baseUrl: "https://openrouter.ai/api/v1",
        textModel: "openrouter/free",
        imageModel: "",
        costPolicy: "openrouter-free",
        apiKeys: [{ id: "key-1", label: "기본 키", apiKey: "sk-test-123", enabled: true, priority: 10 }],
        models: [{ id: "model-1", label: "무료 자동", model: "openrouter/free", capability: "text", enabled: true, priority: 10 }],
      }],
      assignments: { text: "integration", image: null, inference: null, "three-d": null },
    });

    const html = renderToStaticMarkup(
      <StudioIntegrationsSettingsPanel aiSettings={aiSettings} onAiSettingsChange={noopChange} />
    );

    // 통합 보관함은 연결 개수만 렌더하고 비밀 값·endpoint·model을 인라인 화면에 다시 싣지 않는다.
    expect(html).toContain("내 AI 1개 연결됨");
    expect(html).not.toContain("https://openrouter.ai/api/v1");
    expect(html).not.toContain("openrouter/free");
    expect(html).not.toContain("sk-test-123");
    // 스톡 이미지 섹션은 현재 탭의 sessionStorage 값만 반영해 "등록됨" 배지가 뜬다.
    expect(html).toContain("Access Key 등록됨");
    expect(html).toContain('value="unsplash-existing-key"');
    expect(html).not.toContain("legacy-key-must-not-import");
  });
});
