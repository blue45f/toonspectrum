import type { StudioProjectKind } from "./studio-project-library-reader";

export const STUDIO_PROJECT_FORMAT_IDS = [
  "vertical-webtoon",
  "cuttoon",
  "page-comic",
  "motion-toon",
  "illustration",
] as const;

export const STUDIO_PROJECT_PURPOSE_IDS = [
  "serial",
  "portfolio",
  "brand",
  "client-work",
] as const;

export const STUDIO_PROJECT_START_POINT_IDS = [
  "idea",
  "script",
  "storyboard",
  "files",
] as const;

export const STUDIO_PROJECT_COLLABORATION_IDS = [
  "solo",
  "team",
  "client",
] as const;

export const STUDIO_WORKSPACE_MODE_IDS = [
  "planning",
  "storyboard",
  "webtoon",
  "illustration",
  "image",
  "design",
  "slides",
  "three-d",
  "animation",
  "localization",
  "review",
] as const;

export type StudioProjectFormat = (typeof STUDIO_PROJECT_FORMAT_IDS)[number];
export type StudioProjectPurpose = (typeof STUDIO_PROJECT_PURPOSE_IDS)[number];
export type StudioProjectStartPoint = (typeof STUDIO_PROJECT_START_POINT_IDS)[number];
export type StudioProjectCollaboration = (typeof STUDIO_PROJECT_COLLABORATION_IDS)[number];
export type StudioWorkspaceMode = (typeof STUDIO_WORKSPACE_MODE_IDS)[number];

export interface StudioProjectDefinition {
  readonly schemaVersion: 1;
  readonly format: StudioProjectFormat;
  readonly purpose: StudioProjectPurpose;
  readonly startPoint: StudioProjectStartPoint;
  readonly collaboration: StudioProjectCollaboration;
  readonly primaryWorkspace: StudioWorkspaceMode;
  readonly enabledWorkspaces: readonly StudioWorkspaceMode[];
  readonly deliveryProfileIds: readonly string[];
}

export interface CreateStudioProjectDefinitionInput {
  readonly format: StudioProjectFormat;
  readonly purpose?: StudioProjectPurpose;
  readonly startPoint?: StudioProjectStartPoint;
  readonly collaboration?: StudioProjectCollaboration;
  readonly primaryWorkspace: StudioWorkspaceMode;
  readonly enabledWorkspaces: readonly StudioWorkspaceMode[];
  readonly deliveryProfileIds?: readonly string[];
}

const FORMAT_SET = new Set<string>(STUDIO_PROJECT_FORMAT_IDS);
const PURPOSE_SET = new Set<string>(STUDIO_PROJECT_PURPOSE_IDS);
const START_POINT_SET = new Set<string>(STUDIO_PROJECT_START_POINT_IDS);
const COLLABORATION_SET = new Set<string>(STUDIO_PROJECT_COLLABORATION_IDS);
const WORKSPACE_SET = new Set<string>(STUDIO_WORKSPACE_MODE_IDS);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function uniqueWorkspaces(
  primaryWorkspace: StudioWorkspaceMode,
  workspaces: readonly StudioWorkspaceMode[],
): readonly StudioWorkspaceMode[] {
  return Object.freeze([
    primaryWorkspace,
    ...workspaces.filter((workspace) => workspace !== primaryWorkspace),
  ].filter((workspace, index, all) => all.indexOf(workspace) === index));
}

function normalizedDeliveryProfileIds(value: readonly string[] | undefined): readonly string[] {
  const profiles = (value ?? [])
    .map((item) => item.trim())
    .filter((item, index, all) => item.length > 0 && item.length <= 120 && all.indexOf(item) === index)
    .slice(0, 32);
  return Object.freeze(profiles);
}

