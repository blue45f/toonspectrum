import { useState } from "react";
import { Link } from "react-router-dom";

import { useDocumentTitle } from "@/hooks/use-document-title";
import { Container } from "@/shared/components/section";

import {
  loadStudioAiSessionSettings,
  saveStudioAiSettings,
  type StudioAiSettings,
} from "./studio-ai-client";
import { UnifiedAiSettingsEditor } from "./UnifiedAiSettingsEditor";

export function StudioAiSettingsPage() {
  useDocumentTitle("통합 AI 설정 · ToonStudio");
  const [settings, setSettings] = useState<StudioAiSettings>(() =>
    loadStudioAiSessionSettings(globalThis.sessionStorage, globalThis.localStorage)
  );
  const update = (next: StudioAiSettings) => {
    setSettings(next);
    saveStudioAiSettings(globalThis.sessionStorage, next);
  };
  return (
    <Container size="prose" className="py-8 sm:py-12">
      <Link to="/studio" className="inline-flex min-h-11 items-center text-sm font-bold text-accent">← ToonStudio</Link>
      <header className="mb-6 mt-3">
        <p className="eyebrow text-accent">USER-FUNDED AI</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-4xl">내 AI 연결</h1>
        <p className="mt-3 text-sm leading-7 text-fg-2">사이트 전체 AI 기능의 키·모델·개인 추론 서버를 한곳에서 관리합니다. 비밀 값은 현재 탭에만 남고 서버·작품 파일·분석 이벤트에는 저장하지 않습니다.</p>
      </header>
      <UnifiedAiSettingsEditor studioSettings={settings} onStudioSettingsChange={update} />
    </Container>
  );
}
