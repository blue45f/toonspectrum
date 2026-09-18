import { Navigate } from "react-router-dom";

import { StudioHomeEntryRoute } from "@/domains/creator/studio-router/StudioHomeEntryRoute";

import { studioRoutePath } from "@/domains/creator/studio-route-registry";

import { defineAppRoutes } from "../app-route-definition";
import {
  CharacterShaperLandingPage,
  CreatorEnvironmentGuidePage,
  CreatorEcosystemPage,
  CreatorGrowthIpPage,
  CreatorEcosystemViewerPage,
  CreatorInferencePage,
  CreateChallengesPage,
  CreateGalleryPage,
  CreateSeriesPage,
  CreateWorkPage,
  LearnPage,
  PersonalInferencePage,
  StudioAiSettingsPage,
  StudioAssetHubPage,
  StudioBrushLabPage,
  StudioCharacterConversionPage,
  StudioCreatorSupportPage,
  StudioDocumentWorkspaceRoute,
  StudioHomePage,
  StudioImportPage,
  StudioImmersiveHubPage,
  StudioManualPage,
  StudioMusicPage,
  StudioNewPage,
  StudioProjectShellPage,
  StudioVirtualSpacePage,
  StudioProductionToolchainPage,
  StudioEngineCenterPage,
  StudioProductionJobsPage,
  StudioPromoPage,
  StudioGenerativePage,
  StudioSpatialReaderPage,
  StudioTemplatesPage,
  StudioRouter,
} from "./creator-route-pages";

