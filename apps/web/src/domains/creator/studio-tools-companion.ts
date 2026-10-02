/**
 * Studio multi-display companion protocol — pure helpers + BroadcastChannel contract.
 *
 * Primary editor owns document/undo. Companion is a tools-only window (palette + density
 * + open menus) that mirrors ephemeral UI intent over same-origin BroadcastChannel.
 * Not a CRDT — no document merge.
 */

import {
  isStudioCompanionReferenceControl,
  isStudioCompanionReferencePreviewFrame,
  isStudioCompanionReferenceProjection,
  type StudioCompanionReferenceControl,
  type StudioCompanionReferenceProjection,
} from "./studio-companion-reference-projection";
import {
  isStudioCompanionNavigatorFrame,
  isStudioCompanionReviewControl,
  isStudioCompanionReviewProjection,
  type StudioCompanionReviewControl,
  type StudioCompanionReviewProjection,
} from "./studio-companion-review-projection";
import { isValidStudioWorkspaceWorkId } from "./studio-workspace-route";

export {
  captureStudioCompanionNavigatorFrame,
  createStudioCompanionReviewProjection,
  createStudioCompanionReviewProjectionFromSource,
  encodeStudioCompanionNavigatorWebp,
  planStudioCompanionExternalScreenPlacement,
} from "./studio-companion-review-projection";
export {
  isStudioCompanionReferenceControl,
  isStudioCompanionReferencePreviewFrame,
  isStudioCompanionReferenceProjection,
} from "./studio-companion-reference-projection";
export type {
  StudioCompanionReferenceControl,
  StudioCompanionReferencePreviewFrame,
  StudioCompanionReferenceProjection,
} from "./studio-companion-reference-projection";

export const STUDIO_TOOLS_COMPANION_CHANNEL = "toonstudio.studio.tools-companion.v1";
export const STUDIO_TOOLS_COMPANION_WINDOW_NAME = "toonstudio-studio-tools";
export const STUDIO_TOOLS_COMPANION_WINDOW_FEATURES =
  "popup=yes,width=520,height=820,menubar=no,toolbar=no,location=no,status=no";

export const STUDIO_COMPANION_WINDOW_FEATURES_BY_SURFACE: Readonly<Record<StudioCompanionSurface, string>> = {
  workspace: STUDIO_TOOLS_COMPANION_WINDOW_FEATURES,
  navigator: "popup=yes,width=390,height=860,menubar=no,toolbar=no,location=no,status=no",
  review: "popup=yes,width=420,height=860,menubar=no,toolbar=no,location=no,status=no",
  reference: "popup=yes,width=420,height=860,menubar=no,toolbar=no,location=no,status=no",
};

export const STUDIO_COMPANION_SESSION_QUERY = "session";
export const STUDIO_COMPANION_VIEW_QUERY = "view";
const STUDIO_COMPANION_SESSION_PATTERN = /^[A-Za-z0-9_-]{12,96}$/u;
const STUDIO_COMPANION_SCOPE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;

export type StudioCompanionI18n = (key: string, fallback?: string) => string;

export type StudioCompanionRole = "primary" | "companion";
export const STUDIO_COMPANION_SURFACES = ["workspace", "navigator", "review", "reference"] as const;
export type StudioCompanionSurface = (typeof STUDIO_COMPANION_SURFACES)[number];
/** @deprecated Use StudioCompanionSurface. */
export type StudioCompanionView = StudioCompanionSurface;

export type StudioCompanionToolId =
  | "select"
  | "pen"
  | "eraser"
  | "template"
  | "bubble"
  | "text"
  | "layers"
  | "ai"
  | "3d-character"
  | "3d-bg";

export type StudioCompanionDensity = "simple" | "full" | "focus";
export type StudioCompanionCommandName =
  | StudioCompanionToolId
  | "focus-primary"
  | "toggle-canvas-only"
  | "enter-canvas-only"
  | "exit-canvas-only";

export type StudioCompanionControl =
  | StudioCompanionReviewControl
  | StudioCompanionReferenceControl;

export type StudioCompanionReferenceColorResult = {
  generation: number;
  revision: number;
  referenceRevision: number;
  sequence: number;
  color: string;
};

export type StudioCompanionPresentationSafeState = Readonly<{
  enabled: boolean;
  clock: number;
  writerInstanceId: string;
  mutationId: string;
}>;