export function createStudioProjectDefinition(
  input: CreateStudioProjectDefinitionInput,
): StudioProjectDefinition {
  return Object.freeze({
    schemaVersion: 1 as const,
    format: input.format,
    purpose: input.purpose ?? "serial",
    startPoint: input.startPoint ?? "idea",
    collaboration: input.collaboration ?? "solo",
    primaryWorkspace: input.primaryWorkspace,
    enabledWorkspaces: uniqueWorkspaces(input.primaryWorkspace, input.enabledWorkspaces),
    deliveryProfileIds: normalizedDeliveryProfileIds(input.deliveryProfileIds),
  });
}

export function parseStudioProjectDefinition(value: unknown): StudioProjectDefinition | null {
  const item = record(value);
  if (
    !item
    || item.schemaVersion !== 1
    || typeof item.format !== "string"
    || !FORMAT_SET.has(item.format)
    || typeof item.purpose !== "string"
    || !PURPOSE_SET.has(item.purpose)
    || typeof item.startPoint !== "string"
    || !START_POINT_SET.has(item.startPoint)
    || typeof item.collaboration !== "string"
    || !COLLABORATION_SET.has(item.collaboration)
    || typeof item.primaryWorkspace !== "string"
    || !WORKSPACE_SET.has(item.primaryWorkspace)
    || !Array.isArray(item.enabledWorkspaces)
    || item.enabledWorkspaces.some((workspace) => typeof workspace !== "string" || !WORKSPACE_SET.has(workspace))
    || !Array.isArray(item.deliveryProfileIds)
    || item.deliveryProfileIds.some((profile) => typeof profile !== "string")
  ) {
    return null;
  }

  return createStudioProjectDefinition({
    format: item.format as StudioProjectFormat,
    purpose: item.purpose as StudioProjectPurpose,
    startPoint: item.startPoint as StudioProjectStartPoint,
    collaboration: item.collaboration as StudioProjectCollaboration,
    primaryWorkspace: item.primaryWorkspace as StudioWorkspaceMode,
    enabledWorkspaces: item.enabledWorkspaces as StudioWorkspaceMode[],
    deliveryProfileIds: item.deliveryProfileIds as string[],
  });
}

export function legacyStudioProjectDefinition(
  kind: StudioProjectKind,
  templateId?: string | null,
): StudioProjectDefinition | null {
  if (kind === "webtoon") {
    const format: StudioProjectFormat = templateId === "webtoon-four-cut"
      || templateId?.startsWith("cuttoon-")
      ? "cuttoon"
      : templateId === "webtoon-page" || templateId?.startsWith("page-comic-")
        ? "page-comic"
        : "vertical-webtoon";
    return createStudioProjectDefinition({
      format,
      primaryWorkspace: "webtoon",
      enabledWorkspaces: ["planning", "storyboard", "webtoon", "image", "three-d", "design", "animation", "review"],
      deliveryProfileIds: format === "cuttoon"
        ? ["social-card-sequence", "social-square", "vertical-promo"]
        : format === "page-comic"
          ? ["page-pdf", "page-images", "print-package"]
          : ["webtoon-long-image", "episode-package", "platform-preview"],
    });
  }
  if (kind === "animation") {
    return createStudioProjectDefinition({
      format: "motion-toon",
      primaryWorkspace: "animation",
      enabledWorkspaces: ["planning", "storyboard", "illustration", "image", "three-d", "animation", "design", "review"],
      deliveryProfileIds: ["mp4", "webm", "gif", "vertical-short"],
    });
  }
  if (kind === "illustration") {
    return createStudioProjectDefinition({
      format: "illustration",
      purpose: "portfolio",
      primaryWorkspace: "illustration",
      enabledWorkspaces: ["illustration", "image", "three-d", "design", "review"],
      deliveryProfileIds: ["png", "jpeg", "high-resolution"],
    });
  }
  return null;
}

export function projectDefinitionForRead(
  value: unknown,
  kind: StudioProjectKind,
  templateId?: string | null,
): StudioProjectDefinition | null {
  return parseStudioProjectDefinition(value) ?? legacyStudioProjectDefinition(kind, templateId);
}
