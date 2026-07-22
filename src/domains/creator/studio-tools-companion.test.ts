import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildStudioCompanionCommand,
  buildStudioCompanionControl,
  buildStudioCompanionHello,
  buildStudioCompanionNavigatorFrame,
  buildStudioCompanionPing,
  buildStudioCompanionPong,
  buildStudioCompanionPrimaryState,
  buildStudioCompanionReviewState,
  completeReservedStudioToolsCompanionWindow,
  createStudioCompanionReviewProjection,
  createStudioCompanionChannel,
  createStudioCompanionSessionId,
  isStudioCompanionMessage,
  isStudioCompanionMessageFresh,
  isStudioCompanionSessionId,
  isStudioToolsCompanionWindowReusable,
  openReadyStudioToolsCompanionForMenu,
  openStudioToolsCompanionWindow,
  parseStudioCompanionSessionId,
  parseStudioCompanionMessage,
  STUDIO_COMPANION_TOOL_ORDER,
  studioCompanionChannelName,
  studioCompanionPrimaryUrl,
  studioCompanionUrl,
  startStudioCompanionPrimaryRuntime,
  StudioCompanionCommandGuard,
  StudioCompanionPrimaryBinding,
  type StudioCompanionMessage,
} from "./studio-tools-companion";

const primaryA = "primary-a-1234";
const primaryB = "primary-b-5678";
const companionA = "companion-a-1234";
const companionB = "companion-b-5678";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function reviewProjection(overrides: {
  revision?: number;
  documentRevision?: number;
  captureAllowed?: boolean;
} = {}) {
  return createStudioCompanionReviewProjection({
    revision: overrides.revision ?? 1,
    documentRevision: overrides.documentRevision ?? 1,
    pageLabel: "1화",
    selectionLabel: "선화",
    canUndo: true,
    canRedo: false,
    captureAllowed: overrides.captureAllowed ?? true,
    viewport: { x: 0, y: 0.1, width: 0.8, height: 0.4 },
    layers: [{ id: "layer-1", label: "선화", type: "draw", selected: true }],
    historyLength: 2,
    historyIndex: 1,
    comments: [{ id: "thread-1", author: "편집자", body: "눈썹 확인", unread: true }],
    brush: {
      id: "pen",
      label: "펜",
      size: 6,
      opacity: 1,
      color: "#112233",
      choices: [{ id: "pencil", label: "연필" }],
    },
  });
}

class RuntimeBroadcastChannel {
  static instances: RuntimeBroadcastChannel[] = [];

  readonly postMessage = vi.fn();
  readonly close = vi.fn();
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(readonly name: string) {
    RuntimeBroadcastChannel.instances.push(this);
  }

  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

function demandNavigator(input: {
  channel: RuntimeBroadcastChannel;
  primaryInstanceId: string;
  companionInstanceId: string;
  generation?: number;
  sequence?: number;
  active?: boolean;
}): void {
  input.channel.emit(buildStudioCompanionControl({
    control: { kind: "navigator-demand", active: input.active ?? true },
    generation: input.generation ?? 1,
    companionInstanceId: input.companionInstanceId,
    targetPrimaryInstanceId: input.primaryInstanceId,
    commandId: `navigator-demand-${input.sequence ?? 1}`,
    sequence: input.sequence ?? 1,
  }));
}

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

