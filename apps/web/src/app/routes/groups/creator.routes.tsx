import { Navigate } from "react-router-dom";

import { defineAppRoutes } from "../app-route-definition";
import {
  CharacterShaperLandingPage,
  CreateChallengesPage,
  CreateGalleryPage,
  CreateSeriesPage,
  CreateWorkPage,
  LearnPage,
  StudioAssetsPage,
  StudioBrushLabPage,
  StudioDocumentWorkspaceRoute,
  StudioHomePage,
  StudioImportPage,
  StudioManualPage,
  StudioMusicPage,
  StudioNewPage,
  StudioProjectShellPage,
  StudioPromoPage,
  StudioRouter,
} from "./creator-route-pages";

export const creatorRoutes = defineAppRoutes([
  // Canonical ToonStudio front door. Exact routes intentionally precede the editor wildcard.
  { id: "creator-studio-home", path: "/studio", element: <StudioHomePage /> },
  { id: "creator-studio-new", path: "/studio/new", element: <StudioNewPage /> },
  { id: "creator-studio-import", path: "/studio/import", element: <StudioImportPage /> },
  { id: "creator-studio-assets", path: "/studio/assets", element: <StudioAssetsPage /> },
  { id: "creator-studio-assets-brushes", path: "/studio/assets/brushes", element: <Navigate to="/studio/brushes" replace /> },
  { id: "creator-studio-assets-brush-new", path: "/studio/assets/brushes/new", element: <StudioBrushLabPage /> },
  { id: "creator-studio-assets-brush-edit", path: "/studio/assets/brushes/:brushId/edit", element: <StudioBrushLabPage /> },
  { id: "creator-studio-assets-character-new", path: "/studio/assets/characters/new", element: <CharacterShaperLandingPage /> },
  { id: "creator-studio-assets-audio", path: "/studio/assets/audio", element: <StudioMusicPage /> },
  { id: "creator-studio-assets-3d", path: "/studio/assets/3d", element: <Navigate to="/studio/bg3d" replace /> },
  { id: "creator-studio-templates", path: "/studio/templates", element: <Navigate to="/market?view=templates" replace /> },

  // Canonical document identities bridge losslessly into the established editor authority.
  { id: "creator-studio-project-document", path: "/studio/p/:projectId/d/:documentId", element: <StudioDocumentWorkspaceRoute /> },
  { id: "creator-studio-draft-document", path: "/studio/draft/:draftId", element: <StudioDocumentWorkspaceRoute /> },

  // Canonical six-stage project shell. It reuses existing production/editor capabilities while
  // route and data ownership migrate behind one coherent project navigation model.
  { id: "creator-studio-project-root", path: "/studio/p/:projectId", element: <Navigate to="overview" replace /> },
  { id: "creator-studio-project-overview", path: "/studio/p/:projectId/overview", element: <StudioProjectShellPage section="overview" /> },
  { id: "creator-studio-project-story", path: "/studio/p/:projectId/story", element: <StudioProjectShellPage section="story" /> },
  { id: "creator-studio-project-production", path: "/studio/p/:projectId/production", element: <StudioProjectShellPage section="production" /> },
  { id: "creator-studio-project-assets", path: "/studio/p/:projectId/assets", element: <StudioProjectShellPage section="assets" /> },
  { id: "creator-studio-project-review", path: "/studio/p/:projectId/review", element: <StudioProjectShellPage section="review" /> },
  { id: "creator-studio-project-export", path: "/studio/p/:projectId/export", element: <StudioProjectShellPage section="export" /> },
  { id: "creator-studio-project-settings", path: "/studio/p/:projectId/settings", element: <StudioProjectShellPage section="settings" /> },

  // Canonical showcase routes retain the existing gallery implementation.
  { id: "creator-showcase", path: "/showcase", element: <CreateGalleryPage /> },
  { id: "creator-showcase-challenges", path: "/showcase/challenges", element: <CreateChallengesPage /> },
  { id: "creator-showcase-promo", path: "/showcase/promo", element: <StudioPromoPage /> },
  { id: "creator-showcase-series", path: "/showcase/series/:id", element: <CreateSeriesPage /> },
  { id: "creator-showcase-work", path: "/showcase/work/:id", element: <CreateWorkPage /> },

  // Legacy public tool routes now enter the unified Studio asset structure.
  { id: "creator-music", path: "/music", element: <Navigate to="/studio/assets/audio" replace /> },
  { id: "creator-character-shaper", path: "/shaper", element: <Navigate to="/studio/assets/characters/new" replace /> },
  { id: "creator-brush-lab", path: "/brush-lab", element: <Navigate to="/studio/assets/brushes/new" replace /> },
  { id: "creator-studio-brush-lab", path: "/studio/brush-lab", element: <Navigate to="/studio/assets/brushes/new" replace /> },

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
  { id: "creator-studio-manual", path: "/studio/manual", element: <StudioManualPage /> },
  { id: "creator-studio-manual-article", path: "/studio/manual/:articleId", element: <StudioManualPage /> },

  // /studio/canvas and all scoped editor/production routes continue through the established router.
  { id: "creator-studio", path: "/studio/*", element: <StudioRouter /> },
]);
