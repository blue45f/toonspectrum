/**
 * Session macro recorder — high-level allowlisted commands only (no pointer streams).
 * Auto Action conversion lives in studio-macro-to-auto-actions.ts so StudioPage can keep
 * the heavy auto-actions module out of the static Studio route chunk.
 */

export const STUDIO_MACRO_RECORDER_VERSION = 1 as const;
export const STUDIO_MACRO_MAX_COMMANDS = 80;

export type StudioMacroCommand =
  | { type: "set-opacity"; opacity: number }
  | { type: "set-hidden"; hidden: boolean }
  | { type: "set-locked"; locked: boolean }
  | { type: "set-blend-mode"; blendMode: string }
  | { type: "lettering-font-size"; fontSize: number }
  | { type: "lettering-color"; color: string };

export interface StudioMacroSession {
  version: typeof STUDIO_MACRO_RECORDER_VERSION;
  recording: boolean;
  startedAt: number | null;
  commands: readonly StudioMacroCommand[];
  name: string;
}

export function createStudioMacroSession(name = "녹음 매크로"): StudioMacroSession {
  return {
    version: STUDIO_MACRO_RECORDER_VERSION,
    recording: false,
    startedAt: null,
    commands: [],
    name: typeof name === "string" && name.trim() ? name.trim().slice(0, 80) : "녹음 매크로",
  };
}

export function startStudioMacroRecording(
  session: StudioMacroSession,
  now = Date.now()
): StudioMacroSession {
  return {
    ...session,
    recording: true,
    startedAt: now,
    commands: [],
  };
}

export function stopStudioMacroRecording(session: StudioMacroSession): StudioMacroSession {
  return { ...session, recording: false };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export function normalizeStudioMacroCommand(value: unknown): StudioMacroCommand | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  switch (record.type) {
    case "set-opacity":
      return { type: "set-opacity", opacity: clamp01(Number(record.opacity)) };
    case "set-hidden":
      return { type: "set-hidden", hidden: record.hidden === true };
    case "set-locked":
      return { type: "set-locked", locked: record.locked === true };
    case "set-blend-mode":
      return {
        type: "set-blend-mode",
        blendMode: typeof record.blendMode === "string" ? record.blendMode.slice(0, 40) : "source-over",
      };
    case "lettering-font-size": {
      const fontSize = Number(record.fontSize);
      if (!Number.isFinite(fontSize)) return null;
      return { type: "lettering-font-size", fontSize: Math.min(200, Math.max(6, fontSize)) };
    }
    case "lettering-color": {
      const color = typeof record.color === "string" ? record.color.trim().toLowerCase() : "#202020";
      return {
        type: "lettering-color",
        color: /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(color) ? color : "#202020",
      };
    }
    default:
      return null;
  }
}

export function recordStudioMacroCommand(
  session: StudioMacroSession,
  command: unknown
): StudioMacroSession {
  if (!session.recording) return session;
  const normalized = normalizeStudioMacroCommand(command);
  if (!normalized) return session;
  if (session.commands.length >= STUDIO_MACRO_MAX_COMMANDS) return session;
  return {
    ...session,
    commands: [...session.commands, normalized],
  };
}
