import { useParams } from "react-router-dom";

import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";

import { StudioExportPanel } from "./StudioExportPanel";
import { StudioLocalizationPanel } from "./StudioLocalizationPanel";
import { StudioProjectAssistantPanel } from "./StudioProjectAssistantPanel";
import { StudioReviewPanel } from "./StudioReviewPanel";
import {
  StudioProjectShellPage,
  type StudioProjectSection,
} from "./StudioProjectShellPage";

type Locale = "ko" | "en";

function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

function SectionWorkflow({
  projectId,
  section,
  locale,
}: {
  readonly projectId: string;
  readonly section: StudioProjectSection;
  readonly locale: Locale;
}) {
  if (section === "story") return <StudioLocalizationPanel projectId={projectId} locale={locale} />;
  if (section === "review") return <StudioReviewPanel projectId={projectId} locale={locale} />;
  if (section === "export") return <StudioExportPanel projectId={projectId} locale={locale} />;
  return null;
}

/**
 * Compose the canonical project shell with cross-cutting production capabilities.
 * Feature panels live outside the legacy shell so each capability keeps one primary surface.
 */
export function StudioProjectIntegratedPage({
  section,
}: {
  readonly section: StudioProjectSection;
}) {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);

  return (
    <>
      <StudioProjectShellPage section={section} />
      {projectId ? (
        <Container size="wide" className="-mt-3 space-y-5 pb-10 sm:-mt-5 sm:pb-14">
          <SectionWorkflow projectId={projectId} section={section} locale={locale} />
          <StudioProjectAssistantPanel
            projectId={projectId}
            section={section}
            locale={locale}
          />
        </Container>
      ) : null}
    </>
  );
}