export const creatorRoutes = defineAppRoutes([
  { id: "creator-ai-settings", path: studioRoutePath("ai-settings"), element: <StudioAiSettingsPage /> },
  { id: "creator-ai-inference", path: studioRoutePath("ai-lab"), element: <PersonalInferencePage /> },
  { id: "creator-ai-runtime", path: studioRoutePath("ai-runtime"), element: <CreatorInferencePage /> },
  { id: "creator-character-convert", path: studioRoutePath("character-convert"), element: <StudioCharacterConversionPage /> },
  { id: "creator-ecosystem", path: studioRoutePath("ecosystem"), element: <CreatorEcosystemPage /> },
  { id: "creator-growth-ip", path: studioRoutePath("growth-ip"), element: <CreatorGrowthIpPage /> },
  { id: "creator-environment-guide", path: studioRoutePath("environment-guide"), element: <CreatorEnvironmentGuidePage /> },
  { id: "creator-ecosystem-viewer", path: studioRoutePath("ecosystem-viewer"), element: <CreatorEcosystemViewerPage /> },
  // Canonical ToonStudio front door. Exact routes intentionally precede the editor wildcard.
  { id: "creator-studio-home", path: studioRoutePath("home"), element: <StudioHomeEntryRoute home={<StudioHomePage />} legacy={<StudioRouter />} /> },
  { id: "creator-studio-support", path: studioRoutePath("support"), element: <StudioCreatorSupportPage /> },
  { id: "creator-studio-generative", path: studioRoutePath("generate"), element: <StudioGenerativePage /> },
  { id: "creator-studio-toolchain", path: studioRoutePath("toolchain"), element: <StudioProductionToolchainPage /> },
  { id: "creator-studio-engines", path: studioRoutePath("engines"), element: <StudioEngineCenterPage /> },
  { id: "creator-studio-jobs", path: studioRoutePath("jobs"), element: <StudioProductionJobsPage /> },
  { id: "creator-studio-immersive", path: studioRoutePath("immersive"), element: <StudioImmersiveHubPage /> },
  { id: "creator-spatial-reader", path: "/read/spatial", element: <StudioSpatialReaderPage /> },
  { id: "creator-studio-new", path: studioRoutePath("new"), element: <StudioNewPage /> },
  { id: "creator-studio-import", path: studioRoutePath("import"), element: <StudioImportPage /> },
  { id: "creator-studio-recovery", path: studioRoutePath("recovery"), element: <Navigate to="/studio?view=archived" replace /> },
  { id: "creator-studio-trash", path: studioRoutePath("trash"), element: <Navigate to="/studio?view=trash" replace /> },
  { id: "creator-studio-assets", path: studioRoutePath("assets"), element: <StudioAssetHubPage /> },
  { id: "creator-studio-assets-brushes", path: studioRoutePath("asset-brushes"), element: <Navigate to="/studio/brushes" replace /> },
  { id: "creator-studio-assets-brush-new", path: studioRoutePath("asset-brush-new"), element: <StudioBrushLabPage /> },
  { id: "creator-studio-assets-brush-edit", path: studioRoutePath("asset-brush-edit"), element: <StudioBrushLabPage /> },
  { id: "creator-studio-assets-character-new", path: studioRoutePath("asset-character-new"), element: <CharacterShaperLandingPage /> },
  { id: "creator-studio-assets-audio", path: studioRoutePath("asset-audio"), element: <StudioMusicPage /> },
  { id: "creator-studio-assets-3d", path: studioRoutePath("asset-3d"), element: <Navigate to="/studio/bg3d" replace /> },
  { id: "creator-studio-templates", path: studioRoutePath("templates"), element: <StudioTemplatesPage /> },

  // Canonical document identities bridge losslessly into the established editor authority.
  { id: "creator-studio-project-document", path: studioRoutePath("project-document"), element: <StudioDocumentWorkspaceRoute /> },
  { id: "creator-studio-draft-document", path: studioRoutePath("draft-document"), element: <StudioDocumentWorkspaceRoute /> },

  // Canonical six-stage project shell. The route registry keeps every section under one owner.
  { id: "creator-studio-project-root", path: studioRoutePath("project-root"), element: <Navigate to="overview" replace /> },
  { id: "creator-studio-project-overview", path: studioRoutePath("project-overview"), element: <StudioProjectShellPage section="overview" /> },
  { id: "creator-studio-project-story", path: studioRoutePath("project-story"), element: <StudioProjectShellPage section="story" /> },
  { id: "creator-studio-project-production", path: studioRoutePath("project-production"), element: <StudioProjectShellPage section="production" /> },
  { id: "creator-studio-project-assets", path: studioRoutePath("project-assets"), element: <StudioProjectShellPage section="assets" /> },
  { id: "creator-studio-project-review", path: studioRoutePath("project-review"), element: <StudioProjectShellPage section="review" /> },
  { id: "creator-studio-project-export", path: studioRoutePath("project-export"), element: <StudioProjectShellPage section="export" /> },
  { id: "creator-studio-project-settings", path: studioRoutePath("project-settings"), element: <StudioProjectShellPage section="settings" /> },
  { id: "creator-studio-project-space", path: studioRoutePath("project-space"), element: <StudioVirtualSpacePage /> },

  // Canonical showcase routes retain the existing gallery implementation.
  { id: "creator-showcase", path: "/showcase", element: <CreateGalleryPage /> },
  { id: "creator-showcase-challenges", path: "/showcase/challenges", element: <CreateChallengesPage /> },
  { id: "creator-showcase-promo", path: "/showcase/promo", element: <StudioPromoPage /> },
  { id: "creator-showcase-series", path: "/showcase/series/:id", element: <CreateSeriesPage /> },
  { id: "creator-showcase-work", path: "/showcase/work/:id", element: <CreateWorkPage /> },

  // Legacy public tool routes now enter the unified Studio asset structure.
  { id: "creator-music", path: "/music", element: <Navigate to={studioRoutePath("asset-audio")} replace /> },
  { id: "creator-character-shaper", path: "/shaper", element: <Navigate to={studioRoutePath("asset-character-new")} replace /> },
  { id: "creator-brush-lab", path: "/brush-lab", element: <Navigate to={studioRoutePath("asset-brush-new")} replace /> },
  { id: "creator-studio-brush-lab", path: "/studio/brush-lab", element: <Navigate to={studioRoutePath("asset-brush-new")} replace /> },

  // Existing public gallery URLs remain compatible while links migrate to /showcase.
  { id: "creator-gallery", path: "/create", element: <CreateGalleryPage /> },
  { id: "creator-challenges", path: "/create/challenges", element: <CreateChallengesPage /> },
  { id: "creator-promo", path: "/create/promo", element: <StudioPromoPage /> },
  { id: "creator-series", path: "/create/series/:id", element: <CreateSeriesPage /> },
  { id: "creator-work", path: "/create/:id", element: <CreateWorkPage /> },

  // Work/remix brush-lab URLs keep their scoped editor state until document-id migration lands.
  { id: "creator-studio-work-brush-lab", path: "/studio/work/:workId/brush-lab", element: <StudioBrushLabPage /> },
  { id: "creator-studio-remix-brush-lab", path: "/studio/remix/:sourceWorkId/brush-lab", element: <StudioBrushLabPage /> },

  { id: "creator-learning", path: "/learn/*", element: <LearnPage /> },
  { id: "creator-studio-manual", path: studioRoutePath("manual"), element: <StudioManualPage /> },
  { id: "creator-studio-manual-article", path: studioRoutePath("manual-article"), element: <StudioManualPage /> },

  // /studio/canvas and all scoped editor/production routes continue through the established router.
  { id: "creator-studio", path: "/studio/*", element: <StudioRouter /> },
]);
