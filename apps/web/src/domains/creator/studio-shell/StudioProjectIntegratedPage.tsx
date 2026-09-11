import { useLocation, useParams } from "react-router-dom";

import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";

import {
  resolveStudioProjectView,
  studioProjectDefaultView,
} from "../studio-project-views";
import { StudioExportPanel } from "./StudioExportPanel";
import { StudioLocalizationPanel } from "./StudioLocalizationPanel";
import { StudioProjectAssistantPanel } from "./StudioProjectAssistantPanel";
import { StudioProjectFeatureSuitePanel } from "./StudioProjectFeatureSuitePanel";
import { StudioReviewPanel } from "./StudioReviewPanel";
import { StudioSeriesKitPanel } from "./StudioSeriesKitPanel";
import {
  StudioProjectShellPage,
  type StudioProjectSection,
} from "./StudioProjectShellPage";

type Locale = "ko" | "en";

function localeFromLanguage(language: string): Locale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

function decodeProjectId(projectId: string): string {
  try {
    return decodeURIComponent(projectId);
  } catch {
    return projectId;
  }
}

function SectionWorkflow({
  projectId,
  section,
  view,
  locale,
}: {
  readonly projectId: string;
  readonly section: StudioProjectSection;
  readonly view: string;
  readonly locale: Locale;
}) {
  return (
    <>
      <StudioProjectFeatureSuitePanel
        projectId={projectId}
        section={section}
        view={view}
        locale={locale}
      />
      {section === "story" && view === "localization" ? (
        <StudioLocalizationPanel projectId={projectId} locale={locale} />
      ) : null}
      {section === "assets" && view === "series" ? (
        <StudioSeriesKitPanel projectId={projectId} locale={locale} />
      ) : null}
      {section === "review" ? (
        <StudioReviewPanel projectId={projectId} locale={locale} />
      ) : null}
      {section === "export" ? (
        <StudioExportPanel projectId={projectId} locale={locale} />
      ) : null}
    </>
  );
}

/**
 * Compose the canonical project shell with every project-owned production capability.
 * Heavy editors remain optional destinations, while planning, checks and persisted project
 * workflows stay inside the selected project view instead of opening another product shell.
 */
export function StudioProjectIntegratedPage({
  section,
}: {
  readonly section: StudioProjectSection;
}) {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const location = useLocation();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const decodedProjectId = decodeProjectId(projectId);
  const view = (() => {
    try {
      return resolveStudioProjectView(decodedProjectId, section, location.search).view;
    } catch {
      return studioProjectDefaultView(section);
    }
  })();

  return (
    <>
      <StudioProjectShellPage section={section} />
      {decodedProjectId ? (
        <Container size="wide" className="-mt-3 space-y-5 pb-10 sm:-mt-5 sm:pb-14">
          <SectionWorkflow
            projectId={decodedProjectId}
            section={section}
            view={view}
            locale={locale}
          />
          <StudioProjectAssistantPanel
            projectId={decodedProjectId}
            section={section}
            locale={locale}
          />
        </Container>
      ) : null}
    </>
  );
}
