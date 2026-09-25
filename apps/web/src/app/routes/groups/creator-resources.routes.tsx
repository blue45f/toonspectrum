import { Navigate } from "react-router-dom";

import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const CatalogResearchPage = lazyRetry(
  () => import("@/domains/creator-resources/CatalogResearchPage").then((module) => ({ default: module.CatalogResearchPage })),
  "CatalogResearchPage",
);

const CreatorHubPage = lazyRetry(
  () => import("@/domains/creator-resources/CreatorHubPage").then((module) => ({ default: module.CreatorHubPage })),
  "CreatorHubPage",
);
const NowPage = lazyRetry(
  () => import("@/domains/creator-resources/NowPage").then((module) => ({ default: module.NowPage })),
  "NowPage",
);
const OpportunitiesPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpportunitiesPage })),
  "OpportunitiesPage",
);
const ReferenceAssetsPage = lazyRetry(
  () => import("@/domains/creator-resources/ReferenceAssetsPage").then((module) => ({ default: module.ReferenceAssetsPage })),
  "ReferenceAssetsPage",
);
const WorksPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.WorksPage })),
  "WorksPage",
);
const PolyHavenPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.PolyHavenPage })),
  "PolyHavenPage",
);
const AmbientCgPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.AmbientCgPage })),
  "AmbientCgPage",
);
const NasaImagesPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.NasaImagesPage })),
  "NasaImagesPage",
);
const VamCollectionsPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.VamCollectionsPage })),
  "VamCollectionsPage",
);
const RijksmuseumPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.RijksmuseumPage })),
  "RijksmuseumPage",
);
const GoogleFontsPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.GoogleFontsPage })),
  "GoogleFontsPage",
);
const GbifPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.GbifPage })),
  "GbifPage",
);
const MusicBrainzPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.MusicBrainzPage })),
  "MusicBrainzPage",
);
const InternetArchivePage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.InternetArchivePage })),
  "InternetArchivePage",
);
const MetWeatherPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.MetWeatherPage })),
  "MetWeatherPage",
);
const KoreanHeritagePage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.KoreanHeritagePage })),
  "KoreanHeritagePage",
);
const NeisSchoolPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.NeisSchoolPage })),
  "NeisSchoolPage",
);
const TourApiPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.TourApiPage })),
  "TourApiPage",
);
const KoreanDictionaryPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.KoreanDictionaryPage })),
  "KoreanDictionaryPage",
);
const SmithsonianPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.SmithsonianPage })),
  "SmithsonianPage",
);
const WikimediaInterestPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.WikimediaInterestPage })),
  "WikimediaInterestPage",
);
const EuropeanaPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.EuropeanaPage })),
  "EuropeanaPage",
);
const DplaPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.DplaPage })),
  "DplaPage",
);
const OpenDataLabPage = lazyRetry(
  () => import("@/domains/creator-resources/OpenDataLabPage").then((module) => ({ default: module.OpenDataLabPage })),
  "OpenDataLabPage",
);
const GlobalBooksPage = lazyRetry(
  () => import("@/domains/creator-resources/GlobalBooksPage").then((module) => ({ default: module.GlobalBooksPage })),
  "GlobalBooksPage",
);
const RecipesPage = lazyRetry(
  () => import("@/domains/creator-resources/RecipesPage").then((module) => ({ default: module.RecipesPage })),
  "RecipesPage",
);
const StoryLabPage = lazyRetry(
  () => import("@/domains/creator-resources/StoryLabPage").then((module) => ({ default: module.StoryLabPage })),
  "StoryLabPage",
);
const OpenCreationPage = lazyRetry(
  () => import("@/domains/creator-resources/OpenCreationPage").then((module) => ({ default: module.OpenCreationPage })),
  "OpenCreationPage",
);
const SourcesPage = lazyRetry(
  () => import("@/domains/creator-resources/SourcesPage").then((module) => ({ default: module.SourcesPage })),
  "SourcesPage",
);

const ContentPacksPage = lazyRetry(
  () => import("@/domains/creator-resources/ContentPacksPage").then((module) => ({ default: module.ContentPacksPage })),
  "ContentPacksPage",
);
const EducationHubPage = lazyRetry(
  () => import("@/domains/creator-ecosystem/EducationHubPage").then((module) => ({ default: module.EducationHubPage })),
  "EducationHubPage",
);
const CollaborationHubPage = lazyRetry(
  () => import("@/domains/creator-ecosystem/CollaborationHubPage").then((module) => ({ default: module.CollaborationHubPage })),
  "CollaborationHubPage",
);
const FandomCosplayPage = lazyRetry(
  () => import("@/domains/creator-ecosystem/FandomCosplayPage").then((module) => ({ default: module.FandomCosplayPage })),
  "FandomCosplayPage",
);
const ComicLibraryPage = lazyRetry(
  () => import("@/domains/creator-ecosystem/ComicLibraryPage").then((module) => ({ default: module.ComicLibraryPage })),
  "ComicLibraryPage",
);