export type StudioCompanionMessage =
  | {
      v: 1;
      type: "hello";
      role: "primary";
      primaryInstanceId: string;
      targetCompanionInstanceId: string | null;
      at: number;
    }
  | {
      v: 1;
      type: "hello";
      role: "companion";
      companionInstanceId: string;
      targetPrimaryInstanceId: string | null;
      /** Missing on legacy workspace companions. */
      view?: StudioCompanionSurface;
      at: number;
    }
  | {
      v: 1;
      type: "primary-state";
      primaryInstanceId: string;
      targetCompanionInstanceId: string;
      tool: StudioCompanionToolId;
      density: StudioCompanionDensity;
      canvasOnly: boolean;
      title: string;
      at: number;
    }
  | {
      v: 1;
      type: "companion-command";
      command: StudioCompanionCommandName;
      companionInstanceId: string;
      targetPrimaryInstanceId: string;
      commandId: string;
      sequence: number;
      at: number;
    }
  | {
      v: 1;
      type: "primary-review-state";
      primaryInstanceId: string;
      targetCompanionInstanceId: string;
      generation: number;
      projection: StudioCompanionReviewProjection;
      at: number;
    }
  | {
      v: 1;
      type: "navigator-frame";
      primaryInstanceId: string;
      targetCompanionInstanceId: string;
      generation: number;
      revision: number;
      sequence: number;
      width: number;
      height: number;
      blob: Blob;
      at: number;
    }
  | {
      v: 1;
      type: "primary-reference-state";
      primaryInstanceId: string;
      targetCompanionInstanceId: string;
      generation: number;
      projection: StudioCompanionReferenceProjection;
      at: number;
    }
  | {
      v: 1;
      type: "reference-preview-frame";
      primaryInstanceId: string;
      targetCompanionInstanceId: string;
      generation: number;
      revision: number;
      referenceRevision: number;
      sequence: number;
      width: number;
      height: number;
      blob: Blob;
      at: number;
    }
  | {
      v: 1;
      type: "reference-color-result";
      primaryInstanceId: string;
      targetCompanionInstanceId: string;
      generation: number;
      revision: number;
      referenceRevision: number;
      sequence: number;
      color: string;
      at: number;
    }
  | {
      v: 1;
      type: "companion-presentation-safe";
      /** The companion forwarding this state; never a primary routing target. */
      companionInstanceId: string;
      /** Null broadcasts a mutation, while a peer hello replay is precisely targeted. */
      targetCompanionInstanceId: string | null;
      state: StudioCompanionPresentationSafeState;
      at: number;
    }
  | {
      v: 1;
      type: "companion-control";
      control: StudioCompanionControl;
      generation: number;
      companionInstanceId: string;
      targetPrimaryInstanceId: string;
      commandId: string;
      sequence: number;
      at: number;
    }
  | {
      v: 1;
      type: "ping";
      companionInstanceId: string;
      targetPrimaryInstanceId: string;
      nonce: string;
      at: number;
    }
  | {
      v: 1;
      type: "pong";
      primaryInstanceId: string;
      targetCompanionInstanceId: string;
      nonce: string;
      at: number;
    }
  | {
      v: 1;
      type: "companion-goodbye";
      companionInstanceId: string;
      targetPrimaryInstanceId: string;
      surface: StudioCompanionSurface;
      at: number;
    }
  | {
      v: 1;
      type: "primary-goodbye";
      primaryInstanceId: string;
      targetCompanionInstanceId: string;
      surface: StudioCompanionSurface;
      at: number;
    };

export type StudioCompanionCommandMessage = Extract<
  StudioCompanionMessage,
  { type: "companion-command" }
>;

export type StudioCompanionControlMessage = Extract<
  StudioCompanionMessage,
  { type: "companion-control" }
>;

export type StudioCompanionReferenceStateMessage = Extract<
  StudioCompanionMessage,
  { type: "primary-reference-state" }
>;

export type StudioCompanionReferencePreviewFrameMessage = Extract<
  StudioCompanionMessage,
  { type: "reference-preview-frame" }
>;

export type StudioCompanionReferenceColorResultMessage = Extract<
  StudioCompanionMessage,
  { type: "reference-color-result" }
>;

export type StudioCompanionPresentationSafeMessage = Extract<
  StudioCompanionMessage,
  { type: "companion-presentation-safe" }
>;

export type StudioCompanionGoodbyeMessage = Extract<
  StudioCompanionMessage,
  { type: "companion-goodbye" }
>;

export type StudioCompanionSequencedMessage =
  | StudioCompanionCommandMessage
  | StudioCompanionControlMessage;

export const STUDIO_COMPANION_TOOL_LABELS: Record<StudioCompanionToolId, string> = {
  select: "선택",
  pen: "펜",
  eraser: "지우개",
  template: "템플릿·에셋",
  bubble: "말풍선",
  text: "텍스트",
  layers: "레이어",
  ai: "AI 어시스트",
  "3d-character": "3D 캐릭터",
  "3d-bg": "3D 배경",
};

export const STUDIO_COMPANION_TOOL_LABEL_KEYS: Record<StudioCompanionToolId, string> = {
  select: "studio.toolsCompanion.tool.select",
  pen: "studio.toolsCompanion.tool.pen",
  eraser: "studio.toolsCompanion.tool.eraser",
  template: "studio.toolsCompanion.tool.template",
  bubble: "studio.toolsCompanion.tool.bubble",
  text: "studio.toolsCompanion.tool.text",
  layers: "studio.toolsCompanion.tool.layers",
  ai: "studio.toolsCompanion.tool.ai",
  "3d-character": "studio.toolsCompanion.tool.threeDCharacter",
  "3d-bg": "studio.toolsCompanion.tool.threeDBackground",
};

