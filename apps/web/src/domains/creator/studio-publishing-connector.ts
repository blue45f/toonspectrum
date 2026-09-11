import type { StudioExportPreflightResult } from "./studio-export-preflight";

export const STUDIO_PUBLISH_CONNECTOR_MODES = [
  "direct-api",
  "package",
  "manual",
] as const;

export const STUDIO_PUBLISH_CAPABILITIES = [
  "publish",
  "schedule",
  "localization",
  "analytics",
  "comments",
] as const;

export type StudioPublishConnectorMode =
  (typeof STUDIO_PUBLISH_CONNECTOR_MODES)[number];
export type StudioPublishCapability =
  (typeof STUDIO_PUBLISH_CAPABILITIES)[number];
export type StudioPublishPlanStatus = "blocked" | "confirmation" | "ready";

export interface StudioPublishConnector {
  readonly id: string;
  readonly platformName: string;
  readonly mode: StudioPublishConnectorMode;
  readonly policyVersion: string;
  readonly capabilities: readonly StudioPublishCapability[];
  readonly supportedLocales: readonly string[];
  readonly credentialsRequired: boolean;
}

export interface StudioPublishRequest {
  readonly projectId: string;
  readonly documentId: string;
  readonly locales: readonly string[];
  readonly scheduledAt: string | null;
  readonly credentialsAvailable: boolean;
  readonly externalWriteConfirmed: boolean;
  readonly requestedAt: string;
}

export interface StudioPublishPlan {
  readonly connectorId: string;
  readonly mode: StudioPublishConnectorMode;
  readonly status: StudioPublishPlanStatus;
  readonly action: "publish-now" | "schedule" | "build-package" | "show-instructions";
  readonly blockingReasons: readonly string[];
  readonly warnings: readonly string[];
  readonly publishLocales: readonly string[];
  readonly unsupportedLocales: readonly string[];
}

export interface StudioPublishReceipt {
  readonly id: string;
  readonly connectorId: string;
  readonly projectId: string;
  readonly documentId: string;
  readonly mode: StudioPublishConnectorMode;
  readonly locales: readonly string[];
  readonly policyVersion: string;
  readonly createdAt: string;
  readonly externalReference: string | null;
}

function requireText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function validateStudioPublishConnector(
  connector: StudioPublishConnector,
): readonly string[] {
  const issues: string[] = [];
  if (!connector.id.trim() || !connector.platformName.trim() || !connector.policyVersion.trim()) {
    issues.push("connector-required");
  }
  if (new Set(connector.capabilities).size !== connector.capabilities.length) {
    issues.push("duplicate-capability");
  }
  if (new Set(connector.supportedLocales).size !== connector.supportedLocales.length) {
    issues.push("duplicate-locale");
  }
  if (connector.mode === "direct-api" && !connector.capabilities.includes("publish")) {
    issues.push("direct-publish-capability");
  }
  if (connector.mode !== "direct-api" && connector.credentialsRequired) {
    issues.push("credentials-mode");
  }
  return Object.freeze(issues);
}

export function planStudioPublish(
  connector: StudioPublishConnector,
  preflight: StudioExportPreflightResult,
  request: StudioPublishRequest,
): StudioPublishPlan {
  if (validateStudioPublishConnector(connector).length > 0) {
    throw new Error("A valid publishing connector is required.");
  }
  requireText(request.projectId, "Project id");
  requireText(request.documentId, "Document id");
  if (!validTimestamp(request.requestedAt)) throw new Error("Requested time is invalid.");
  if (request.scheduledAt && !validTimestamp(request.scheduledAt)) {
    throw new Error("Scheduled time is invalid.");
  }
  if (request.locales.length === 0 || new Set(request.locales).size !== request.locales.length) {
    throw new Error("Publish locales must be a non-empty unique list.");
  }

  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  if (preflight.status === "blocked") blockingReasons.push("preflight-blocked");
  if (preflight.status === "warning") warnings.push("preflight-warning");
  if (connector.credentialsRequired && !request.credentialsAvailable) {
    blockingReasons.push("credentials-required");
  }

  const supported = new Set(connector.supportedLocales.map((locale) => locale.toLowerCase()));
  const publishLocales = request.locales.filter((locale) => supported.has(locale.toLowerCase()));
  const unsupportedLocales = request.locales.filter((locale) => !supported.has(locale.toLowerCase()));
  if (unsupportedLocales.length > 0) warnings.push("unsupported-locales-excluded");
  if (publishLocales.length === 0) blockingReasons.push("no-supported-locale");

  let action: StudioPublishPlan["action"];
  if (connector.mode === "package") action = "build-package";
  else if (connector.mode === "manual") action = "show-instructions";
  else if (request.scheduledAt) action = "schedule";
  else action = "publish-now";

  if (request.scheduledAt && !connector.capabilities.includes("schedule")) {
    warnings.push("schedule-not-supported");
    action = connector.mode === "direct-api" ? "publish-now" : action;
  }
  if (
    connector.mode === "direct-api"
    && blockingReasons.length === 0
    && !request.externalWriteConfirmed
  ) {
    return Object.freeze({
      connectorId: connector.id,
      mode: connector.mode,
      status: "confirmation",
      action,
      blockingReasons: Object.freeze([]),
      warnings: Object.freeze(warnings),
      publishLocales: Object.freeze(publishLocales),
      unsupportedLocales: Object.freeze(unsupportedLocales),
    });
  }

  return Object.freeze({
    connectorId: connector.id,
    mode: connector.mode,
    status: blockingReasons.length > 0 ? "blocked" : "ready",
    action,
    blockingReasons: Object.freeze(blockingReasons),
    warnings: Object.freeze(warnings),
    publishLocales: Object.freeze(publishLocales),
    unsupportedLocales: Object.freeze(unsupportedLocales),
  });
}

export function createStudioPublishReceipt(
  connector: StudioPublishConnector,
  request: StudioPublishRequest,
  plan: StudioPublishPlan,
  input: {
    readonly receiptId: string;
    readonly createdAt: string;
    readonly externalReference: string | null;
  },
): StudioPublishReceipt {
  if (plan.connectorId !== connector.id || plan.status !== "ready") {
    throw new Error("Only a ready publishing plan can create a receipt.");
  }
  if (connector.mode === "direct-api" && !request.externalWriteConfirmed) {
    throw new Error("Direct publishing requires explicit external-write confirmation.");
  }
  const createdAt = input.createdAt;
  if (!validTimestamp(createdAt)) throw new Error("Receipt time is invalid.");
  return Object.freeze({
    id: requireText(input.receiptId, "Receipt id"),
    connectorId: connector.id,
    projectId: request.projectId,
    documentId: request.documentId,
    mode: connector.mode,
    locales: Object.freeze([...plan.publishLocales]),
    policyVersion: connector.policyVersion,
    createdAt,
    externalReference: input.externalReference,
  });
}
