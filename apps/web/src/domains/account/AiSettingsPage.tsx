import { Suspense } from "react";
import { Link, useLocation } from "react-router-dom";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { UnifiedAiSettings } from "@/shared/ai/UnifiedAiSettings";
import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function AiSettingsPage() {
  const t = useBilingual("AiSettingsPage");
  useDocumentTitle(t("AI 설정 · ToonStudio", "AI settings · ToonStudio"));
  const location = useLocation();
  const source = new URLSearchParams(location.search).get("source");
  const backHref = source === "inference"
    ? "/studio/ai-runtime"
    : source === "studio"
      ? "/studio"
      : "/settings";
  const backLabel = source === "inference"
    ? t("AI 런타임", "AI runtime")
    : source === "studio"
      ? "ToonStudio"
      : t("설정", "Settings");

  return (
    <Container size="wide" className="py-8 sm:py-12">
      <Link to={backHref} className="inline-flex min-h-11 items-center text-sm font-bold text-accent">
        ← {backLabel}
      </Link>
      <header className="mb-7 mt-3 max-w-3xl">
        <p className="eyebrow text-accent">AI CONNECTION CENTER</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-4xl">{t("AI 설정", "AI settings")}</h1>
        <p className="mt-3 text-sm leading-7 text-fg-2">
          {t("자동 무료 AI, 내 API 키와 기능별 사용 순서를 한곳에서 관리해요. 처음에는 키 하나만 연결하면 되고, 세부 모델과 API 경로는 고급 설정에서만 보여요.", "Manage the automatic free AI, your API keys, and per-feature usage order in one place. Start by connecting a single key; detailed models and API paths stay inside advanced settings.")}
        </p>
      </header>
      <Suspense
        fallback={
          <div className="grid gap-4" role="status" aria-label={t("AI 설정을 불러오는 중", "Loading AI settings")}>
            <span className="skeleton block h-24 rounded-2xl" />
            <span className="skeleton block h-40 rounded-2xl" />
            <span className="sr-only">{t("AI 설정을 불러오는 중", "Loading AI settings")}</span>
          </div>
        }
      >
        <UnifiedAiSettings />
      </Suspense>
    </Container>
  );
}