export const STUDIO_COMPANION_TOOL_ORDER: readonly StudioCompanionToolId[] = [
  "select",
  "pen",
  "eraser",
  "template",
  "bubble",
  "text",
  "layers",
  "ai",
  "3d-character",
  "3d-bg",
] as const;

const STUDIO_COMPANION_TOOL_IDS = new Set<string>(STUDIO_COMPANION_TOOL_ORDER);
const STUDIO_COMPANION_DENSITIES = new Set<string>(["simple", "full", "focus"]);
export const STUDIO_COMPANION_SURFACE_IDS = new Set<string>(STUDIO_COMPANION_SURFACES);
const STUDIO_COMPANION_COMMANDS = new Set<string>([
  ...STUDIO_COMPANION_TOOL_ORDER,
  "focus-primary",
  "toggle-canvas-only",
  "enter-canvas-only",
  "exit-canvas-only",
]);
export const STUDIO_COMPANION_MAX_MESSAGE_AGE_MS = 30_000;
const STUDIO_COMPANION_MAX_FUTURE_SKEW_MS = 5_000;
const STUDIO_COMPANION_RECENT_COMMAND_LIMIT = 256;
export const STUDIO_COMPANION_PRIMARY_BINDING_LEASE_MS = 12_000;

export function isStudioCompanionSessionId(value: unknown): value is string {
  return typeof value === "string" && STUDIO_COMPANION_SESSION_PATTERN.test(value);
}

export function createStudioCompanionSessionId(): string {
  try {
    const cryptoApi = globalThis.crypto;
    const uuid = cryptoApi?.randomUUID?.();
    if (isStudioCompanionSessionId(uuid)) return uuid;
    if (cryptoApi?.getRandomValues) {
      const random = new Uint32Array(4);
      cryptoApi.getRandomValues(random);
      const encoded = Array.from(random, (value) => value.toString(16).padStart(8, "0")).join("");
      const id = `studio-${encoded}`;
      if (isStudioCompanionSessionId(id)) return id;
    }
  } catch {
    // Fail closed below; this id gates isolation but is never an authentication credential.
  }
  return "";
}
export const createStudioCompanionCommandId = createStudioCompanionSessionId;

/**
 * Parses the optional detached-window view. A missing value preserves the original
 * all-in-one workspace companion; duplicate or unknown values fail closed.
 */
export function parseStudioCompanionSurface(search: string): StudioCompanionSurface | null {
  try {
    const values = new URLSearchParams(search).getAll(STUDIO_COMPANION_VIEW_QUERY);
    if (values.length === 0) return "workspace";
    if (values.length !== 1) return null;
    const surface = values[0];
    return typeof surface === "string" && STUDIO_COMPANION_SURFACE_IDS.has(surface)
      ? surface as StudioCompanionSurface
      : null;
  } catch {
    return null;
  }
}

/** @deprecated Use parseStudioCompanionSurface. */
export const parseStudioCompanionView = parseStudioCompanionSurface;

export function requireStudioCompanionSessionId(sessionId: string): string {
  if (!isStudioCompanionSessionId(sessionId)) {
    throw new TypeError("Invalid Studio tools companion session id");
  }
  return sessionId;
}

type StudioCompanionPrimaryScope = { id?: string; remix?: string };

export interface StudioCompanionDocumentScope {
  readonly workId: string | null;
  readonly remixId: string | null;
}

export function studioCompanionPrimaryScope(
  search: string,
  routeWorkId?: string | null,
): StudioCompanionPrimaryScope | null {
  try {
    const params = new URLSearchParams(search);
    const ids = params.getAll("id");
    const remixes = params.getAll("remix");

    if (ids.length > 1 || remixes.length > 1) return null;
    const queryWorkId = ids[0];
    const remixId = remixes[0];
    if (queryWorkId !== undefined && !isValidStudioWorkspaceWorkId(queryWorkId)) return null;
    if (remixId !== undefined && !STUDIO_COMPANION_SCOPE_PATTERN.test(remixId)) return null;

    if (routeWorkId !== undefined) {
      if (routeWorkId !== null && !isValidStudioWorkspaceWorkId(routeWorkId)) return null;
      if (queryWorkId !== undefined && queryWorkId !== routeWorkId) return null;
      if (routeWorkId !== null) return { id: routeWorkId };
      if (queryWorkId !== undefined) return null;
    }

    if (queryWorkId !== undefined) return { id: queryWorkId };
    return remixId === undefined ? {} : { remix: remixId };
  } catch {
    return null;
  }
}

export function parseStudioCompanionDocumentScope(
  search: string,
): StudioCompanionDocumentScope | null {
  const scope = studioCompanionPrimaryScope(search);
  if (!scope) return null;
  return Object.freeze({
    workId: scope.id ?? null,
    remixId: scope.remix ?? null,
  });
}

function isPlainStudioCompanionRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasExactStudioCompanionKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  try {
    const ownKeys = Reflect.ownKeys(value);
    return ownKeys.length === expected.length
      && ownKeys.every((key) => typeof key === "string" && expected.includes(key));
  } catch {
    return false;
  }
}

