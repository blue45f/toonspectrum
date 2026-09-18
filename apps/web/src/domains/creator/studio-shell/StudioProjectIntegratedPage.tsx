import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

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
import { StudioWebtoonProductionCompanion } from "./StudioWebtoonProductionCompanion";
import {
  StudioProjectShellPage,
  type StudioProjectSection,
} from "./StudioProjectShellPage";

type Locale = string;

const WEBTOON_ONBOARDING_PROFILE_PREFIX = "toonstudio:webtoon-onboarding:v1:";
const LazyStudioWebtoonOnboardingPanel = lazy(async () => {
  const module = await import("./StudioWebtoonOnboardingPanel");
  return { default: module.StudioWebtoonOnboardingPanel };
});

function hasStoredWebtoonOnboarding(projectId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(`${WEBTOON_ONBOARDING_PROFILE_PREFIX}${projectId}`) !== null;
  } catch {
    return false;
  }
}

function StudioWebtoonOnboardingPanelSlot({
  projectId,
  locale,
}: {
  readonly projectId: string;
  readonly locale: string;
}) {
  const l = useBilingualLocalizer("studioProjectIntegrated.onboarding");
  const [enabled, setEnabled] = useState(() => hasStoredWebtoonOnboarding(projectId));

  useEffect(() => {
    setEnabled(hasStoredWebtoonOnboarding(projectId));
  }, [projectId]);

  if (!enabled) return null;

  return (
    <Suspense
      fallback={(
        <div
          className="min-h-28 animate-pulse rounded-3xl border border-accent/20 bg-accent-soft/15"
          aria-busy="true"
          aria-label={bt("제작 온보딩 불러오는 중", "Loading production onboarding")}
        />
      )}
    >
      <LazyStudioWebtoonOnboardingPanel projectId={projectId} locale={locale} />
    </Suspense>
  );
}

const StudioCreatorIntelligencePanel = lazy(async () => {
  const module = await import("../creator-intelligence/StudioCreatorIntelligencePanel");
  return { default: module.StudioCreatorIntelligencePanel };
});

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

function ProjectGraphPanelFallback({ locale }: { readonly locale: string }) {
  const l = useBilingualLocalizer("studioProjectIntegrated.graphFallback");
  return (
    <div
      className="min-h-20 animate-pulse rounded-2xl border border-line bg-card/80"
      role="status"
      aria-label={bt("작품 버전 정보를 불러오는 중", "Loading project version data")}
    />
  );
}

function localeFromLanguage(language: string) {
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
  readonly locale: string;
}) {
  useBilingualI18nRevision();
  const showDelivery = section === "export" || (section === "settings" && view === "archive");

  return (
    <>
      <StudioProjectFeatureSuitePanel
        projectId={projectId}
        section={section}
        view={view}
        locale={locale}
      />
      {section === "overview" && view === "intelligence" ? (
        <Suspense fallback={<ProjectGraphPanelFallback locale={locale} />}>
          <StudioCreatorIntelligencePanel projectId={projectId} locale={locale} />
        </Suspense>
      ) : null}
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
  const bt = useBilingual("StudioProjectIntegratedPage");
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
          <StudioWebtoonOnboardingPanelSlot projectId={decodedProjectId} locale={locale} />
          <Suspense fallback={<ProjectGraphPanelFallback locale={locale} />}>
            <StudioProjectGraphContextBar projectId={decodedProjectId} locale={locale} />
          </Suspense>

          <StudioWebtoonProductionCompanion
            projectId={decodedProjectId}
            section={section}
            view={view}
            locale={locale}
          />
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
