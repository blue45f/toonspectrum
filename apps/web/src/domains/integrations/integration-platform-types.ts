export type IntegrationCategory =
  | "storage"
  | "work-management"
  | "communication"
  | "creation"
  | "publishing"
  | "trust"
  | "data"
  | "commerce"
  | "developer";

export type IntegrationProviderStatusKind =
  | "ready"
  | "configuration-required"
  | "manual"
  | "approval-required";

export interface IntegrationProviderStatus {
  readonly id: string;
  readonly name: string;
  readonly category: IntegrationCategory;
  readonly summary: string;
  readonly capabilities: readonly string[];
  readonly connectionMode: string;
  readonly activation: string;
  readonly existingPath?: string;
  readonly configured: boolean;
  readonly executable: boolean;
  readonly status: IntegrationProviderStatusKind;
  readonly statusReason: string;
}

export interface IntegrationCatalogResponse {
  readonly generatedAt: string;
  readonly providers: readonly IntegrationProviderStatus[];
  readonly categories: readonly IntegrationCategory[];
}

export interface IntegrationRecipeTemplate {
  readonly id: string;
  readonly name: string;
  readonly trigger: string;
  readonly actions: readonly string[];
}

export interface IntegrationRecipesResponse {
  readonly events: readonly string[];
  readonly actions: readonly string[];
  readonly templates: readonly IntegrationRecipeTemplate[];
}

export interface IntegrationRecipeDraft {
  readonly id: string;
  readonly name: string;
  readonly trigger: string;
  readonly enabled: boolean;
  readonly actions: readonly {
    readonly type: string;
    readonly providerId: string;
  }[];
}

export interface IntegrationRecipeValidation {
  readonly valid: boolean;
  readonly executable: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly recipeDigest: string;
  readonly plan: readonly Record<string, unknown>[];
}

export interface IntegrationRuntimeResponse {
  readonly generatedAt: string;
  readonly totalProviders: number;
  readonly ready: number;
  readonly manual: number;
  readonly configurationRequired: number;
  readonly approvalRequired: number;
  readonly providers: readonly Pick<
    IntegrationProviderStatus,
    "id" | "name" | "category" | "status" | "executable" | "statusReason"
  >[];
}

export interface PublishPackageRequest {
  readonly projectId: string;
  readonly title: string;
  readonly description: string;
  readonly canonicalUrl: string;
  readonly scheduledAt?: string;
  readonly channels: readonly string[];
  readonly tags: readonly string[];
  readonly contentWarning?: string;
}

export interface PublishPackageResponse extends Omit<PublishPackageRequest, "channels"> {
  readonly schema: string;
  readonly createdAt: string;
  readonly packageDigest: string;
  readonly ready: boolean;
  readonly directlyExecutable: boolean;
  readonly channels: readonly {
    readonly id: string;
    readonly name?: string;
    readonly valid: boolean;
    readonly executable: boolean;
    readonly mode: string;
    readonly status?: string;
    readonly reason: string;
  }[];
  readonly notices: readonly string[];
}

export interface DeveloperManifestResponse {
  readonly schema: string;
  readonly events: readonly string[];
  readonly actions: readonly string[];
  readonly scopes: readonly string[];
  readonly webhook: Record<string, unknown>;
  readonly safety: Record<string, boolean>;
  readonly providers: number;
}