  it("keeps ready-window recovery and reserved-window completion inside the lazy protocol", () => {
    const wrongWindow = {
      closed: false,
      close: vi.fn(),
      focus: vi.fn(),
      location: { href: "http://localhost/studio" },
    } as unknown as Window;
    const recoveredWindow = {
      closed: false,
      focus: vi.fn(),
      location: { href: "http://localhost/studio/tools-companion?session=primary-a-1234" },
    } as unknown as Window;
    const open = vi.fn(() => recoveredWindow);
    vi.stubGlobal("window", { open });
    const binding = new StudioCompanionPrimaryBinding();
    const release = vi.spyOn(binding, "release");
    const announce = vi.fn();
    const windowRef = { current: wrongWindow as Window | null };

    openReadyStudioToolsCompanionForMenu({
      sessionId: primaryA,
      windowRef,
      binding,
      announce,
    });

    expect(release).toHaveBeenCalledOnce();
    expect(windowRef.current).toBe(recoveredWindow);
    expect(announce).toHaveBeenLastCalledWith(expect.stringContaining("복구"));

    const replace = vi.fn();
    const reservation = {
      closed: false,
      close: vi.fn(),
      focus: vi.fn(() => { throw new Error("focus denied"); }),
      location: { href: "about:blank", replace },
      name: "",
    } as unknown as Window;
    windowRef.current = reservation;
    completeReservedStudioToolsCompanionWindow({
      sessionId: primaryA,
      reservation,
      windowRef,
      announce,
    });

    expect(reservation.name).toBe("toonspectrum-studio-tools-primary-a-1234");
    expect(replace).toHaveBeenCalledWith(expect.stringContaining(
      "/studio/tools-companion?session=primary-a-1234"
    ));
    expect(reservation.close).not.toHaveBeenCalled();
    expect(announce).toHaveBeenLastCalledWith(expect.stringContaining("열었습니다"));

    const staleReservation = { close: vi.fn() } as unknown as Window;
    completeReservedStudioToolsCompanionWindow({
      sessionId: primaryA,
      reservation: staleReservation,
      windowRef,
      announce,
    });
    expect(staleReservation.close).toHaveBeenCalledOnce();
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

  it("parses bounded review, navigator and control messages with exact nested shapes", () => {
    const projection = reviewProjection();
    const review = buildStudioCompanionReviewState({
      primaryInstanceId: primaryA,
      targetCompanionInstanceId: companionA,
      generation: 1,
      projection,
      now: 1_000,
    });
    const frame = buildStudioCompanionNavigatorFrame({
      primaryInstanceId: primaryA,
      targetCompanionInstanceId: companionA,
      frame: {
        generation: 1,
        revision: 1,
        sequence: 1,
        width: 1280,
        height: 720,
        blob: new Blob([new Uint8Array(32)], { type: "image/webp" }),
      },
      now: 1_001,
    });
    const control = buildStudioCompanionControl({
      control: { kind: "brush", patch: { size: 12, opacity: 0.5 } },
      generation: 1,
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      commandId: "control-command-1234",
      sequence: 1,
    }, 1_002);

    expect(parseStudioCompanionMessage(review)).toEqual(review);
    expect(parseStudioCompanionMessage(frame)).toEqual(frame);
    expect(parseStudioCompanionMessage(control)).toEqual(control);
    expect(parseStudioCompanionMessage({ ...review, extra: true })).toBeNull();
    expect(parseStudioCompanionMessage({
      ...review,
      projection: { ...projection, brush: { ...projection.brush, extra: true } },
    })).toBeNull();
    expect(parseStudioCompanionMessage({
      ...frame,
      blob: new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: "image/webp" }),
    })).toBeNull();
    expect(parseStudioCompanionMessage({
      ...control,
      control: { kind: "brush", patch: { size: 12, extra: true } },
    })).toBeNull();
  });

  it("shares one sequence fence across legacy and review controls without poisoning on rejection", () => {
    const binding = new StudioCompanionPrimaryBinding();
    expect(binding.acceptHello(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
    }, 10_000), primaryA, 10_000)).toBe(true);

    const firstControl = buildStudioCompanionControl({
      control: { kind: "navigate", point: { x: 0.25, y: 0.75 } },
      generation: 1,
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      commandId: "control-command-0001",
      sequence: 1,
    }, 10_001);
    expect(binding.acceptControl(firstControl, primaryA, 1, 10_001)).toBe(true);

    const legacy = buildStudioCompanionCommand({
      command: "pen",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      commandId: "legacy-command-0002",
      sequence: 2,
    }, 10_002);
    expect(binding.acceptCommand(legacy, primaryA, 10_002)).toBe(true);
    expect(binding.acceptControl(firstControl, primaryA, 1, 10_003)).toBe(false);

    const wrongGeneration = buildStudioCompanionControl({
      control: { kind: "history", action: "undo" },
      generation: 2,
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      commandId: "control-command-0003",
      sequence: 3,
    }, 10_003);
    expect(binding.acceptControl(wrongGeneration, primaryA, 1, 10_003)).toBe(false);
    expect(binding.acceptControl({ ...wrongGeneration, generation: 1 }, primaryA, 1, 10_004))
      .toBe(true);

