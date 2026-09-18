import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { Link } from "react-router-dom";
import { Container } from "@/shared/components/section";
import { UnifiedAiSettings } from "@/shared/ai/UnifiedAiSettings";
import { useDocumentTitle } from "@/hooks/use-document-title";

export function AiSettingsPage() {
  useDocumentTitle("통합 AI 설정 · ToonStudio");
  return <Container size="prose" className="py-8">
    <Link to="/settings" className="mb-6 inline-flex min-h-11 items-center text-accent">{translateCurrentStaticSourceText("domains.account.AiSettingsPage", "ko", "← 설정")}</Link>
    <h1 className="mb-6 text-3xl font-bold">{translateCurrentStaticSourceText("domains.account.AiSettingsPage", "ko", "자동 무료 AI와 내 연결")}</h1>
    <UnifiedAiSettings />
  </Container>;
}