function studioCompanionExactOwnData(
  value: unknown,
  expected: readonly string[]
): Readonly<Record<string, unknown>> | null {
  if (!isPlainStudioCompanionRecord(value) || !hasExactStudioCompanionKeys(value, expected)) {
    return null;
  }
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of expected) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

export function isStudioCompanionReferenceColorResult(
  value: unknown
): value is StudioCompanionReferenceColorResult {
  const result = studioCompanionExactOwnData(value, [
    "generation",
    "revision",
    "referenceRevision",
    "sequence",
    "color",
  ]);
  return result !== null
    && typeof result.generation === "number"
    && Number.isSafeInteger(result.generation)
    && result.generation > 0
    && typeof result.revision === "number"
    && Number.isSafeInteger(result.revision)
    && result.revision > 0
    && typeof result.referenceRevision === "number"
    && Number.isSafeInteger(result.referenceRevision)
    && result.referenceRevision > 0
    && typeof result.sequence === "number"
    && Number.isSafeInteger(result.sequence)
    && result.sequence > 0
    && typeof result.color === "string"
    && /^#[\da-f]{6}(?:[\da-f]{2})?$/iu.test(result.color);
}

export function isStudioCompanionPresentationSafeState(
  value: unknown
): value is StudioCompanionPresentationSafeState {
  const state = studioCompanionExactOwnData(value, [
    "enabled",
    "clock",
    "writerInstanceId",
    "mutationId",
  ]);
  return state !== null
    && typeof state.enabled === "boolean"
    && typeof state.clock === "number"
    && Number.isSafeInteger(state.clock)
    && state.clock > 0
    && isStudioCompanionSessionId(state.writerInstanceId)
    && isStudioCompanionSessionId(state.mutationId);
}

export function isStudioCompanionControl(value: unknown): value is StudioCompanionControl {
  return isStudioCompanionReviewControl(value) || isStudioCompanionReferenceControl(value);
}

