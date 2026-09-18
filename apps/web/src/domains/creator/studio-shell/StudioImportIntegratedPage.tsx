import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";

import { StudioImportPage } from "./StudioFrontDoorPages";
import { StudioImportIntake } from "./StudioImportIntake";
import { StudioImportVisualGuide } from "./StudioImportVisualGuide";



function localeFromLanguage(_language): "ko" | "en" {
  return getActiveI18nLocale();
}

/** Keeps the visual front door while adding the real preflight-to-editor import path below it. */
export function StudioImportIntegratedPage() {
  useBilingualI18nRevision();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  return (
    <>
      <StudioImportPage />
      <Container size="wide" className="pb-10 lg:pb-12">
        <StudioImportVisualGuide locale={locale} />
        <StudioImportIntake locale={locale} />
      </Container>
    </>
  );
}
