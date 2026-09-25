import { Link, useLocation } from "react-router-dom";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { UnifiedAiSettings } from "@/shared/ai/UnifiedAiSettings";
import { Container } from "@/shared/components/section";

export function AiSettingsPage() {
  useDocumentTitle("AI 설정 · ToonStudio");
  const location = useLocation();
  const source = new URLSearchParams(location.search).get("source");
  const backHref = source === "inference"
    ? "/studio/ai-runtime"
    : source === "studio"
      ? "/studio"
      : "/settings";
  const backLabel = source === "inference" ? "AI 런타임" : source === "studio" ? "ToonStudio" : "설정";

  return (
    <Container size="wide" className="py-8 sm:py-12">
      <Link to={backHref} className="inline-flex min-h-11 items-center text-sm font-bold text-accent">
        ← {backLabel}
      </Link>
      <header className="mb-7 mt-3 max-w-3xl">
        <p className="eyebrow text-accent">AI CONNECTION CENTER</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-4xl">AI 설정</h1>
        <p className="mt-3 text-sm leading-7 text-fg-2">
          자동 무료 AI, 내 API 키와 기능별 사용 순서를 한곳에서 관리해요. 처음에는 키 하나만 연결하면 되고, 세부 모델과 API 경로는 고급 설정에서만 보여요.
        </p>
      </header>
      <UnifiedAiSettings />
    </Container>
  );
}
