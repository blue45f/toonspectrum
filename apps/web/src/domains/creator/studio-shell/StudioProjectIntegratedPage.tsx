import { lazy, Suspense } from "react";
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
import { StudioProjectDeliveryPanel } from "./StudioProjectDeliveryPanel";
import { StudioProjectDocumentsPanel } from "./StudioProjectDocumentsPanel";
import { StudioProductionCocreatorBridgePanel } from "./StudioProductionCocreatorBridgePanel";
import { StudioProjectFeatureSuitePanel } from "./StudioProjectFeatureSuitePanel";
import { StudioReviewPanel } from "./StudioReviewPanel";
import { StudioProductionToolchainPanel } from "../toolchain/StudioProductionToolchainPanel";
import { StudioSeriesKitPanel } from "./StudioSeriesKitPanel";
import { StudioWebtoonOnboardingPanel } from "./StudioWebtoonOnboardingPanel";
import {
  StudioProjectShellPage,
  type StudioProjectSection,
} from "./StudioProjectShellPage";

type Locale = "ko" | "en";

const StudioCompatibilityReportsPanel = lazy(async () => {
  const module = await import("../project-graph/StudioCompatibilityReportsPanel");
  return { default: module.StudioCompatibilityReportsPanel };
});

const StudioProjectGraphContextBar = lazy(async () => {
  const module = await import("../project-graph/StudioProjectGraphContextBar");
  return { default: module.StudioProjectGraphContextBar };
});

const StudioProjectVersionStackPanel = lazy(async () => {
  const module = await import("../project-graph/StudioProjectVersionStackPanel");
  return { default: module.StudioProjectVersionStackPanel };
});

function ProjectGraphPanelFallback({ locale }: { readonly locale: Locale }) {
  return (
    <div
      className="min-h-20 animate-pulse rounded-2xl border border-line bg-card/80"
      role="status"
      aria-label={locale === "ko" ? "작품 버전 정보를 불러오는 중" : "Loading project version data"}
    />
  );
}

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
  const showDelivery = section === "export" || (section === "settings" && view === "archive");

  return (
    <>
      <StudioProjectFeatureSuitePanel
        projectId={projectId}
        section={section}
        view={view}
        locale={locale}
      />
      {section === "production" ? (
        <StudioProductionCocreatorBridgePanel projectId={projectId} locale={locale} />
      ) : null}
      {section === "production" && view === "documents" ? (
        <StudioProjectDocumentsPanel projectId={projectId} locale={locale} />
      ) : null}
      {section === "production" && (view === "pipeline" || view === "renders") ? (
        <StudioProductionToolchainPanel
          projectId={projectId}
          view={view}
        />
      ) : null}
      {section === "story" && view === "localization" ? (
        <StudioLocalizationPanel projectId={projectId} locale={locale} />
      ) : null}
      {section === "assets" && view === "series" ? (
        <StudioSeriesKitPanel projectId={projectId} locale={locale} />
      ) : null}
      {section === "review" && view === "versions" ? (
        <Suspense fallback={<ProjectGraphPanelFallback locale={locale} />}>
          <StudioProjectVersionStackPanel projectId={projectId} locale={locale} />
        </Suspense>
      ) : null}
      {section === "review" ? (
        <StudioReviewPanel projectId={projectId} locale={locale} />
      ) : null}
      {(section === "assets" && (view === "missing" || view === "rights"))
        || (section === "export" && view === "preflight") ? (
          <Suspense fallback={<ProjectGraphPanelFallback locale={locale} />}>
            <StudioCompatibilityReportsPanel projectId={projectId} locale={locale} />
          </Suspense>
        ) : null}
      {section === "export" ? (
        <StudioExportPanel projectId={projectId} locale={locale} />
      ) : null}
      {showDelivery ? (
        <StudioProjectDeliveryPanel
          projectId={projectId}
          section={section}
          view={view}
          locale={locale}
        />
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
          <StudioWebtoonOnboardingPanel projectId={decodedProjectId} locale={locale} />
          <Suspense fallback={<ProjectGraphPanelFallback locale={locale} />}>
            <StudioProjectGraphContextBar projectId={decodedProjectId} locale={locale} />
          </Suspense>

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