    const wrongTarget = buildStudioCompanionControl({
      control: { kind: "select-layer", layerId: "layer-1" },
      generation: 1,
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryB,
      commandId: "control-command-0004",
      sequence: 4,
    }, 10_005);
    expect(binding.acceptControl(wrongTarget, primaryA, 1, 10_005)).toBe(false);
    expect(binding.acceptControl({ ...wrongTarget, targetPrimaryInstanceId: primaryA }, primaryA, 1, 10_006))
      .toBe(true);
  });

  it("publishes a bounded projection after handshake and captures only after an active stroke ends", async () => {
    RuntimeBroadcastChannel.instances.length = 0;
    vi.stubGlobal("BroadcastChannel", RuntimeBroadcastChannel);
    let projection = reviewProjection({ captureAllowed: false, documentRevision: 7 });
    const capture = vi.fn(async (request: {
      generation: number;
      revision: number;
      sequence: number;
    }) => ({
      generation: request.generation,
      revision: request.revision,
      sequence: request.sequence,
      width: 640,
      height: 960,
      blob: new Blob([new Uint8Array(32)], { type: "image/webp" }),
    }));
    const runtime = startStudioCompanionPrimaryRuntime({
      search: `?session=${primaryA}`,
      getSnapshot: () => ({
        tool: "pen",
        density: "full",
        canvasOnly: false,
        title: "1화",
      }),
      getReviewProjection: () => projection,
      captureNavigatorFrame: capture,
      onCommand: vi.fn(),
      onControl: vi.fn(),
    });
    expect(runtime).not.toBeNull();
    const channel = RuntimeBroadcastChannel.instances[0]!;
    const initialHello = channel.postMessage.mock.calls[0]?.[0] as StudioCompanionMessage;
    expect(initialHello.type).toBe("hello");
    if (initialHello.type !== "hello" || initialHello.role !== "primary") {
      throw new Error("primary hello missing");
    }
    channel.emit(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: initialHello.primaryInstanceId,
    }));
    demandNavigator({
      channel,
      primaryInstanceId: initialHello.primaryInstanceId,
      companionInstanceId: companionA,
    });

    expect(channel.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "primary-review-state",
      generation: 1,
      projection,
    }));
    expect(capture).not.toHaveBeenCalled();

    projection = reviewProjection({
      revision: 2,
      documentRevision: 7,
      captureAllowed: true,
    });
    runtime?.publish();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(channel.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "navigator-frame",
        generation: 1,
        revision: 7,
      })
    ));
    runtime?.dispose();
  });

  it("fails closed on navigator controls while the primary drawing surface is active", () => {
    RuntimeBroadcastChannel.instances.length = 0;
    vi.stubGlobal("BroadcastChannel", RuntimeBroadcastChannel);
    let projection = reviewProjection({ captureAllowed: false, documentRevision: 8 });
    const onControl = vi.fn();
    const runtime = startStudioCompanionPrimaryRuntime({
      search: `?session=${primaryA}`,
      getSnapshot: () => ({
        tool: "pen",
        density: "full",
        canvasOnly: false,
        title: "1화",
      }),
      getReviewProjection: () => projection,
      onCommand: vi.fn(),
      onControl,
    });
    const channel = RuntimeBroadcastChannel.instances[0]!;
    const initialHello = channel.postMessage.mock.calls[0]?.[0] as Extract<
      StudioCompanionMessage,
      { type: "hello"; role: "primary" }
    >;
    channel.emit(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: initialHello.primaryInstanceId,
    }));
    demandNavigator({
      channel,
      primaryInstanceId: initialHello.primaryInstanceId,
      companionInstanceId: companionA,
    });
    channel.emit(buildStudioCompanionControl({
      control: { kind: "navigate", point: { x: 0.25, y: 0.75 } },
      generation: 1,
      companionInstanceId: companionA,
      targetPrimaryInstanceId: initialHello.primaryInstanceId,
      commandId: "navigate-command-0001",
      sequence: 2,
    }));
    expect(onControl).not.toHaveBeenCalled();

    projection = reviewProjection({ captureAllowed: true, documentRevision: 8 });
    channel.emit(buildStudioCompanionControl({
      control: { kind: "navigate", point: { x: 0.5, y: 0.5 } },
      generation: 1,
      companionInstanceId: companionA,
      targetPrimaryInstanceId: initialHello.primaryInstanceId,
      commandId: "navigate-command-0002",
      sequence: 3,
    }));
    expect(onControl).toHaveBeenCalledOnce();
    expect(onControl).toHaveBeenCalledWith({ kind: "navigate", point: { x: 0.5, y: 0.5 } });

    demandNavigator({
      channel,
      primaryInstanceId: initialHello.primaryInstanceId,
      companionInstanceId: companionA,
      active: false,
      sequence: 4,
    });
    channel.emit(buildStudioCompanionControl({
      control: { kind: "navigate", point: { x: 0.75, y: 0.25 } },
      generation: 1,
      companionInstanceId: companionA,
      targetPrimaryInstanceId: initialHello.primaryInstanceId,
      commandId: "navigate-command-0005",
      sequence: 5,
    }));
    expect(onControl).toHaveBeenCalledOnce();
    runtime?.dispose();
  });

  it("captures only on navigator demand and drops demand after leave or lease expiry", async () => {
    vi.useFakeTimers({ now: 10_000 });
    RuntimeBroadcastChannel.instances.length = 0;
    vi.stubGlobal("BroadcastChannel", RuntimeBroadcastChannel);
    let projection = reviewProjection({ documentRevision: 20, captureAllowed: true });
    const pending: Array<{
      request: { signal: AbortSignal };
      resolve: (value: null) => void;
    }> = [];
    const capture = vi.fn((request: { signal: AbortSignal }) => new Promise<null>((resolve) => {
      pending.push({ request, resolve });
    }));
    const runtime = startStudioCompanionPrimaryRuntime({
      search: `?session=${primaryA}`,
      getSnapshot: () => ({
        tool: "select",
        density: "full",
        canvasOnly: false,
        title: "1화",
      }),
      getReviewProjection: () => projection,
      captureNavigatorFrame: capture,
      onCommand: vi.fn(),
    });
    const channel = RuntimeBroadcastChannel.instances[0]!;
    const initialHello = channel.postMessage.mock.calls[0]?.[0] as Extract<
      StudioCompanionMessage,
      { type: "hello"; role: "primary" }
    >;
    channel.emit(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: initialHello.primaryInstanceId,
    }));
    await Promise.resolve();
    expect(capture).not.toHaveBeenCalled();

    demandNavigator({
      channel,
      primaryInstanceId: initialHello.primaryInstanceId,
      companionInstanceId: companionA,
    });
    await Promise.resolve();
    expect(capture).toHaveBeenCalledOnce();
    demandNavigator({
      channel,
      primaryInstanceId: initialHello.primaryInstanceId,
      companionInstanceId: companionA,
      active: false,
      sequence: 2,
    });
    expect(pending[0]?.request.signal.aborted).toBe(true);
    projection = reviewProjection({ revision: 2, documentRevision: 21, captureAllowed: true });
    runtime?.publish();
    await Promise.resolve();
    expect(capture).toHaveBeenCalledOnce();

    demandNavigator({
      channel,
      primaryInstanceId: initialHello.primaryInstanceId,
      companionInstanceId: companionA,
      sequence: 3,
    });
    await Promise.resolve();
    expect(capture).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(12_001);
    runtime?.publish();
    expect(pending[1]?.request.signal.aborted).toBe(true);
    expect(runtime?.binding.companionInstanceId()).toBeNull();

    channel.emit(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionB,
      targetPrimaryInstanceId: initialHello.primaryInstanceId,
    }));
    await Promise.resolve();
    expect(runtime?.generation()).toBe(2);
    expect(capture).toHaveBeenCalledTimes(2);
    runtime?.dispose();
    pending.forEach(({ resolve }) => resolve(null));
  });

  it.each(["null", "reject"] as const)(
    "opens a capture circuit after three %s results and retries on the next document revision",
    async (failureMode) => {
      vi.useFakeTimers({ now: 10_000 });
      RuntimeBroadcastChannel.instances.length = 0;
      vi.stubGlobal("BroadcastChannel", RuntimeBroadcastChannel);
      let projection = reviewProjection({ documentRevision: 9 });
      const capture = vi.fn(async () => {
        if (failureMode === "reject") throw new Error("encoder unavailable");
        return null;
      });
      const runtime = startStudioCompanionPrimaryRuntime({
        search: `?session=${primaryA}`,
        getSnapshot: () => ({
          tool: "select",
          density: "full",
          canvasOnly: false,
          title: "1화",
        }),
        getReviewProjection: () => projection,
        captureNavigatorFrame: capture,
        onCommand: vi.fn(),
      });
      const channel = RuntimeBroadcastChannel.instances[0]!;
      const initialHello = channel.postMessage.mock.calls[0]?.[0] as Extract<
        StudioCompanionMessage,
        { type: "hello"; role: "primary" }
      >;
      channel.emit(buildStudioCompanionHello({
        role: "companion",
        companionInstanceId: companionA,
        targetPrimaryInstanceId: initialHello.primaryInstanceId,
      }));
      demandNavigator({
        channel,
        primaryInstanceId: initialHello.primaryInstanceId,
        companionInstanceId: companionA,
      });

      await vi.runAllTimersAsync();
      expect(capture).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(9_000);
      expect(capture).toHaveBeenCalledTimes(3);

      projection = reviewProjection({ revision: 2, documentRevision: 10 });
      runtime?.publish();
      await Promise.resolve();
      await Promise.resolve();
      expect(capture).toHaveBeenCalledTimes(4);
      runtime?.dispose();
    }
  );

  it("aborts stale-generation and timed-out captures and never posts their late frames", async () => {
    vi.useFakeTimers({ now: 10_000 });
    RuntimeBroadcastChannel.instances.length = 0;
    vi.stubGlobal("BroadcastChannel", RuntimeBroadcastChannel);
    const pending: Array<{
      request: { generation: number; revision: number; sequence: number; signal: AbortSignal };
      resolve: (value: {
        generation: number;
        revision: number;
        sequence: number;
        width: number;
        height: number;
        blob: Blob;
      } | null) => void;
    }> = [];
    const runtime = startStudioCompanionPrimaryRuntime({
      search: `?session=${primaryA}`,
      getSnapshot: () => ({
        tool: "select",
        density: "full",
        canvasOnly: false,
        title: "1화",
      }),
      getReviewProjection: () => reviewProjection({ documentRevision: 9 }),
      captureNavigatorFrame: (request) => new Promise((resolve) => {
        pending.push({ request, resolve });
      }),
      onCommand: vi.fn(),
    });
    const channel = RuntimeBroadcastChannel.instances[0]!;
    const initialHello = channel.postMessage.mock.calls[0]?.[0] as Extract<
      StudioCompanionMessage,
      { type: "hello"; role: "primary" }
    >;
    channel.emit(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: initialHello.primaryInstanceId,
    }));
    demandNavigator({
      channel,
      primaryInstanceId: initialHello.primaryInstanceId,
      companionInstanceId: companionA,
    });
    await Promise.resolve();
    expect(pending).toHaveLength(1);

    vi.advanceTimersByTime(12_001);
    channel.emit(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionB,
      targetPrimaryInstanceId: initialHello.primaryInstanceId,
    }));
    await Promise.resolve();
    expect(pending[0]?.request.signal.aborted).toBe(true);
    expect(pending).toHaveLength(1);
    demandNavigator({
      channel,
      primaryInstanceId: initialHello.primaryInstanceId,
      companionInstanceId: companionB,
      generation: 2,
    });
    await Promise.resolve();
    expect(pending).toHaveLength(2);
    pending[0]?.resolve({
      generation: 1,
      revision: 9,
      sequence: 1,
      width: 320,
      height: 480,
      blob: new Blob([new Uint8Array(32)], { type: "image/webp" }),
    });
    await Promise.resolve();
    expect(channel.postMessage.mock.calls.map(([message]) => message).some((message) => (
      (message as StudioCompanionMessage).type === "navigator-frame"
      && (message as Extract<StudioCompanionMessage, { type: "navigator-frame" }>).generation === 1
    ))).toBe(false);

    vi.advanceTimersByTime(5_000);
    await Promise.resolve();
    expect(pending[1]?.request.signal.aborted).toBe(true);
    runtime?.dispose();
    pending[1]?.resolve({
      generation: 2,
      revision: 9,
      sequence: 2,
      width: 320,
      height: 480,
      blob: new Blob([new Uint8Array(32)], { type: "image/webp" }),
    });
    await Promise.resolve();
    expect(channel.postMessage.mock.calls.map(([message]) => message).some((message) => (
      (message as StudioCompanionMessage).type === "navigator-frame"
    ))).toBe(false);
  });
});