export function isStudioCompanionMessage(value: unknown): value is StudioCompanionMessage {
  if (!isPlainStudioCompanionRecord(value)) return false;
  const msg = value;
  if (
    msg.v !== 1
    || typeof msg.type !== "string"
    || typeof msg.at !== "number"
    || !Number.isSafeInteger(msg.at)
    || msg.at < 0
  ) return false;
  switch (msg.type) {
    case "hello":
      if (msg.role === "primary") {
        return hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "role",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "at",
        ])
          && isStudioCompanionSessionId(msg.primaryInstanceId)
          && (
            msg.targetCompanionInstanceId === null
            || isStudioCompanionSessionId(msg.targetCompanionInstanceId)
          );
      }
      if (msg.role === "companion") {
        const legacyKeys = [
          "v",
          "type",
          "role",
          "companionInstanceId",
          "targetPrimaryInstanceId",
          "at",
        ] as const;
        const surfaceKeys = [...legacyKeys.slice(0, -1), "view", "at"] as const;
        return (
          hasExactStudioCompanionKeys(msg, legacyKeys)
          || (
            hasExactStudioCompanionKeys(msg, surfaceKeys)
            && typeof msg.view === "string"
            && STUDIO_COMPANION_SURFACE_IDS.has(msg.view)
          )
        )
          && isStudioCompanionSessionId(msg.companionInstanceId)
          && (
            msg.targetPrimaryInstanceId === null
            || isStudioCompanionSessionId(msg.targetPrimaryInstanceId)
          );
      }
      return false;
    case "primary-state":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "tool",
          "density",
          "canvasOnly",
          "title",
          "at",
        ])
        && isStudioCompanionSessionId(msg.primaryInstanceId)
        && isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        && typeof msg.tool === "string"
        && STUDIO_COMPANION_TOOL_IDS.has(msg.tool)
        && typeof msg.density === "string"
        && STUDIO_COMPANION_DENSITIES.has(msg.density)
        && typeof msg.canvasOnly === "boolean"
        && typeof msg.title === "string"
        && msg.title.length <= 120
        && !/[\0\r\n]/u.test(msg.title)
      );
    case "companion-command":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "command",
          "companionInstanceId",
          "targetPrimaryInstanceId",
          "commandId",
          "sequence",
          "at",
        ])
        && typeof msg.command === "string"
        && STUDIO_COMPANION_COMMANDS.has(msg.command)
        && isStudioCompanionSessionId(msg.companionInstanceId)
        && isStudioCompanionSessionId(msg.targetPrimaryInstanceId)
        && isStudioCompanionSessionId(msg.commandId)
        && typeof msg.sequence === "number"
        && Number.isSafeInteger(msg.sequence)
        && msg.sequence > 0
      );
    case "primary-review-state":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "generation",
          "projection",
          "at",
        ])
        && isStudioCompanionSessionId(msg.primaryInstanceId)
        && isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        && typeof msg.generation === "number"
        && Number.isSafeInteger(msg.generation)
        && msg.generation > 0
        && isStudioCompanionReviewProjection(msg.projection)
      );
    case "navigator-frame":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "generation",
          "revision",
          "sequence",
          "width",
          "height",
          "blob",
          "at",
        ])
        && isStudioCompanionSessionId(msg.primaryInstanceId)
        && isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        && isStudioCompanionNavigatorFrame({
          generation: msg.generation,
          revision: msg.revision,
          sequence: msg.sequence,
          width: msg.width,
          height: msg.height,
          blob: msg.blob,
        })
      );
    case "primary-reference-state":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "generation",
          "projection",
          "at",
        ])
        && isStudioCompanionSessionId(msg.primaryInstanceId)
        && isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        && typeof msg.generation === "number"
        && Number.isSafeInteger(msg.generation)
        && msg.generation > 0
        && isStudioCompanionReferenceProjection(msg.projection)
        && msg.projection.generation === msg.generation
      );
    case "reference-preview-frame":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "generation",
          "revision",
          "referenceRevision",
          "sequence",
          "width",
          "height",
          "blob",
          "at",
        ])
        && isStudioCompanionSessionId(msg.primaryInstanceId)
        && isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        && isStudioCompanionReferencePreviewFrame({
          generation: msg.generation,
          revision: msg.revision,
          referenceRevision: msg.referenceRevision,
          sequence: msg.sequence,
          width: msg.width,
          height: msg.height,
          blob: msg.blob,
        })
      );
    case "reference-color-result":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "generation",
          "revision",
          "referenceRevision",
          "sequence",
          "color",
          "at",
        ])
        && isStudioCompanionSessionId(msg.primaryInstanceId)
        && isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        && isStudioCompanionReferenceColorResult({
          generation: msg.generation,
          revision: msg.revision,
          referenceRevision: msg.referenceRevision,
          sequence: msg.sequence,
          color: msg.color,
        })
      );
    case "companion-presentation-safe":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "companionInstanceId",
          "targetCompanionInstanceId",
          "state",
          "at",
        ])
        && isStudioCompanionSessionId(msg.companionInstanceId)
        && (
          msg.targetCompanionInstanceId === null
          || isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        )
        && isStudioCompanionPresentationSafeState(msg.state)
      );
    case "companion-control":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "control",
          "generation",
          "companionInstanceId",
          "targetPrimaryInstanceId",
          "commandId",
          "sequence",
          "at",
        ])
        && isStudioCompanionControl(msg.control)
        && typeof msg.generation === "number"
        && Number.isSafeInteger(msg.generation)
        && msg.generation > 0
        && isStudioCompanionSessionId(msg.companionInstanceId)
        && isStudioCompanionSessionId(msg.targetPrimaryInstanceId)
        && isStudioCompanionSessionId(msg.commandId)
        && typeof msg.sequence === "number"
        && Number.isSafeInteger(msg.sequence)
        && msg.sequence > 0
      );
    case "ping":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "companionInstanceId",
          "targetPrimaryInstanceId",
          "nonce",
          "at",
        ])
        && isStudioCompanionSessionId(msg.companionInstanceId)
        && isStudioCompanionSessionId(msg.targetPrimaryInstanceId)
        && isStudioCompanionSessionId(msg.nonce)
      );
    case "pong":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "nonce",
          "at",
        ])
        && isStudioCompanionSessionId(msg.primaryInstanceId)
        && isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        && isStudioCompanionSessionId(msg.nonce)
      );
    case "companion-goodbye":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "companionInstanceId",
          "targetPrimaryInstanceId",
          "surface",
          "at",
        ])
        && isStudioCompanionSessionId(msg.companionInstanceId)
        && isStudioCompanionSessionId(msg.targetPrimaryInstanceId)
        && typeof msg.surface === "string"
        && STUDIO_COMPANION_SURFACE_IDS.has(msg.surface)
      );
    case "primary-goodbye":
      return (
        hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "primaryInstanceId",
          "targetCompanionInstanceId",
          "surface",
          "at",
        ])
        && isStudioCompanionSessionId(msg.primaryInstanceId)
        && isStudioCompanionSessionId(msg.targetCompanionInstanceId)
        && typeof msg.surface === "string"
        && STUDIO_COMPANION_SURFACE_IDS.has(msg.surface)
      );
    default:
      return false;
  }
}

export function isStudioCompanionMessageFresh(
  message: Pick<StudioCompanionMessage, "at">,
  now = Date.now()
): boolean {
  if (!Number.isFinite(now)) return false;
  return (
    now - message.at <= STUDIO_COMPANION_MAX_MESSAGE_AGE_MS
    && message.at - now <= STUDIO_COMPANION_MAX_FUTURE_SKEW_MS
  );
}

export type StudioCompanionHelloInput =
  | {
      role: "primary";
      primaryInstanceId: string;
      targetCompanionInstanceId: string | null;
    }
  | {
      role: "companion";
      companionInstanceId: string;
      targetPrimaryInstanceId: string | null;
      surface?: StudioCompanionSurface;
    };

export function buildStudioCompanionCommand(
  input: {
    command: StudioCompanionCommandName;
    companionInstanceId: string;
    targetPrimaryInstanceId: string;
    commandId: string;
    sequence: number;
  },
  now = Date.now()
): StudioCompanionCommandMessage {
  return {
    v: 1,
    type: "companion-command",
    command: input.command,
    companionInstanceId: input.companionInstanceId,
    targetPrimaryInstanceId: input.targetPrimaryInstanceId,
    commandId: input.commandId,
    sequence: input.sequence,
    at: now,
  };
}

