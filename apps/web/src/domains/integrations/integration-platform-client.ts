import { api } from "@/infrastructure/api";

import type {
  DeveloperManifestResponse,
  IntegrationCatalogResponse,
  IntegrationRecipeDraft,
  IntegrationRecipesResponse,
  IntegrationRecipeValidation,
  IntegrationRuntimeResponse,
  IntegrationRuntimeConnectorsResponse,
  IntegrationRuntimeExecuteRequest,
  IntegrationRuntimeExecutionResponse,
  IntegrationRuntimeReceiptsResponse,
  PublishPackageRequest,
  PublishPackageResponse,
} from "./integration-platform-types";

export const integrationPlatformClient = {
  catalog: () => api.get<IntegrationCatalogResponse>("/integrations/catalog"),
  recipes: () => api.get<IntegrationRecipesResponse>("/integrations/recipes"),
  runtime: () => api.get<IntegrationRuntimeResponse>("/integrations/runtime"),
  runtimeConnectors: () =>
    api.get<IntegrationRuntimeConnectorsResponse>("/integrations/runtime-connectors"),
  runtimeReceipts: (projectId: string, limit = 30) =>
    api.get<IntegrationRuntimeReceiptsResponse>("/integrations/runtime-connectors/receipts", {
      params: { projectId, limit },
    }),
  executeRuntime: (request: IntegrationRuntimeExecuteRequest) =>
    api.post<IntegrationRuntimeExecutionResponse>(
      "/integrations/runtime-connectors/execute",
      request,
    ),
  developerManifest: () =>
    api.get<DeveloperManifestResponse>("/integrations/developer-manifest"),
  validateRecipe: (recipe: IntegrationRecipeDraft) =>
    api.post<IntegrationRecipeValidation>("/integrations/automation/validate", {
      name: recipe.name,
      trigger: recipe.trigger,
      actions: recipe.actions,
    }),
  buildPublishPackage: (request: PublishPackageRequest) =>
    api.post<PublishPackageResponse>("/integrations/publish/package", request),
  buildFeedPreview: (request: {
    title: string;
    homePageUrl: string;
    feedUrl: string;
    description: string;
    items: readonly {
      id: string;
      url: string;
      title: string;
      summary: string;
      datePublished: string;
    }[];
  }) => api.post<{
    rss: string;
    jsonFeed: Record<string, unknown>;
    activityPub: readonly Record<string, unknown>[];
    digest: string;
  }>("/integrations/feeds/preview", request),
};
