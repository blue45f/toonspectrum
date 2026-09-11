import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";

import { StudioImportPage } from "./StudioFrontDoorPages";
import { StudioImportIntake } from "./StudioImportIntake";

function localeFromLanguage(language: string): "ko" | "en" {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

/** Keeps the visual front door while adding the real preflight-to-editor import path below it. */
export function StudioImportIntegratedPage() {
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  return (
    <>
      <StudioImportPage />
      <Container size="wide" className="pb-10 lg:pb-12">
        <StudioImportIntake locale={locale} />
      </Container>
    </>
  );
}
