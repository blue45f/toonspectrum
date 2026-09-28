import { getActiveI18nLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";

import { StudioImportPage } from "./StudioFrontDoorPages";
import { StudioImportIntake } from "./StudioImportIntake";
import { StudioImportVisualGuide } from "./StudioImportVisualGuide";
import "./studio-illustrated-project-surfaces.css";



function localeFromLanguage(_language: string): "ko" | "en" {
  return getActiveI18nLocale() === "ko" ? "ko" : "en";
}

/** Keeps the visual front door while adding the real preflight-to-editor import path below it. */
export function StudioImportIntegratedPage() {
  useBilingualI18nRevision();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  return (
    <div data-studio-illustrated-surface="import">
      <StudioImportPage />
      <Container size="wide" className="pb-10 lg:pb-12">
        <StudioImportVisualGuide locale={locale} />
        <StudioImportIntake locale={locale} />
      </Container>
    </div>
  );
}
