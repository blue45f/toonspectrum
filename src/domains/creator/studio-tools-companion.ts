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

export type StudioCompanionMessage =
  | {
      v: 1;
      type: "hello";
      role: StudioCompanionRole;
      at: number;
    }
  | {
      v: 1;
      type: "primary-state";
      tool: StudioCompanionToolId;
      density: StudioCompanionDensity;
      canvasOnly: boolean;
      title: string;
      at: number;
    }
  | {
      v: 1;
      type: "companion-command";
      command: StudioCompanionToolId | "focus-primary" | "toggle-canvas-only";
      at: number;
    }
  | {
      v: 1;
      type: "ping" | "pong";
      at: number;
    };

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

export function isStudioCompanionMessage(value: unknown): value is StudioCompanionMessage {
  if (!value || typeof value !== "object") return false;
  const msg = value as Partial<StudioCompanionMessage>;
  if (msg.v !== 1 || typeof msg.type !== "string" || typeof msg.at !== "number") return false;
  switch (msg.type) {
    case "hello":
      return msg.role === "primary" || msg.role === "companion";
    case "primary-state":
      return (
        typeof msg.tool === "string"
        && typeof msg.density === "string"
        && typeof msg.canvasOnly === "boolean"
        && typeof msg.title === "string"
      );
    case "companion-command":
      return typeof msg.command === "string";
    case "ping":
    case "pong":
      return true;
    default:
      return false;
  }
}

export function buildStudioCompanionHello(role: StudioCompanionRole, now = Date.now()): StudioCompanionMessage {
  return { v: 1, type: "hello", role, at: now };
}

export function buildStudioCompanionPrimaryState(input: {
  tool: StudioCompanionToolId;
  density: StudioCompanionDensity;
  canvasOnly: boolean;
  title: string;
  now?: number;
}): StudioCompanionMessage {
  return {
    v: 1,
    type: "primary-state",
    tool: input.tool,
    density: input.density,
    canvasOnly: input.canvasOnly,
    title: input.title.slice(0, 120),
    at: input.now ?? Date.now(),
  };
}

export function buildStudioCompanionCommand(
  command: Extract<StudioCompanionMessage, { type: "companion-command" }>["command"],
  now = Date.now()
): StudioCompanionMessage {
  return { v: 1, type: "companion-command", command, at: now };
}

export function studioCompanionUrl(origin: string = typeof location !== "undefined" ? location.origin : ""): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${STUDIO_TOOLS_COMPANION_PATH}`;
}

/**
 * Open (or focus) the tools companion popup. Returns the window handle when available.
 * Primary should pass the current origin; blocked popups return null.
 */
export function openStudioToolsCompanionWindow(
  openWindow: (url: string, name: string, features: string) => Window | null = (url, name, features) =>
    typeof window !== "undefined" ? window.open(url, name, features) : null
): Window | null {
  try {
    const win = openWindow(
      studioCompanionUrl(),
      STUDIO_TOOLS_COMPANION_WINDOW_NAME,
      STUDIO_TOOLS_COMPANION_WINDOW_FEATURES
    );
    win?.focus?.();
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
  factory: (name: string) => StudioCompanionChannel = (name) =>
    new BroadcastChannel(name) as unknown as StudioCompanionChannel
): StudioCompanionChannel | null {
  if (typeof BroadcastChannel !== "function" && factory === undefined) return null;
  try {
    return factory(STUDIO_TOOLS_COMPANION_CHANNEL);
  } catch {
    return null;
  }
}

export function parseStudioCompanionMessage(data: unknown): StudioCompanionMessage | null {
  return isStudioCompanionMessage(data) ? data : null;
}
