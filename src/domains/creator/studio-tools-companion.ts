/**
 * Studio multi-display companion protocol — pure helpers + BroadcastChannel contract.
 *
 * Primary editor owns document/undo. Companion is a tools-only window (palette + density
 * + open menus) that mirrors ephemeral UI intent over same-origin BroadcastChannel.
 * Not a CRDT — no document merge.
 */

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

  accept(message: StudioCompanionCommandMessage, expected: {
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

  companionInstanceId(): string | null {
    return this.activeCompanionInstanceId;
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
  dispose: () => void;
};

/**
 * Starts the primary-side protocol only after the optional companion chunk has loaded.
 * Keeping handshake, targeting, lease, and replay checks here prevents the default Studio
 * route from paying for the multi-window transport before the user requests it.
 */
export function startStudioCompanionPrimaryRuntime(input: {
  search: string;
  getSnapshot: () => StudioCompanionPrimarySnapshot;
  onCommand: (command: StudioCompanionCommandName) => void;
}): StudioCompanionPrimaryRuntime | null {
  const sessionId = parseStudioCompanionSessionId(input.search) ?? createStudioCompanionSessionId();
  const primaryInstanceId = createStudioCompanionInstanceId();
  if (!sessionId || !primaryInstanceId) return null;

  const binding = new StudioCompanionPrimaryBinding();
  const channel = createStudioCompanionChannel(sessionId);
  if (!channel) return null;

  let disposed = false;
  const publish = () => {
    if (disposed) return;
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
    } catch {
      // The popup may have closed between the state projection and postMessage.
    }
  };

  channel.onmessage = (event: MessageEvent) => {
    const message = parseStudioCompanionMessage(event.data);
    if (!message) return;
    if (message.type === "hello" && message.role === "companion") {
      const previousCompanionInstanceId = binding.companionInstanceId();
      if (!binding.acceptHello(message, primaryInstanceId)) return;
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
    if (!binding.acceptCommand(message, primaryInstanceId)) return;
    input.onCommand(message.command);
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
    dispose: () => {
      if (disposed) return;
      disposed = true;
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
