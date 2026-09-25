import type { IntegrationRuntimeActionDto } from "./integration-runtime.dto";

export const INTEGRATION_RUNTIME_PROVIDER_IDS = [
  "notion",
  "linear",
  "jira",
  "trello",
  "slack",
  "microsoft-teams",
  "figma",
  "zoom",
  "naver-datalab",
  "wikidata",
  "google-books",
] as const;

export type IntegrationRuntimeProviderId = (typeof INTEGRATION_RUNTIME_PROVIDER_IDS)[number];
export type IntegrationRuntimeReceiptState = "pending" | "succeeded" | "failed" | "uncertain";

export interface IntegrationRuntimeConnectorStatus {
  readonly providerId: IntegrationRuntimeProviderId;
  readonly name: string;
  readonly action: IntegrationRuntimeActionDto["action"];
  readonly category: "work-management" | "communication" | "creation" | "data";
  readonly configured: boolean;
  readonly missingConfigurationCount: number;
  readonly writesExternalState: boolean;
  readonly executionMode: "operator-token" | "operator-webhook" | "public-protocol";
  readonly summary: string;
  readonly exampleInput: Record<string, unknown>;
}

export interface IntegrationRuntimeProviderResult {
  readonly externalId: string | null;
  readonly response: Record<string, unknown>;
  /** Optional redacted form for durable replay when the live response contains expiring URLs. */
  readonly receiptResponse?: Record<string, unknown>;
}

export interface IntegrationRuntimeReceiptSummary {
  readonly projectId: string;
  readonly mutationId: string;
  readonly provider: string;
  readonly operation: string;
  readonly state: IntegrationRuntimeReceiptState;
  readonly externalId: string | null;
  readonly errorCode: string | null;
  readonly response: Record<string, unknown> | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
