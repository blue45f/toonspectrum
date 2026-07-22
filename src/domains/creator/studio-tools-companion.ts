/**
 * Studio multi-display companion protocol — pure helpers + BroadcastChannel contract.
 *
 * Primary editor owns document/undo. Companion is a tools-only window (palette + density
 * + open menus) that mirrors ephemeral UI intent over same-origin BroadcastChannel.
 * Not a CRDT — no document merge.
 */

import {
  captureStudioCompanionNavigatorFrame,
  createStudioCompanionReviewProjectionFromSource,
  isStudioCompanionNavigatorFrame,
  isStudioCompanionReviewControl,
  isStudioCompanionReviewProjection,
  planStudioCompanionNavigatorCapture,
  type StudioCompanionNavigatorFrame,
  type StudioCompanionReviewControl,
  type StudioCompanionReviewProjection,
  type StudioCompanionReviewProjectionSourceInput,
} from "./studio-companion-review-projection";

export {
  captureStudioCompanionNavigatorFrame,
  createStudioCompanionReviewProjection,
  createStudioCompanionReviewProjectionFromSource,
  encodeStudioCompanionNavigatorWebp,
  planStudioCompanionExternalScreenPlacement,
} from "./studio-companion-review-projection";

export const STUDIO_TOOLS_COMPANION_CHANNEL = "toonspectrum.studio.tools-companion.v1";
export const STUDIO_TOOLS_COMPANION_PATH = "/studio/tools-companion";
export const STUDIO_TOOLS_COMPANION_WINDOW_NAME = "toonspectrum-studio-tools";
export const STUDIO_TOOLS_COMPANION_WINDOW_FEATURES =
  "popup=yes,width=420,height=780,menubar=no,toolbar=no,location=no,status=no";

const STUDIO_COMPANION_SESSION_QUERY = "session";
const STUDIO_COMPANION_SESSION_PATTERN = /^[A-Za-z0-9_-]{12,96}$/u;
const STUDIO_COMPANION_SCOPE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;

export type StudioCompanionRole = "primary" | "companion";

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
  | "toggle-canvas-only";

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
      type: "companion-control";
      control: StudioCompanionReviewControl;
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
    };

export type StudioCompanionCommandMessage = Extract<
  StudioCompanionMessage,
  { type: "companion-command" }
>;

export type StudioCompanionControlMessage = Extract<
  StudioCompanionMessage,
  { type: "companion-control" }
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
const STUDIO_COMPANION_COMMANDS = new Set<string>([
  ...STUDIO_COMPANION_TOOL_ORDER,
  "focus-primary",
  "toggle-canvas-only",
]);
const STUDIO_COMPANION_MAX_MESSAGE_AGE_MS = 30_000;
const STUDIO_COMPANION_MAX_FUTURE_SKEW_MS = 5_000;
const STUDIO_COMPANION_RECENT_COMMAND_LIMIT = 256;
const STUDIO_COMPANION_PRIMARY_BINDING_LEASE_MS = 12_000;
const STUDIO_COMPANION_CAPTURE_MAX_FAILURES_PER_REVISION = 3;
const STUDIO_COMPANION_CAPTURE_RETRY_BASE_MS = 500;

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

export const createStudioCompanionInstanceId = createStudioCompanionSessionId;
export const createStudioCompanionCommandId = createStudioCompanionSessionId;

export function parseStudioCompanionSessionId(search: string): string | null {
  try {
    const values = new URLSearchParams(search).getAll(STUDIO_COMPANION_SESSION_QUERY);
    if (values.length !== 1) return null;
    return isStudioCompanionSessionId(values[0]) ? values[0] : null;
  } catch {
    return null;
  }
}

function requireStudioCompanionSessionId(sessionId: string): string {
  if (!isStudioCompanionSessionId(sessionId)) {
    throw new TypeError("Invalid Studio tools companion session id");
  }
  return sessionId;
}

export function studioCompanionChannelName(sessionId: string): string {
  return `${STUDIO_TOOLS_COMPANION_CHANNEL}.${requireStudioCompanionSessionId(sessionId)}`;
}

