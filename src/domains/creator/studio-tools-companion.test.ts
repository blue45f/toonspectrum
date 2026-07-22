import { describe, expect, it, vi } from "vitest";

import {
  buildStudioCompanionCommand,
  buildStudioCompanionHello,
  buildStudioCompanionPing,
  buildStudioCompanionPong,
  buildStudioCompanionPrimaryState,
  createStudioCompanionChannel,
  createStudioCompanionSessionId,
  isStudioCompanionMessage,
  isStudioCompanionMessageFresh,
  isStudioCompanionSessionId,
  isStudioToolsCompanionWindowReusable,
  openStudioToolsCompanionWindow,
  parseStudioCompanionSessionId,
  parseStudioCompanionMessage,
  STUDIO_COMPANION_TOOL_ORDER,
  studioCompanionChannelName,
  studioCompanionPrimaryUrl,
  studioCompanionUrl,
  StudioCompanionCommandGuard,
  StudioCompanionPrimaryBinding,
} from "./studio-tools-companion";

const primaryA = "primary-a-1234";
const primaryB = "primary-b-5678";
const companionA = "companion-a-1234";
const companionB = "companion-b-5678";

describe("studio-tools-companion protocol", () => {
  it("validates and builds hello / primary-state / command messages", () => {
    const hello = buildStudioCompanionHello({
      role: "primary",
      primaryInstanceId: primaryA,
      targetCompanionInstanceId: null,
    }, 100);
    expect(hello).toEqual({
      v: 1,
      type: "hello",
      role: "primary",
      primaryInstanceId: primaryA,
      targetCompanionInstanceId: null,
      at: 100,
    });
    expect(isStudioCompanionMessage(hello)).toBe(true);

    const state = buildStudioCompanionPrimaryState({
      primaryInstanceId: primaryA,
      targetCompanionInstanceId: companionA,
      tool: "pen",
      density: "full",
      canvasOnly: false,
      title: "에피소드 1",
      now: 200,
    });
    expect(state.type).toBe("primary-state");
    expect(isStudioCompanionMessage(state)).toBe(true);

    const cmd = buildStudioCompanionCommand({
      command: "bubble",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      commandId: "command-a-1234",
      sequence: 1,
    }, 300);
    expect(cmd).toEqual({
      v: 1,
      type: "companion-command",
      command: "bubble",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      commandId: "command-a-1234",
      sequence: 1,
      at: 300,
    });
    expect(parseStudioCompanionMessage(cmd)).toEqual(cmd);

    const ping = buildStudioCompanionPing({
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      nonce: "ping-nonce-1234",
    }, 400);
    const pong = buildStudioCompanionPong({
      primaryInstanceId: primaryA,
      targetCompanionInstanceId: companionA,
      nonce: "ping-nonce-1234",
    }, 401);
    expect(isStudioCompanionMessage(ping)).toBe(true);
    expect(isStudioCompanionMessage(pong)).toBe(true);
  });

  it("rejects garbage payloads", () => {
    expect(isStudioCompanionMessage(null)).toBe(false);
    expect(isStudioCompanionMessage({ v: 2, type: "hello" })).toBe(false);
    expect(parseStudioCompanionMessage({ type: "hello" })).toBeNull();
    expect(parseStudioCompanionMessage({
      v: 1,
      type: "primary-state",
      primaryInstanceId: primaryA,
      targetCompanionInstanceId: companionA,
      tool: "not-a-tool",
      density: "giant",
      canvasOnly: false,
      title: "오염된 상태",
      at: 1,
    })).toBeNull();
    expect(parseStudioCompanionMessage({
      v: 1,
      type: "companion-command",
      command: "delete-document",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      commandId: "command-a-1234",
      sequence: 1,
      at: 1,
    })).toBeNull();
    expect(parseStudioCompanionMessage({ v: 1, type: "ping", at: Number.NaN })).toBeNull();
    expect(parseStudioCompanionMessage({ v: 1, type: "ping", at: -1 })).toBeNull();
    expect(parseStudioCompanionMessage({ v: 1, type: "ping", at: 1.5 })).toBeNull();
    expect(parseStudioCompanionMessage({
      v: 1,
      type: "primary-state",
      primaryInstanceId: primaryA,
      targetCompanionInstanceId: companionA,
      tool: "pen",
      density: "full",
      canvasOnly: false,
      title: "가".repeat(121),
      at: 1,
    })).toBeNull();
    expect(parseStudioCompanionMessage({
      v: 1,
      type: "hello",
      role: "primary",
      at: 1,
    })).toBeNull();
    expect(parseStudioCompanionMessage({
      v: 1,
      type: "pong",
      primaryInstanceId: primaryA,
      targetCompanionInstanceId: "bad",
      nonce: "ping-nonce-1234",
      at: 1,
    })).toBeNull();

    const valid = buildStudioCompanionPrimaryState({
      primaryInstanceId: primaryA,
      targetCompanionInstanceId: companionA,
      tool: "pen",
      density: "full",
      canvasOnly: false,
      title: "정상",
      now: 1,
    });
    expect(parseStudioCompanionMessage([valid])).toBeNull();
    expect(parseStudioCompanionMessage({ ...valid, extra: true })).toBeNull();
    const customPrototype = Object.assign(Object.create({ inherited: true }), valid);
    expect(parseStudioCompanionMessage(customPrototype)).toBeNull();
    expect(parseStudioCompanionMessage({ ...valid, title: "오염\n제목" })).toBeNull();
    const validPing = buildStudioCompanionPing({
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      nonce: "ping-nonce-1234",
    }, 1);
    expect(parseStudioCompanionMessage({ ...validPing, at: -1 })).toBeNull();
    expect(parseStudioCompanionMessage({ ...validPing, at: 1.5 })).toBeNull();
  });

  it("rejects stale/future messages and command replay across one bound companion", () => {
    const guard = new StudioCompanionCommandGuard();
    guard.bindCompanion(companionA);
    const command = buildStudioCompanionCommand({
      command: "pen",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      commandId: "command-a-1234",
      sequence: 1,
    }, 10_000);

    expect(isStudioCompanionMessageFresh(command, 10_000)).toBe(true);
    expect(isStudioCompanionMessageFresh(command, 50_001)).toBe(false);
    expect(isStudioCompanionMessageFresh(command, 4_999)).toBe(false);
    expect(guard.accept(command, {
      primaryInstanceId: primaryA,
      companionInstanceId: companionA,
      now: 10_000,
    })).toBe(true);
    expect(guard.accept(command, {
      primaryInstanceId: primaryA,
      companionInstanceId: companionA,
      now: 10_001,
    })).toBe(false);
    expect(guard.accept({ ...command, commandId: "command-seq-0002", sequence: 1 }, {
      primaryInstanceId: primaryA,
      companionInstanceId: companionA,
      now: 10_001,
    })).toBe(false);
    expect(guard.accept({ ...command, commandId: "command-seq-0003", sequence: 0 }, {
      primaryInstanceId: primaryA,
      companionInstanceId: companionA,
      now: 10_001,
    })).toBe(false);
    expect(guard.accept({ ...command, commandId: "command-b-5678", sequence: 2 }, {
      primaryInstanceId: primaryB,
      companionInstanceId: companionA,
      now: 10_001,
    })).toBe(false);
    expect(guard.accept({ ...command, commandId: "command-c-9012", sequence: 2 }, {
      primaryInstanceId: primaryA,
      companionInstanceId: companionB,
      now: 10_001,
    })).toBe(false);
  });

  it("keeps command dedupe memory bounded and resets it for a new companion instance", () => {
    const guard = new StudioCompanionCommandGuard();
    guard.bindCompanion(companionA);
    for (let sequence = 1; sequence <= 300; sequence += 1) {
      const command = buildStudioCompanionCommand({
        command: "pen",
        companionInstanceId: companionA,
        targetPrimaryInstanceId: primaryA,
        commandId: `command-${String(sequence).padStart(5, "0")}`,
        sequence,
      }, 10_000);
      expect(guard.accept(command, {
        primaryInstanceId: primaryA,
        companionInstanceId: companionA,
        now: 10_000,
      })).toBe(true);
    }
    expect(guard.snapshot()).toEqual({
      companionInstanceId: companionA,
      lastSequence: 300,
      recentCommandCount: 256,
    });

    guard.bindCompanion(companionB);
    expect(guard.snapshot()).toEqual({
      companionInstanceId: companionB,
      lastSequence: 0,
      recentCommandCount: 0,
    });
    expect(guard.accept(buildStudioCompanionCommand({
      command: "eraser",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      commandId: "command-old-0001",
      sequence: 301,
    }, 10_000), {
      primaryInstanceId: primaryA,
      companionInstanceId: companionB,
      now: 10_000,
    })).toBe(false);
    expect(guard.accept(buildStudioCompanionCommand({
      command: "eraser",
      companionInstanceId: companionB,
      targetPrimaryInstanceId: primaryA,
      commandId: "command-new-0001",
      sequence: 1,
    }, 10_000), {
      primaryInstanceId: primaryA,
      companionInstanceId: companionB,
      now: 10_000,
    })).toBe(true);
  });

  it("binds one primary to only one companion until the binding is explicitly released", () => {
    const binding = new StudioCompanionPrimaryBinding();
    const helloA = buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: null,
    }, 10_000);
    const helloB = buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionB,
      targetPrimaryInstanceId: null,
    }, 10_000);

    expect(binding.acceptHello(helloA, primaryA, 10_000)).toBe(true);
    expect(binding.acceptHello(helloB, primaryA, 10_000)).toBe(false);
    expect(binding.companionInstanceId()).toBe(companionA);
    expect(binding.acceptPing(buildStudioCompanionPing({
      companionInstanceId: companionB,
      targetPrimaryInstanceId: primaryA,
      nonce: "ping-from-b-1234",
    }, 10_001), primaryA, 10_001)).toBe(false);

    expect(binding.acceptHello({ ...helloB, at: 21_999 }, primaryA, 21_999)).toBe(false);
    expect(binding.acceptHello({ ...helloB, at: 22_001 }, primaryA, 22_001)).toBe(true);
    expect(binding.companionInstanceId()).toBe(companionB);

    binding.release();
    expect(binding.acceptHello(helloB, primaryA, 10_002)).toBe(true);
    expect(binding.companionInstanceId()).toBe(companionB);
  });

  it("exposes a full tool palette order", () => {
    expect(STUDIO_COMPANION_TOOL_ORDER).toContain("template");
    expect(STUDIO_COMPANION_TOOL_ORDER).toContain("3d-character");
    expect(STUDIO_COMPANION_TOOL_ORDER.length).toBeGreaterThanOrEqual(8);
  });

  it("creates and parses safe per-primary session ids", () => {
    const generated = createStudioCompanionSessionId();
    expect(isStudioCompanionSessionId(generated)).toBe(true);
    expect(isStudioCompanionSessionId("primary-a-1234")).toBe(true);
    expect(isStudioCompanionSessionId("short")).toBe(false);
    expect(isStudioCompanionSessionId("../../studio?session=steal")).toBe(false);
    expect(parseStudioCompanionSessionId("?session=primary-a-1234")).toBe("primary-a-1234");
    expect(parseStudioCompanionSessionId("?session=short")).toBeNull();
    expect(parseStudioCompanionSessionId("?session=primary-a-1234&session=primary-b-5678")).toBeNull();
  });

  it("isolates channels, URLs and popup names for two Studio primaries", () => {
    const sessionA = primaryA;
    const sessionB = primaryB;
    const createdNames: string[] = [];
    const factory = (name: string) => {
      createdNames.push(name);
      return { postMessage: vi.fn(), close: vi.fn(), onmessage: null };
    };

    createStudioCompanionChannel(sessionA, factory);
    createStudioCompanionChannel(sessionB, factory);

    expect(createdNames).toEqual([
      studioCompanionChannelName(sessionA),
      studioCompanionChannelName(sessionB),
    ]);
    expect(createdNames[0]).not.toBe(createdNames[1]);
    expect(studioCompanionUrl(sessionA, "https://example.com")).toBe(
      "https://example.com/studio/tools-companion?session=primary-a-1234"
    );
    expect(studioCompanionPrimaryUrl(sessionA, "https://example.com")).toBe(
      "https://example.com/studio?session=primary-a-1234"
    );
    expect(studioCompanionUrl(
      sessionA,
      "https://example.com",
      "?id=work-123&remix=source-456"
    )).toBe(
      "https://example.com/studio/tools-companion?session=primary-a-1234&id=work-123"
    );
    expect(studioCompanionPrimaryUrl(
      sessionA,
      "https://example.com",
      "?session=primary-a-1234&id=work-123&remix=source-456"
    )).toBe(
      "https://example.com/studio?session=primary-a-1234&id=work-123"
    );
    expect(studioCompanionPrimaryUrl(
      sessionA,
      "https://example.com",
      "?session=primary-a-1234&remix=source-456"
    )).toBe("https://example.com/studio?session=primary-a-1234&remix=source-456");
    expect(studioCompanionPrimaryUrl(
      sessionA,
      "https://example.com",
      "?return=https%3A%2F%2Fevil.example%2Fsteal&id=https%3A%2F%2Fevil.example"
    )).toBe("https://example.com/studio?session=primary-a-1234");
  });

  it("opens or refocuses a session-specific popup and survives blocked/failing focus", () => {
    const session = "primary-a-1234";
    const focus = vi.fn();
    const popup = {
      focus,
      closed: false,
      location: { href: "http://localhost/studio/tools-companion?session=primary-a-1234" },
    } as unknown as Window;
    const open = vi.fn((_url: string, _name: string, _features: string) => popup);
    const win = openStudioToolsCompanionWindow(session, null, open);
    expect(open).toHaveBeenCalledOnce();
    const call = open.mock.calls[0] as [string, string, string];
    expect(call[0]).toContain("/studio/tools-companion?session=primary-a-1234");
    expect(call[1]).toBe("toonspectrum-studio-tools-primary-a-1234");
    expect(focus).toHaveBeenCalledOnce();
    expect(win).not.toBeNull();

    expect(openStudioToolsCompanionWindow(session, popup, open)).toBe(popup);
    expect(isStudioToolsCompanionWindowReusable(session, popup)).toBe(true);
    expect(open).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledTimes(2);
    expect(openStudioToolsCompanionWindow(session, null, () => null)).toBeNull();
    expect(openStudioToolsCompanionWindow(session, null, () => {
      throw new Error("blocked");
    })).toBeNull();

    const focusThrows = {
      closed: false,
      focus: vi.fn(() => { throw new Error("focus denied"); }),
      location: { href: "http://localhost/studio/tools-companion?session=primary-a-1234" },
    } as unknown as Window;
    expect(openStudioToolsCompanionWindow(session, focusThrows, open)).toBe(focusThrows);
    expect(open).toHaveBeenCalledOnce();
  });

  it("recovers a live cached popup that was navigated away from its companion session", () => {
    const session = "primary-a-1234";
    const recovered = {
      closed: false,
      focus: vi.fn(),
      location: { href: "http://localhost/studio/tools-companion?session=primary-a-1234" },
    } as unknown as Window;
    const open = vi.fn((_url: string, _name: string, _features: string) => recovered);
    const wrongPath = {
      closed: false,
      focus: vi.fn(),
      location: { href: "http://localhost/studio" },
    } as unknown as Window;

    expect(openStudioToolsCompanionWindow(session, wrongPath, open)).toBe(recovered);
    expect(isStudioToolsCompanionWindowReusable(session, wrongPath)).toBe(false);
    expect(wrongPath.focus).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0]?.[0]).toContain(
      "/studio/tools-companion?session=primary-a-1234"
    );
    expect(open.mock.calls[0]?.[1]).toBe("toonspectrum-studio-tools-primary-a-1234");

    for (const href of [
      "http://localhost/studio/tools-companion?session=primary-b-5678",
      "http://localhost/studio/tools-companion?session=primary-a-1234&id=wrong-work",
      "http://localhost/studio/tools-companion?session=primary-a-1234&remix=wrong-remix",
    ]) {
      const wrongScope = {
        closed: false,
        focus: vi.fn(),
        location: { href },
      } as unknown as Window;
      open.mockClear();
      expect(openStudioToolsCompanionWindow(session, wrongScope, open)).toBe(recovered);
      expect(wrongScope.focus).not.toHaveBeenCalled();
      expect(open).toHaveBeenCalledOnce();
    }

    vi.stubGlobal("location", {
      origin: "http://localhost",
      search: "?id=expected-work",
    });
    try {
      const previousWork = {
        closed: false,
        focus: vi.fn(),
        location: {
          href: "http://localhost/studio/tools-companion?session=primary-a-1234&id=previous-work",
        },
      } as unknown as Window;
      open.mockClear();
      expect(openStudioToolsCompanionWindow(session, previousWork, open)).toBe(recovered);
      expect(previousWork.focus).not.toHaveBeenCalled();
      expect(open).toHaveBeenCalledOnce();
      expect(open.mock.calls[0]?.[0]).toContain("id=expected-work");
    } finally {
      vi.unstubAllGlobals();
    }

    const crossOrigin = {
      closed: false,
      focus: vi.fn(),
      get location() {
        throw new DOMException("Blocked a frame with origin", "SecurityError");
      },
    } as unknown as Window;
    open.mockClear();
    expect(openStudioToolsCompanionWindow(session, crossOrigin, open)).toBe(recovered);
    expect(crossOrigin.focus).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledOnce();
  });
});