export function buildStudioCompanionControl(
  input: {
    control: StudioCompanionControl;
    generation: number;
    companionInstanceId: string;
    targetPrimaryInstanceId: string;
    commandId: string;
    sequence: number;
  },
  now = Date.now()
): StudioCompanionControlMessage {
  return {
    v: 1,
    type: "companion-control",
    control: input.control,
    generation: input.generation,
    companionInstanceId: input.companionInstanceId,
    targetPrimaryInstanceId: input.targetPrimaryInstanceId,
    commandId: input.commandId,
    sequence: input.sequence,
    at: now,
  };
}

export function buildStudioCompanionPresentationSafe(input: {
  companionInstanceId: string;
  targetCompanionInstanceId: string | null;
  state: StudioCompanionPresentationSafeState;
  now?: number;
}): StudioCompanionPresentationSafeMessage {
  return {
    v: 1,
    type: "companion-presentation-safe",
    companionInstanceId: input.companionInstanceId,
    targetCompanionInstanceId: input.targetCompanionInstanceId,
    state: Object.freeze({ ...input.state }),
    at: input.now ?? Date.now(),
  };
}

export function buildStudioCompanionPing(input: {
  companionInstanceId: string;
  targetPrimaryInstanceId: string;
  nonce: string;
}, now = Date.now()): Extract<StudioCompanionMessage, { type: "ping" }> {
  return { v: 1, type: "ping", ...input, at: now };
}

export function buildStudioCompanionGoodbye(input: {
  companionInstanceId: string;
  targetPrimaryInstanceId: string;
  surface: StudioCompanionSurface;
}, now = Date.now()): StudioCompanionGoodbyeMessage {
  return { v: 1, type: "companion-goodbye", ...input, at: now };
}

function compareStudioCompanionPresentationSafeState(
  left: StudioCompanionPresentationSafeState,
  right: StudioCompanionPresentationSafeState
): number {
  if (left.clock !== right.clock) return left.clock < right.clock ? -1 : 1;
  if (left.writerInstanceId !== right.writerInstanceId) {
    return left.writerInstanceId < right.writerInstanceId ? -1 : 1;
  }
  if (left.mutationId === right.mutationId) return 0;
  return left.mutationId < right.mutationId ? -1 : 1;
}

/**
 * Companion-only LWW register for presentation-safe state. Primary windows deliberately do not
 * participate. Lamport clock + writer/mutation ids form a deterministic total order, so peer
 * hello snapshots and concurrent updates converge without replaying an already-applied state.
 */
export class StudioCompanionPresentationSafeGuard {
  private companionInstanceId: string | null = null;
  private logicalClock = 0;
  private value: StudioCompanionPresentationSafeState | null = null;

  bind(companionInstanceId: string): boolean {
    if (!isStudioCompanionSessionId(companionInstanceId)) return false;
    if (this.companionInstanceId === companionInstanceId) return true;
    this.companionInstanceId = companionInstanceId;
    this.logicalClock = 0;
    this.value = null;
    return true;
  }

  reset(): void {
    this.companionInstanceId = null;
    this.logicalClock = 0;
    this.value = null;
  }

  write(enabled: boolean, mutationId: string): StudioCompanionPresentationSafeState | null {
    const writerInstanceId = this.companionInstanceId;
    if (
      !writerInstanceId
      || typeof enabled !== "boolean"
      || !isStudioCompanionSessionId(mutationId)
    ) return null;
    this.logicalClock = Math.max(this.logicalClock, this.value?.clock ?? 0) + 1;
    this.value = Object.freeze({
      enabled,
      clock: this.logicalClock,
      writerInstanceId,
      mutationId,
    });
    return this.value;
  }

  /**
   * Restores or merges an exact durable register value without pretending that the local
   * companion authored it. This is also used by the storage event bridge. Keeping the original
   * writer and mutation ids preserves the same total order across window reloads.
   */
  merge(state: unknown): boolean {
    if (!this.companionInstanceId || !isStudioCompanionPresentationSafeState(state)) return false;
    const candidate = Object.freeze({ ...state });
    this.logicalClock = Math.max(this.logicalClock, candidate.clock);
    if (this.value && compareStudioCompanionPresentationSafeState(candidate, this.value) <= 0) {
      return false;
    }
    this.value = candidate;
    return true;
  }

  accept(
    message: StudioCompanionMessage,
    expected: { companionInstanceId: string; now?: number }
  ): boolean {
    if (
      message.type !== "companion-presentation-safe"
      || !isStudioCompanionMessage(message)
      || this.companionInstanceId !== expected.companionInstanceId
      || message.companionInstanceId === expected.companionInstanceId
      || (
        message.targetCompanionInstanceId !== null
        && message.targetCompanionInstanceId !== expected.companionInstanceId
      )
      || !isStudioCompanionMessageFresh(message, expected.now ?? Date.now())
    ) return false;

    return this.merge(message.state);
  }

  current(): StudioCompanionPresentationSafeState | null {
    return this.value;
  }

