import { lazyRetry } from "@/shared/lib/lazy-retry";

export const CatalogResearchPage = lazyRetry(
  () => import("@/domains/creator-resources/CatalogResearchPage").then((module) => ({ default: module.CatalogResearchPage })),
  "CatalogResearchPage",
);

export const CreatorHubPage = lazyRetry(
  () => import("@/domains/creator-resources/CreatorHubPage").then((module) => ({ default: module.CreatorHubPage })),
  "CreatorHubPage",
);
export const NowPage = lazyRetry(
  () => import("@/domains/creator-resources/NowPage").then((module) => ({ default: module.NowPage })),
  "NowPage",
);
export const OpportunitiesPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpportunitiesPage })),
  "OpportunitiesPage",
);
export const ReferenceAssetsPage = lazyRetry(
  () => import("@/domains/creator-resources/ReferenceAssetsPage").then((module) => ({ default: module.ReferenceAssetsPage })),
  "ReferenceAssetsPage",
);
export const WorksPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.WorksPage })),
  "WorksPage",
);
export const PolyHavenPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.PolyHavenPage })),
  "PolyHavenPage",
);
export const AmbientCgPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.AmbientCgPage })),
  "AmbientCgPage",
);
export const NasaImagesPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.NasaImagesPage })),
  "NasaImagesPage",
);
export const VamCollectionsPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.VamCollectionsPage })),
  "VamCollectionsPage",
);
export const RijksmuseumPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.RijksmuseumPage })),
  "RijksmuseumPage",
);
export const GoogleFontsPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.GoogleFontsPage })),
  "GoogleFontsPage",
);
export const GbifPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.GbifPage })),
  "GbifPage",
);
export const MusicBrainzPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.MusicBrainzPage })),
  "MusicBrainzPage",
);
export const InternetArchivePage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.InternetArchivePage })),
  "InternetArchivePage",
);
export const MetWeatherPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.MetWeatherPage })),
  "MetWeatherPage",
);
export const KoreanHeritagePage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.KoreanHeritagePage })),
  "KoreanHeritagePage",
);
export const NeisSchoolPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.NeisSchoolPage })),
  "NeisSchoolPage",
);
export const TourApiPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.TourApiPage })),
  "TourApiPage",
);
export const KoreanDictionaryPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.KoreanDictionaryPage })),
  "KoreanDictionaryPage",
);
export const SmithsonianPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.SmithsonianPage })),
  "SmithsonianPage",
);
export const WikimediaInterestPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.WikimediaInterestPage })),
  "WikimediaInterestPage",
);
export const EuropeanaPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.EuropeanaPage })),
  "EuropeanaPage",
);
export const DplaPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.DplaPage })),
  "DplaPage",
);
export const OpenDataLabPage = lazyRetry(
  () => import("@/domains/creator-resources/OpenDataLabPage").then((module) => ({ default: module.OpenDataLabPage })),
  "OpenDataLabPage",
);
export const GlobalBooksPage = lazyRetry(
  () => import("@/domains/creator-resources/GlobalBooksPage").then((module) => ({ default: module.GlobalBooksPage })),
  "GlobalBooksPage",
);
export const RecipesPage = lazyRetry(
  () => import("@/domains/creator-resources/RecipesPage").then((module) => ({ default: module.RecipesPage })),
  "RecipesPage",
);
export const StoryLabPage = lazyRetry(
  () => import("@/domains/creator-resources/StoryLabPage").then((module) => ({ default: module.StoryLabPage })),
  "StoryLabPage",
);
export const OpenCreationPage = lazyRetry(
  () => import("@/domains/creator-resources/OpenCreationPage").then((module) => ({ default: module.OpenCreationPage })),
  "OpenCreationPage",
);
export const SourcesPage = lazyRetry(
  () => import("@/domains/creator-resources/SourcesPage").then((module) => ({ default: module.SourcesPage })),
  "SourcesPage",
);

export const ContentPacksPage = lazyRetry(
  () => import("@/domains/creator-resources/ContentPacksPage").then((module) => ({ default: module.ContentPacksPage })),
  "ContentPacksPage",
);
export const EducationHubPage = lazyRetry(
  () => import("@/domains/creator-ecosystem/EducationHubPage").then((module) => ({ default: module.EducationHubPage })),
  "EducationHubPage",
);
export const CollaborationHubPage = lazyRetry(
  () => import("@/domains/creator-ecosystem/CollaborationHubPage").then((module) => ({ default: module.CollaborationHubPage })),
  "CollaborationHubPage",
);
export const FandomCosplayPage = lazyRetry(
  () => import("@/domains/creator-ecosystem/FandomCosplayPage").then((module) => ({ default: module.FandomCosplayPage })),
  "FandomCosplayPage",
);
export const ComicLibraryPage = lazyRetry(
  () => import("@/domains/creator-ecosystem/ComicLibraryPage").then((module) => ({ default: module.ComicLibraryPage })),
  "ComicLibraryPage",
);
