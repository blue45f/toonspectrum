import { Link } from "react-router-dom";

import { useDocumentTitle } from "@/hooks/use-document-title";
import { UnifiedAiSettings } from "@/shared/ai/UnifiedAiSettings";
import { Container } from "@/shared/components/section";

export function StudioAiSettingsPage() {
  useDocumentTitle("통합 AI 설정 · ToonStudio");
  return (
    <Container size="prose" className="py-8 sm:py-12">
      <Link
        to="/studio"
        className="inline-flex min-h-11 items-center text-sm font-bold text-accent"
      >
        ← ToonStudio
      </Link>
      <header className="mb-6 mt-3">
        <p className="eyebrow text-accent">AUTO FREE AI</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-4xl">
          자동 무료 AI와 내 연결
        </h1>
        <p className="mt-3 text-sm leading-7 text-fg-2">
          사이트 전체 AI 기능의 자동 무료 풀, 여러 클라우드 API 키와 모델 우선순위,
          3D 및 개인 런타임 토큰을 한곳에서 관리합니다.
        </p>
      </header>
      <UnifiedAiSettings />
    </Container>
  );
}