export const creatorResourcesRoutes = defineAppRoutes([
  // Legacy creator hubs now resolve to the canonical ToonStudio front door.
  { id: "resources-make", path: "/make", element: <Navigate to="/studio/new" replace /> },
  { id: "resources-hub", path: "/creator-hub", element: <Navigate to="/studio" replace /> },
  { id: "resources-publishing", path: "/publishing", element: <Navigate to="/studio/publish" replace /> },

  // Research remains a public reference destination; project-bound references move into Story.
  { id: "resources-now", path: "/now", element: <NowPage /> },
  { id: "research-catalog", path: "/research/catalog", element: <CatalogResearchPage /> },
  { id: "research-catalog-notebook", path: "/research/catalog/notebook", element: <CatalogResearchPage /> },
  { id: "research-home", path: "/research", element: <CreatorHubPage /> },
  { id: "research-assets", path: "/research/assets", element: <ReferenceAssetsPage /> },
  { id: "research-open-creation", path: "/research/open-creation", element: <OpenCreationPage /> },
  { id: "research-content-packs", path: "/research/packs", element: <ContentPacksPage /> },
  { id: "research-books", path: "/research/books", element: <GlobalBooksPage /> },
  { id: "research-polyhaven", path: "/research/3d-assets", element: <PolyHavenPage /> },
  { id: "research-ambientcg", path: "/research/material-assets", element: <AmbientCgPage /> },
  { id: "research-nasa-images", path: "/research/space-assets", element: <NasaImagesPage /> },
  { id: "research-vam", path: "/research/vam", element: <VamCollectionsPage /> },
  { id: "research-rijksmuseum", path: "/research/rijksmuseum", element: <RijksmuseumPage /> },
  { id: "research-google-fonts", path: "/research/fonts", element: <GoogleFontsPage /> },
  { id: "research-gbif", path: "/research/creatures", element: <GbifPage /> },
  { id: "research-musicbrainz", path: "/research/music-metadata", element: <MusicBrainzPage /> },
  { id: "research-internet-archive", path: "/research/archive", element: <InternetArchivePage /> },
  { id: "research-met-weather", path: "/research/weather-light", element: <MetWeatherPage /> },
  { id: "research-open-data", path: "/research/open-data", element: <OpenDataLabPage /> },
  { id: "research-open-data-heritage", path: "/research/open-data/kheritage", element: <KoreanHeritagePage /> },
  { id: "research-open-data-schools", path: "/research/open-data/neis", element: <NeisSchoolPage /> },
  { id: "research-open-data-tour", path: "/research/open-data/tourapi", element: <TourApiPage /> },
  { id: "research-open-data-korean", path: "/research/open-data/korean", element: <KoreanDictionaryPage /> },
  { id: "research-open-data-smithsonian", path: "/research/open-data/smithsonian", element: <SmithsonianPage /> },
  { id: "research-open-data-wikimedia", path: "/research/open-data/wikimedia", element: <WikimediaInterestPage /> },
  { id: "research-open-data-europeana", path: "/research/open-data/europeana", element: <EuropeanaPage /> },
  { id: "research-open-data-dpla", path: "/research/open-data/dpla", element: <DplaPage /> },
  { id: "research-open-data-ambientcg", path: "/research/open-data/ambientcg", element: <AmbientCgPage /> },
  { id: "research-open-data-vam", path: "/research/open-data/vam", element: <VamCollectionsPage /> },
  { id: "research-open-data-nasa", path: "/research/open-data/nasa", element: <NasaImagesPage /> },
  { id: "research-open-data-gbif", path: "/research/open-data/gbif", element: <GbifPage /> },
  { id: "research-open-data-musicbrainz", path: "/research/open-data/musicbrainz", element: <MusicBrainzPage /> },
  { id: "research-open-data-internet-archive", path: "/research/open-data/internetarchive", element: <InternetArchivePage /> },
  { id: "resources-references", path: "/creator-hub/references", element: <Navigate to="/research/assets" replace /> },
  { id: "resources-opportunities", path: "/opportunities", element: <OpportunitiesPage /> },
  { id: "resources-recipes", path: "/learn/recipes", element: <RecipesPage /> },
  { id: "resources-story", path: "/story-lab", element: <StoryLabPage /> },
  { id: "resources-works", path: "/discover/works", element: <WorksPage /> },
  { id: "resources-sources", path: "/insights/resources", element: <SourcesPage /> },

  // Creator ecosystem: one coherent entry point instead of adding more top-level navigation.
  { id: "ecosystem-home", path: "/ecosystem", element: <Navigate to="/ecosystem/education" replace /> },
  { id: "ecosystem-education-legacy", path: "/learn/education", element: <Navigate to="/ecosystem/education" replace /> },
  { id: "ecosystem-education", path: "/ecosystem/education", element: <EducationHubPage /> },
  { id: "ecosystem-collaboration", path: "/ecosystem/collaboration", element: <CollaborationHubPage /> },
  { id: "ecosystem-fandom", path: "/ecosystem/fandom", element: <FandomCosplayPage /> },
  { id: "ecosystem-library", path: "/ecosystem/library", element: <ComicLibraryPage /> },

  // Historical aliases keep old links functional without competing for canonical ownership.
  { id: "resources-showcase", path: "/challenges", element: <Navigate to="/showcase/challenges" replace /> },
]);