  snapshot(): Readonly<{
    companionInstanceId: string | null;
    logicalClock: number;
    state: StudioCompanionPresentationSafeState | null;
  }> {
    return Object.freeze({
      companionInstanceId: this.companionInstanceId,
      logicalClock: this.logicalClock,
      state: this.value,
    });
  }
}

export class StudioCompanionCommandGuard {
  private companionInstanceId: string | null = null;
  private lastSequence = 0;
  private readonly recentCommandIds = new Set<string>();
  private readonly recentCommandOrder: string[] = [];

  bindCompanion(companionInstanceId: string): void {
    if (this.companionInstanceId === companionInstanceId) return;
    this.companionInstanceId = companionInstanceId;
    this.lastSequence = 0;
    this.recentCommandIds.clear();
    this.recentCommandOrder.length = 0;
  }

  reset(): void {
    this.companionInstanceId = null;
    this.lastSequence = 0;
    this.recentCommandIds.clear();
    this.recentCommandOrder.length = 0;
  }

  accept(message: StudioCompanionSequencedMessage, expected: {
    primaryInstanceId: string;
    companionInstanceId: string;
    now?: number;
  }): boolean {
    if (this.companionInstanceId !== expected.companionInstanceId) return false;
    if (message.targetPrimaryInstanceId !== expected.primaryInstanceId) return false;
    if (message.companionInstanceId !== expected.companionInstanceId) return false;
    if (!isStudioCompanionMessageFresh(message, expected.now ?? Date.now())) return false;
    if (message.sequence <= this.lastSequence) return false;
    if (this.recentCommandIds.has(message.commandId)) return false;

    this.lastSequence = message.sequence;
    this.recentCommandIds.add(message.commandId);
    this.recentCommandOrder.push(message.commandId);
    while (this.recentCommandOrder.length > STUDIO_COMPANION_RECENT_COMMAND_LIMIT) {
      const expired = this.recentCommandOrder.shift();
      if (expired) this.recentCommandIds.delete(expired);
    }
    return true;
  }

  snapshot(): {
    companionInstanceId: string | null;
    lastSequence: number;
    recentCommandCount: number;
  } {
    return {
      companionInstanceId: this.companionInstanceId,
      lastSequence: this.lastSequence,
      recentCommandCount: this.recentCommandIds.size,
    };
  }
}

/**
 * Companion-side fence for the view-only Reference stream. The projection is the revision
 * authority; preview and color messages are accepted only for that exact cursor and once per
 * monotonically increasing sequence. A new binding generation resets both sequence fences.
 */
export class StudioCompanionReferenceMessageGuard {
  private primaryInstanceId: string | null = null;
  private companionInstanceId: string | null = null;
  private generation = 0;
  private revision = 0;
  private referenceRevision = 0;
  private frameSequence = 0;
  private colorSequence = 0;

  bind(primaryInstanceId: string, companionInstanceId: string): boolean {
    if (
      !isStudioCompanionSessionId(primaryInstanceId)
      || !isStudioCompanionSessionId(companionInstanceId)
    ) return false;
    if (
      this.primaryInstanceId === primaryInstanceId
      && this.companionInstanceId === companionInstanceId
    ) return true;
    this.primaryInstanceId = primaryInstanceId;
    this.companionInstanceId = companionInstanceId;
    this.resetCursor();
    return true;
  }

  reset(): void {
    this.primaryInstanceId = null;
    this.companionInstanceId = null;
    this.resetCursor();
  }

  acceptState(
    message: StudioCompanionMessage,
    now = Date.now()
  ): message is StudioCompanionReferenceStateMessage {
    if (
      message.type !== "primary-reference-state"
      || !this.matchesRoute(message)
      || !isStudioCompanionMessageFresh(message, now)
    ) return false;

    const { generation, revision, referenceRevision } = message.projection;
    if (generation < this.generation) return false;
    if (generation === this.generation) {
      if (revision < this.revision || referenceRevision < this.referenceRevision) return false;
      if (revision === this.revision && referenceRevision === this.referenceRevision) return false;
    }

    if (generation > this.generation) {
      this.frameSequence = 0;
      this.colorSequence = 0;
    } else if (revision > this.revision || referenceRevision > this.referenceRevision) {
      this.frameSequence = 0;
      this.colorSequence = 0;
    }
    this.generation = generation;
    this.revision = revision;
    this.referenceRevision = referenceRevision;
    return true;
  }

  acceptPreviewFrame(
    message: StudioCompanionMessage,
    now = Date.now()
  ): message is StudioCompanionReferencePreviewFrameMessage {
    if (
      message.type !== "reference-preview-frame"
      || !this.matchesRoute(message)
      || !isStudioCompanionMessageFresh(message, now)
      || !this.matchesCurrentCursor(message)
      || message.sequence <= this.frameSequence
    ) return false;
    this.frameSequence = message.sequence;
    return true;
  }

  acceptColorResult(
    message: StudioCompanionMessage,
    now = Date.now()
  ): message is StudioCompanionReferenceColorResultMessage {
    if (
      message.type !== "reference-color-result"
      || !this.matchesRoute(message)
      || !isStudioCompanionMessageFresh(message, now)
      || !this.matchesCurrentCursor(message)
      || message.sequence <= this.colorSequence
    ) return false;
    this.colorSequence = message.sequence;
    return true;
  }

