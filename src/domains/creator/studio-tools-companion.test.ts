import { describe, expect, it, vi } from "vitest";

import {
  buildStudioCompanionCommand,
  buildStudioCompanionHello,
  buildStudioCompanionPrimaryState,
  isStudioCompanionMessage,
  openStudioToolsCompanionWindow,
  parseStudioCompanionMessage,
  STUDIO_COMPANION_TOOL_ORDER,
  studioCompanionUrl,
} from "./studio-tools-companion";

describe("studio-tools-companion protocol", () => {
  it("validates and builds hello / primary-state / command messages", () => {
    const hello = buildStudioCompanionHello("primary", 100);
    expect(hello).toEqual({ v: 1, type: "hello", role: "primary", at: 100 });
    expect(isStudioCompanionMessage(hello)).toBe(true);

    const state = buildStudioCompanionPrimaryState({
      tool: "pen",
      density: "full",
      canvasOnly: false,
      title: "에피소드 1",
      now: 200,
    });
    expect(state.type).toBe("primary-state");
    expect(isStudioCompanionMessage(state)).toBe(true);

    const cmd = buildStudioCompanionCommand("bubble", 300);
    expect(cmd).toEqual({ v: 1, type: "companion-command", command: "bubble", at: 300 });
    expect(parseStudioCompanionMessage(cmd)).toEqual(cmd);
  });

  it("rejects garbage payloads", () => {
    expect(isStudioCompanionMessage(null)).toBe(false);
    expect(isStudioCompanionMessage({ v: 2, type: "hello" })).toBe(false);
    expect(parseStudioCompanionMessage({ type: "hello" })).toBeNull();
  });

  it("exposes a full tool palette order", () => {
    expect(STUDIO_COMPANION_TOOL_ORDER).toContain("template");
    expect(STUDIO_COMPANION_TOOL_ORDER).toContain("3d-character");
    expect(STUDIO_COMPANION_TOOL_ORDER.length).toBeGreaterThanOrEqual(8);
  });

  it("builds companion URL and opens a named popup", () => {
    expect(studioCompanionUrl("https://example.com")).toBe("https://example.com/studio/tools-companion");
    const open = vi.fn((_url: string, _name: string, _features: string) => ({ focus: vi.fn() }) as unknown as Window);
    const win = openStudioToolsCompanionWindow(open);
    expect(open).toHaveBeenCalledOnce();
    const call = open.mock.calls[0] as [string, string, string];
    expect(call[0]).toContain("/studio/tools-companion");
    expect(call[1]).toBe("toonspectrum-studio-tools");
    expect(win).not.toBeNull();
  });
});