export function studioCompanionWindowName(sessionId: string): string {
  return `${STUDIO_TOOLS_COMPANION_WINDOW_NAME}-${requireStudioCompanionSessionId(sessionId)}`;
}

function studioCompanionPrimaryScope(search: string): { id?: string; remix?: string } {
  try {
    const params = new URLSearchParams(search);
    const scope: { id?: string; remix?: string } = {};
    const ids = params.getAll("id");
    const remixes = params.getAll("remix");
    if (ids.length === 1 && STUDIO_COMPANION_SCOPE_PATTERN.test(ids[0] ?? "")) scope.id = ids[0];
    if (
      !scope.id
      && remixes.length === 1
      && STUDIO_COMPANION_SCOPE_PATTERN.test(remixes[0] ?? "")
    ) {
      scope.remix = remixes[0];
    }
    return scope;
  } catch {
    return {};
  }
}

function studioCompanionScopedParams(sessionId: string, primarySearch: string): URLSearchParams {
  const params = new URLSearchParams({
    [STUDIO_COMPANION_SESSION_QUERY]: requireStudioCompanionSessionId(sessionId),
  });
  const scope = studioCompanionPrimaryScope(primarySearch);
  if (scope.id) params.set("id", scope.id);
  if (scope.remix) params.set("remix", scope.remix);
  return params;
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
        return hasExactStudioCompanionKeys(msg, [
          "v",
          "type",
          "role",
          "companionInstanceId",
          "targetPrimaryInstanceId",
          "at",
        ])
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
        && isStudioCompanionReviewControl(msg.control)
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

type StudioCompanionHelloInput =
  | {
      role: "primary";
      primaryInstanceId: string;
      targetCompanionInstanceId: string | null;
    }
  | {
      role: "companion";
      companionInstanceId: string;
      targetPrimaryInstanceId: string | null;
    };

export function buildStudioCompanionHello(
  input: StudioCompanionHelloInput,
  now = Date.now()
): Extract<StudioCompanionMessage, { type: "hello" }> {
  return input.role === "primary"
    ? {
        v: 1,
        type: "hello",
        role: "primary",
        primaryInstanceId: input.primaryInstanceId,
        targetCompanionInstanceId: input.targetCompanionInstanceId,
        at: now,
      }
    : {
        v: 1,
        type: "hello",
        role: "companion",
        companionInstanceId: input.companionInstanceId,
        targetPrimaryInstanceId: input.targetPrimaryInstanceId,
        at: now,
      };
}

export function buildStudioCompanionPrimaryState(input: {
  primaryInstanceId: string;
  targetCompanionInstanceId: string;
  tool: StudioCompanionToolId;
  density: StudioCompanionDensity;
  canvasOnly: boolean;
  title: string;
  now?: number;
}): StudioCompanionMessage {
  return {
    v: 1,
    type: "primary-state",
    primaryInstanceId: input.primaryInstanceId,
    targetCompanionInstanceId: input.targetCompanionInstanceId,
    tool: input.tool,
    density: input.density,
    canvasOnly: input.canvasOnly,
    title: input.title.replace(/[\0\r\n]+/gu, " ").slice(0, 120),
    at: input.now ?? Date.now(),
  };
}

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
    control: StudioCompanionReviewControl;
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

export function buildStudioCompanionReviewState(input: {
  primaryInstanceId: string;
  targetCompanionInstanceId: string;
  generation: number;
  projection: StudioCompanionReviewProjection;
  now?: number;
}): Extract<StudioCompanionMessage, { type: "primary-review-state" }> {
  return {
    v: 1,
    type: "primary-review-state",
    primaryInstanceId: input.primaryInstanceId,
    targetCompanionInstanceId: input.targetCompanionInstanceId,
    generation: input.generation,
    projection: input.projection,
    at: input.now ?? Date.now(),
  };
}

export function buildStudioCompanionNavigatorFrame(input: {
  primaryInstanceId: string;
  targetCompanionInstanceId: string;
  frame: StudioCompanionNavigatorFrame;
  now?: number;
}): Extract<StudioCompanionMessage, { type: "navigator-frame" }> {
  return {
    v: 1,
    type: "navigator-frame",
    primaryInstanceId: input.primaryInstanceId,
    targetCompanionInstanceId: input.targetCompanionInstanceId,
    generation: input.frame.generation,
    revision: input.frame.revision,
    sequence: input.frame.sequence,
    width: input.frame.width,
    height: input.frame.height,
    blob: input.frame.blob,
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

export function buildStudioCompanionPong(input: {
  primaryInstanceId: string;
  targetCompanionInstanceId: string;
  nonce: string;
}, now = Date.now()): Extract<StudioCompanionMessage, { type: "pong" }> {
  return { v: 1, type: "pong", ...input, at: now };
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

export class StudioCompanionPrimaryBinding {
  private activeCompanionInstanceId: string | null = null;
  private lastCompanionActivityAt = 0;
  private readonly commandGuard = new StudioCompanionCommandGuard();

  acceptHello(message: StudioCompanionMessage, primaryInstanceId: string, now = Date.now()): boolean {
    if (message.type !== "hello" || message.role !== "companion") return false;
    if (!isStudioCompanionMessageFresh(message, now)) return false;
    if (
      message.targetPrimaryInstanceId !== null
      && message.targetPrimaryInstanceId !== primaryInstanceId
    ) return false;
    if (
      this.activeCompanionInstanceId !== null
      && this.activeCompanionInstanceId !== message.companionInstanceId
      && now - this.lastCompanionActivityAt < STUDIO_COMPANION_PRIMARY_BINDING_LEASE_MS
    ) return false;
    this.activeCompanionInstanceId = message.companionInstanceId;
    this.lastCompanionActivityAt = now;
    this.commandGuard.bindCompanion(message.companionInstanceId);
    return true;
  }

  acceptPing(message: StudioCompanionMessage, primaryInstanceId: string, now = Date.now()): boolean {
    if (message.type !== "ping") return false;
    if (!isStudioCompanionMessageFresh(message, now)) return false;
    const accepted = message.targetPrimaryInstanceId === primaryInstanceId
      && message.companionInstanceId === this.activeCompanionInstanceId;
    if (accepted) this.lastCompanionActivityAt = now;
    return accepted;
  }

  acceptCommand(
    message: StudioCompanionMessage,
    primaryInstanceId: string,
    now = Date.now()
  ): message is StudioCompanionCommandMessage {
    if (message.type !== "companion-command" || !this.activeCompanionInstanceId) return false;
    const accepted = this.commandGuard.accept(message, {
      primaryInstanceId,
      companionInstanceId: this.activeCompanionInstanceId,
      now,
    });
    if (accepted) this.lastCompanionActivityAt = now;
    return accepted;
  }

  acceptControl(
    message: StudioCompanionMessage,
    primaryInstanceId: string,
    generation: number,
    now = Date.now()
  ): message is StudioCompanionControlMessage {
    if (
      message.type !== "companion-control"
      || !this.activeCompanionInstanceId
      || message.generation !== generation
    ) return false;
    const accepted = this.commandGuard.accept(message, {
      primaryInstanceId,
      companionInstanceId: this.activeCompanionInstanceId,
      now,
    });
    if (accepted) this.lastCompanionActivityAt = now;
    return accepted;
  }

  companionInstanceId(): string | null {
    return this.activeCompanionInstanceId;
  }

  expireIfStale(now = Date.now()): boolean {
    if (
      !this.activeCompanionInstanceId
      || now - this.lastCompanionActivityAt < STUDIO_COMPANION_PRIMARY_BINDING_LEASE_MS
    ) return false;
    this.release();
    return true;
  }

  release(): void {
    this.activeCompanionInstanceId = null;
    this.lastCompanionActivityAt = 0;
    this.commandGuard.reset();
  }
}

export function studioCompanionUrl(
  sessionId: string,
  origin: string = typeof location !== "undefined" ? location.origin : "",
  primarySearch: string = typeof location !== "undefined" ? location.search : ""
): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${STUDIO_TOOLS_COMPANION_PATH}?${studioCompanionScopedParams(
    sessionId,
    primarySearch
  ).toString()}`;
}

export function studioCompanionPrimaryUrl(
  sessionId: string,
  origin: string = typeof location !== "undefined" ? location.origin : "",
  companionSearch: string = typeof location !== "undefined" ? location.search : ""
): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/studio?${studioCompanionScopedParams(sessionId, companionSearch).toString()}`;
}

function isMatchingStudioToolsCompanionWindow(
  candidate: Window,
  expectedUrl: string,
  sessionId: string
): boolean {
  try {
    // WindowProxy.location can throw after the user navigates the popup cross-origin.
    // Treat that handle as recoverable through the session-specific named window instead
    // of focusing a page that is no longer the tools companion.
    const currentUrl = new URL(candidate.location.href);
    const expected = new URL(expectedUrl, currentUrl.origin);
    const currentScope = studioCompanionPrimaryScope(currentUrl.search);
    const expectedScope = studioCompanionPrimaryScope(expected.search);
    return currentUrl.origin === expected.origin
      && currentUrl.pathname === STUDIO_TOOLS_COMPANION_PATH
      && parseStudioCompanionSessionId(currentUrl.search) === sessionId
      && currentScope.id === expectedScope.id
      && currentScope.remix === expectedScope.remix;
  } catch {
    return false;
  }
}

export function isStudioToolsCompanionWindowReusable(
  sessionId: string,
  candidate: Window | null
): candidate is Window {
  if (!candidate || !isStudioCompanionSessionId(sessionId)) return false;
  try {
    return !candidate.closed
      && isMatchingStudioToolsCompanionWindow(
        candidate,
        studioCompanionUrl(sessionId),
        sessionId
      );
  } catch {
    return false;
  }
}

/**
 * Open (or focus) the tools companion popup. Returns the window handle when available.
 * Reuses a live matching handle without navigating it again. A live handle that was
 * navigated elsewhere is recovered through the session-specific window name.
 * Blocked popups return null.
 */
export function openStudioToolsCompanionWindow(
  sessionId: string,
  existingWindow: Window | null = null,
  openWindow: (url: string, name: string, features: string) => Window | null = (url, name, features) =>
    typeof window !== "undefined" ? window.open(url, name, features) : null
): Window | null {
  if (!isStudioCompanionSessionId(sessionId)) return null;
  const expectedUrl = studioCompanionUrl(sessionId);
  if (isStudioToolsCompanionWindowReusable(sessionId, existingWindow)) {
    try {
      existingWindow.focus?.();
    } catch {
      // The existing tools window is still valid even when focus is denied.
    }
    return existingWindow;
  }
  try {
    const win = openWindow(
      expectedUrl,
      studioCompanionWindowName(sessionId),
      STUDIO_TOOLS_COMPANION_WINDOW_FEATURES
    );
    if (!win) return null;
    try {
      win.focus?.();
    } catch {
      // A created popup remains usable even when the browser denies focus().
    }
    return win;
  } catch {
    return null;
  }
}

type StudioCompanionWindowRef = { current: Window | null };
type StudioCompanionAnnounce = (message: string) => void;

/** Keeps reuse/recovery policy in the lazy protocol chunk once the runtime is ready. */
export function openReadyStudioToolsCompanionForMenu(input: {
  sessionId: string;
  windowRef: StudioCompanionWindowRef;
  binding: StudioCompanionPrimaryBinding;
  announce: StudioCompanionAnnounce;
}): void {
  const cachedWindow = input.windowRef.current;
  const reusedExistingWindow = isStudioToolsCompanionWindowReusable(
    input.sessionId,
    cachedWindow
  );
  if (!reusedExistingWindow) {
    input.binding.release();
    input.windowRef.current = null;
  }
  const companionWindow = openStudioToolsCompanionWindow(
    input.sessionId,
    reusedExistingWindow ? cachedWindow : null
  );
  if (!companionWindow) {
    input.announce("팝업이 차단됐습니다. 브라우저에서 팝업을 허용해 주세요.");
    return;
  }
  input.windowRef.current = companionWindow;
  input.announce(
    reusedExistingWindow
      ? "도구 창을 앞으로 가져오도록 요청했어요 · 보이지 않으면 작업 표시줄에서 선택하세요"
      : cachedWindow
        ? "도구 창을 복구해 다시 연결합니다 · 다른 모니터로 옮겨 쓰세요"
        : "도구 창을 열었습니다 · 다른 모니터로 옮겨 쓰세요"
  );
}

/** Completes a synchronously reserved popup after the lazy protocol/runtime has loaded. */
export function completeReservedStudioToolsCompanionWindow(input: {
  sessionId: string;
  reservation: Window;
  windowRef: StudioCompanionWindowRef;
  announce: StudioCompanionAnnounce;
}): void {
  if (input.windowRef.current !== input.reservation) {
    try {
      input.reservation.close();
    } catch {
      // The user may have closed the reservation before the runtime finished loading.
    }
    return;
  }
  try {
    input.reservation.name = studioCompanionWindowName(input.sessionId);
    input.reservation.location.replace(studioCompanionUrl(input.sessionId));
  } catch {
    input.windowRef.current = null;
    try {
      input.reservation.close();
    } catch {
      // Ignore a reservation already closed by the browser.
    }
    input.announce("도구 창을 열지 못했습니다. 다시 시도해 주세요.");
    return;
  }
  try {
    input.reservation.focus();
  } catch {
    // A valid popup remains usable when focus() is denied.
  }
  input.announce("도구 창을 열었습니다 · 다른 모니터로 옮겨 쓰세요");
}

export type StudioCompanionChannel = {
  postMessage: (data: unknown) => void;
  close: () => void;
  onmessage: ((ev: MessageEvent) => void) | null;
};

export function createStudioCompanionChannel(
  sessionId: string,
  factory?: (name: string) => StudioCompanionChannel
): StudioCompanionChannel | null {
  if (!isStudioCompanionSessionId(sessionId)) return null;
  const create = factory ?? (
    typeof BroadcastChannel === "function"
      ? (name: string) => new BroadcastChannel(name) as unknown as StudioCompanionChannel
      : null
  );
  if (!create) return null;
  try {
    return create(studioCompanionChannelName(sessionId));
  } catch {
    return null;
  }
}

export function parseStudioCompanionMessage(data: unknown): StudioCompanionMessage | null {
  return isStudioCompanionMessage(data) ? data : null;
}

export type StudioCompanionPrimarySnapshot = {
  tool: StudioCompanionToolId;
  density: StudioCompanionDensity;
  canvasOnly: boolean;
  title: string;
};

export type StudioCompanionPrimaryRuntime = {
  sessionId: string;
  binding: StudioCompanionPrimaryBinding;
  publish: () => void;
  schedulePublish: () => void;
  generation: () => number;
  dispose: () => void;
};

export type StudioCompanionNavigatorCaptureRequest = {
  generation: number;
  revision: number;
  sequence: number;
  signal: AbortSignal;
};

export type StudioCompanionPrimarySourceRuntimeInput = Omit<
  Parameters<typeof startStudioCompanionPrimaryRuntime>[0],
  "getReviewProjection" | "captureNavigatorFrame"
> & {
  getReviewProjectionInput?: () => StudioCompanionReviewProjectionSourceInput;
  isNavigatorCaptureBlocked?: () => boolean;
  captureNavigatorCanvas?: (maximumLongestEdge: number) => HTMLCanvasElement | null;
};

/**
 * Adapts editor-owned source callbacks inside the optional companion chunk. The default Studio
 * route therefore pays only for three narrow callbacks until a companion is actually requested.
 */
export function startStudioCompanionPrimaryRuntimeFromSources(
  input: StudioCompanionPrimarySourceRuntimeInput
): StudioCompanionPrimaryRuntime | null {
  const {
    getReviewProjectionInput,
    isNavigatorCaptureBlocked,
    captureNavigatorCanvas,
    ...runtimeInput
  } = input;
  return startStudioCompanionPrimaryRuntime({
    ...runtimeInput,
    ...(getReviewProjectionInput
      ? {
          getReviewProjection: () => createStudioCompanionReviewProjectionFromSource(
            getReviewProjectionInput()
          ),
        }
      : {}),
    ...(isNavigatorCaptureBlocked && captureNavigatorCanvas
      ? {
          captureNavigatorFrame: (request) => captureStudioCompanionNavigatorFrame({
            request,
            isCaptureBlocked: isNavigatorCaptureBlocked,
            captureCanvas: captureNavigatorCanvas,
          }),
        }
      : {}),
  });
}

/**
 * Starts the primary-side protocol only after the optional companion chunk has loaded.
 * Keeping handshake, targeting, lease, and replay checks here prevents the default Studio
 * route from paying for the multi-window transport before the user requests it.
 */
export function startStudioCompanionPrimaryRuntime(input: {
  search: string;
  getSnapshot: () => StudioCompanionPrimarySnapshot;
  getReviewProjection?: () => StudioCompanionReviewProjection;
  captureNavigatorFrame?: (
    request: StudioCompanionNavigatorCaptureRequest
  ) => Promise<StudioCompanionNavigatorFrame | null>;
  onCommand: (command: StudioCompanionCommandName) => void;
  onControl?: (control: StudioCompanionReviewControl) => void;
}): StudioCompanionPrimaryRuntime | null {
  const sessionId = parseStudioCompanionSessionId(input.search) ?? createStudioCompanionSessionId();
  const primaryInstanceId = createStudioCompanionInstanceId();
  if (!sessionId || !primaryInstanceId) return null;

  const binding = new StudioCompanionPrimaryBinding();
  const channel = createStudioCompanionChannel(sessionId);
  if (!channel) return null;

  let disposed = false;
  let bindingGeneration = 0;
  let captureEpoch = 0;
  let captureInFlight = false;
  let captureSequence = 0;
  let captureController: AbortController | null = null;
  let captureTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let publishTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let lastCapturedGeneration = 0;
  let lastCapturedRevision = -1;
  let lastCaptureAt = -STUDIO_COMPANION_MAX_MESSAGE_AGE_MS;
  let captureFailureGeneration = 0;
  let captureFailureRevision = -1;
  let captureFailureCount = 0;
  let captureRetryNotBefore = 0;
  let navigatorDemanded = false;

  const clearCaptureTimer = () => {
    if (captureTimer === null) return;
    globalThis.clearTimeout(captureTimer);
    captureTimer = null;
  };

  const resetCaptureGeneration = () => {
    captureEpoch += 1;
    captureInFlight = false;
    captureController?.abort();
    captureController = null;
    clearCaptureTimer();
    lastCapturedGeneration = 0;
    lastCapturedRevision = -1;
    lastCaptureAt = Date.now() - 500;
    captureFailureGeneration = 0;
    captureFailureRevision = -1;
    captureFailureCount = 0;
    captureRetryNotBefore = 0;
  };

  const scheduleNavigatorCapture = (delayMs: number) => {
    if (captureTimer !== null) return;
    const scheduledEpoch = captureEpoch;
    captureTimer = globalThis.setTimeout(() => {
      captureTimer = null;
      if (disposed || captureEpoch !== scheduledEpoch) return;
      const latest = input.getReviewProjection?.();
      if (latest && isStudioCompanionReviewProjection(latest)) {
        requestNavigatorCapture(latest);
      }
    }, Math.max(0, delayMs));
  };

  const requestNavigatorCapture = (projection: StudioCompanionReviewProjection) => {
    const capture = input.captureNavigatorFrame;
    if (binding.expireIfStale()) {
      navigatorDemanded = false;
      resetCaptureGeneration();
      return;
    }
    const targetCompanionInstanceId = binding.companionInstanceId();
    if (
      disposed
      || !navigatorDemanded
      || !capture
      || !targetCompanionInstanceId
      || bindingGeneration <= 0
    ) return;
    const now = Date.now();
    if (
      captureFailureGeneration !== bindingGeneration
      || captureFailureRevision !== projection.documentRevision
    ) {
      clearCaptureTimer();
      captureFailureGeneration = bindingGeneration;
      captureFailureRevision = projection.documentRevision;
      captureFailureCount = 0;
      captureRetryNotBefore = 0;
    }
    if (captureFailureCount >= STUDIO_COMPANION_CAPTURE_MAX_FAILURES_PER_REVISION) return;
    if (captureRetryNotBefore > now) {
      scheduleNavigatorCapture(captureRetryNotBefore - now);
      return;
    }
    const plan = planStudioCompanionNavigatorCapture({
      generation: bindingGeneration,
      lastCapturedGeneration,
      revision: projection.documentRevision,
      lastCapturedRevision,
      lastCaptureAt,
      now,
      activeStroke: !projection.captureAllowed,
      inFlight: captureInFlight,
    });
    if (plan.kind === "defer") {
      scheduleNavigatorCapture(plan.delayMs);
      return;
    }
    if (plan.kind !== "capture") return;

    clearCaptureTimer();
    captureInFlight = true;
    lastCaptureAt = now;
    captureSequence += 1;
    const scheduledEpoch = captureEpoch;
    const scheduledGeneration = bindingGeneration;
    const scheduledRevision = projection.documentRevision;
    const scheduledSequence = captureSequence;
    const scheduledTarget = targetCompanionInstanceId;
    const controller = new AbortController();
    captureController = controller;
    let captureSucceeded = false;
    let captureTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;
    const timeout = new Promise<null>((resolve) => {
      captureTimeout = globalThis.setTimeout(() => {
        controller.abort();
        resolve(null);
      }, 5_000);
    });
    const captured = Promise.resolve().then(() => capture({
      generation: scheduledGeneration,
      revision: scheduledRevision,
      sequence: scheduledSequence,
      signal: controller.signal,
    }));
    void Promise.race([captured, timeout]).then((frame) => {
      if (
        !frame
        || disposed
        || captureEpoch !== scheduledEpoch
        || bindingGeneration !== scheduledGeneration
        || binding.companionInstanceId() !== scheduledTarget
        || frame.generation !== scheduledGeneration
        || frame.revision !== scheduledRevision
        || frame.sequence !== scheduledSequence
        || !isStudioCompanionNavigatorFrame(frame)
      ) return;
      try {
        channel.postMessage(buildStudioCompanionNavigatorFrame({
          primaryInstanceId,
          targetCompanionInstanceId: scheduledTarget,
          frame,
        }));
        captureSucceeded = true;
        lastCapturedGeneration = scheduledGeneration;
        lastCapturedRevision = Math.max(lastCapturedRevision, scheduledRevision);
      } catch {
        // A detached window may close while an asynchronous WebP encode is finishing.
      }
    }).catch(() => {
      // Capture is optional. The bounded textual review projection remains available.
    }).finally(() => {
      if (captureTimeout !== null) globalThis.clearTimeout(captureTimeout);
      if (captureEpoch !== scheduledEpoch) return;
      if (captureController === controller) captureController = null;
      captureInFlight = false;
      const latest = input.getReviewProjection?.();
      const remainsCurrent = Boolean(
        !disposed
        && bindingGeneration === scheduledGeneration
        && binding.companionInstanceId() === scheduledTarget
        && latest
        && isStudioCompanionReviewProjection(latest)
        && latest.documentRevision === scheduledRevision
      );
      if (remainsCurrent && !captureSucceeded) {
        captureFailureGeneration = scheduledGeneration;
        captureFailureRevision = scheduledRevision;
        captureFailureCount += 1;
        captureRetryNotBefore = Date.now() + (
          STUDIO_COMPANION_CAPTURE_RETRY_BASE_MS * (2 ** (captureFailureCount - 1))
        );
      } else if (remainsCurrent) {
        captureFailureCount = 0;
        captureRetryNotBefore = 0;
      }
      if (
        latest
        && isStudioCompanionReviewProjection(latest)
        && latest.documentRevision > lastCapturedRevision
      ) {
        requestNavigatorCapture(latest);
      }
    });
  };

  const publish = () => {
    if (disposed) return;
    if (binding.expireIfStale()) {
      navigatorDemanded = false;
      resetCaptureGeneration();
      return;
    }
    const targetCompanionInstanceId = binding.companionInstanceId();
    if (!targetCompanionInstanceId) return;
    const snapshot = input.getSnapshot();
    try {
      channel.postMessage(buildStudioCompanionPrimaryState({
        primaryInstanceId,
        targetCompanionInstanceId,
        tool: snapshot.tool,
        density: snapshot.density,
        canvasOnly: snapshot.canvasOnly,
        title: snapshot.title || "스튜디오",
      }));
      const projection = input.getReviewProjection?.();
      if (
        projection
        && bindingGeneration > 0
        && isStudioCompanionReviewProjection(projection)
      ) {
        channel.postMessage(buildStudioCompanionReviewState({
          primaryInstanceId,
          targetCompanionInstanceId,
          generation: bindingGeneration,
          projection,
        }));
        requestNavigatorCapture(projection);
      }
    } catch {
      // The popup may have closed between the state projection and postMessage.
    }
  };

  const schedulePublish = () => {
    if (disposed || !binding.companionInstanceId() || publishTimer !== null) return;
    publishTimer = globalThis.setTimeout(() => {
      publishTimer = null;
      publish();
    }, 100);
  };

  channel.onmessage = (event: MessageEvent) => {
    const message = parseStudioCompanionMessage(event.data);
    if (!message) return;
    if (message.type === "hello" && message.role === "companion") {
      const previousCompanionInstanceId = binding.companionInstanceId();
      if (!binding.acceptHello(message, primaryInstanceId)) return;
      if (previousCompanionInstanceId !== message.companionInstanceId) {
        bindingGeneration += 1;
        navigatorDemanded = false;
        resetCaptureGeneration();
      }
      const shouldReply = previousCompanionInstanceId !== message.companionInstanceId
        || message.targetPrimaryInstanceId === null;
      if (!shouldReply) return;
      const targetCompanionInstanceId = binding.companionInstanceId();
      if (!targetCompanionInstanceId) return;
      try {
        channel.postMessage(buildStudioCompanionHello({
          role: "primary",
          primaryInstanceId,
          targetCompanionInstanceId,
        }));
        publish();
      } catch {
        // The popup may have closed while completing the handshake.
      }
      return;
    }
    if (message.type === "ping" && binding.acceptPing(message, primaryInstanceId)) {
      try {
        channel.postMessage(buildStudioCompanionPong({
          primaryInstanceId,
          targetCompanionInstanceId: message.companionInstanceId,
          nonce: message.nonce,
        }));
      } catch {
        // Ignore a close racing the heartbeat response.
      }
      return;
    }
    if (message.type === "companion-control") {
      if (!binding.acceptControl(message, primaryInstanceId, bindingGeneration)) return;
      if (message.control.kind === "navigator-demand") {
        if (navigatorDemanded === message.control.active) return;
        navigatorDemanded = message.control.active;
        resetCaptureGeneration();
        if (navigatorDemanded) {
          const latest = input.getReviewProjection?.();
          if (latest && isStudioCompanionReviewProjection(latest)) {
            requestNavigatorCapture(latest);
          }
        }
        return;
      }
      if (message.control.kind === "navigate") {
        const latest = input.getReviewProjection?.();
        if (
          !navigatorDemanded
          || !latest
          || !isStudioCompanionReviewProjection(latest)
          || !latest.captureAllowed
        ) return;
      }
      input.onControl?.(message.control);
      publish();
      return;
    }
    if (!binding.acceptCommand(message, primaryInstanceId)) return;
    input.onCommand(message.command);
    publish();
  };

  try {
    channel.postMessage(buildStudioCompanionHello({
      role: "primary",
      primaryInstanceId,
      targetCompanionInstanceId: null,
    }));
  } catch {
    // The channel remains useful when the companion announces itself later.
  }

  return {
    sessionId,
    binding,
    publish,
    schedulePublish,
    generation: () => bindingGeneration,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      captureEpoch += 1;
      clearCaptureTimer();
      captureController?.abort();
      captureController = null;
      captureInFlight = false;
      if (publishTimer !== null) {
        globalThis.clearTimeout(publishTimer);
        publishTimer = null;
      }
      channel.onmessage = null;
      try {
        channel.close();
      } catch {
        // Ignore a channel already closed by the browser.
      }
      binding.release();
    },
  };
}