  snapshot(): Readonly<{
    generation: number;
    revision: number;
    referenceRevision: number;
    frameSequence: number;
    colorSequence: number;
  }> {
    return {
      generation: this.generation,
      revision: this.revision,
      referenceRevision: this.referenceRevision,
      frameSequence: this.frameSequence,
      colorSequence: this.colorSequence,
    };
  }

  private matchesRoute(message: StudioCompanionMessage): boolean {
    if (
      message.type !== "primary-reference-state"
      && message.type !== "reference-preview-frame"
      && message.type !== "reference-color-result"
    ) return false;
    return message.primaryInstanceId === this.primaryInstanceId
      && message.targetCompanionInstanceId === this.companionInstanceId;
  }

  private matchesCurrentCursor(message: StudioCompanionReferencePreviewFrameMessage | StudioCompanionReferenceColorResultMessage): boolean {
    return this.generation > 0
      && message.generation === this.generation
      && message.revision === this.revision
      && message.referenceRevision === this.referenceRevision;
  }

  private resetCursor(): void {
    this.generation = 0;
    this.revision = 0;
    this.referenceRevision = 0;
    this.frameSequence = 0;
    this.colorSequence = 0;
  }
}

export type StudioCompanionBindingSnapshot = {
  surface: StudioCompanionSurface;
  companionInstanceId: string;
  generation: number;
  lastActivityAt: number;
};

export type StudioCompanionBindingSlot = StudioCompanionBindingSnapshot & {
  commandGuard: StudioCompanionCommandGuard;
  referencePickRevision: number;
  referencePickSequence: number;
};

export function studioCompanionSurfaceForHello(
  message: Extract<StudioCompanionMessage, { type: "hello"; role: "companion" }>
): StudioCompanionSurface {
  return message.view ?? "workspace";
}

export function isStudioCompanionCommandAllowed(
  surface: StudioCompanionSurface,
  command: StudioCompanionCommandName
): boolean {
  return surface === "workspace" || command === "focus-primary";
}

export function isStudioCompanionControlAllowed(
  surface: StudioCompanionSurface,
  control: StudioCompanionControl
): boolean {
  if (surface === "workspace") return true;
  if (surface === "navigator") {
    return control.kind === "navigator-demand" || control.kind === "navigate";
  }
  if (surface === "reference") return isStudioCompanionReferenceControl(control);
  return control.kind === "select-layer"
    || control.kind === "history"
    || control.kind === "comment-focus"
    || control.kind === "brush";
}

export function canAcceptStudioCompanionReferencePick(
  slot: StudioCompanionBindingSlot,
  control: StudioCompanionControl
): boolean {
  if (control.kind !== "reference-pick-color") return true;
  return control.referenceRevision > slot.referencePickRevision
    || (
      control.referenceRevision === slot.referencePickRevision
      && control.sequence > slot.referencePickSequence
    );
}

export function commitStudioCompanionReferencePick(
  slot: StudioCompanionBindingSlot,
  control: StudioCompanionControl
): void {
  if (control.kind !== "reference-pick-color") return;
  slot.referencePickRevision = control.referenceRevision;
  slot.referencePickSequence = control.sequence;
}

export {
  STUDIO_TOOLS_COMPANION_PATH,
  StudioCompanionPrimaryBinding,
  buildStudioCompanionHello,
  buildStudioCompanionNavigatorFrame,
  buildStudioCompanionPong,
  buildStudioCompanionPrimaryGoodbye,
  buildStudioCompanionPrimaryState,
  buildStudioCompanionReferenceColorResult,
  buildStudioCompanionReferencePreviewFrame,
  buildStudioCompanionReferenceState,
  buildStudioCompanionReviewState,
  completeReservedStudioToolsCompanionWindow,
  createStudioCompanionChannel,
  createStudioCompanionInstanceId,
  isStudioToolsCompanionWindowReusable,
  openReadyStudioToolsCompanionForMenu,
  openStudioCompanionSurfaceWindow,
  openStudioToolsCompanionWindow,
  parseStudioCompanionMessage,
  parseStudioCompanionSessionId,
  startStudioCompanionPrimaryRuntime,
  startStudioCompanionPrimaryRuntimeFromSources,
  studioCompanionChannelName,
  studioCompanionDefaultWindowFeatures,
  studioCompanionPrimaryUrl,
  studioCompanionUrl,
  studioCompanionWindowName,
} from "./studio-tools-companion-primary";
export type {
  StudioCompanionChannel,
  StudioCompanionChannelFactory,
  StudioCompanionNavigatorCaptureRequest,
  StudioCompanionPrimaryRuntime,
  StudioCompanionPrimarySnapshot,
  StudioCompanionPrimarySourceRuntimeInput,
  StudioCompanionReferenceCaptureRequest,
  StudioCompanionReferenceColorSampleRequest,
  StudioCompanionReferenceRequester,
} from "./studio-tools-companion-primary";
