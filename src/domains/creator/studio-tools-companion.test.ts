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
  openStudioCompanionSurfaceWindow,
  openStudioToolsCompanionWindow,
  parseStudioCompanionSurface,
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
const navigatorA = "navigator-a-1234";
const navigatorB = "navigator-b-5678";
const reviewA = "review-peer-a-1234";

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

    const navigatorHello = buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: navigatorA,
      targetPrimaryInstanceId: primaryA,
      surface: "navigator",
    }, 101);
    expect(navigatorHello).toEqual({
      v: 1,
      type: "hello",
      role: "companion",
      companionInstanceId: navigatorA,
      targetPrimaryInstanceId: primaryA,
      view: "navigator",
      at: 101,
    });
    expect(parseStudioCompanionMessage(navigatorHello)).toEqual(navigatorHello);
    expect(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      surface: "workspace",
    }, 102)).not.toHaveProperty("view");

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
    const validCompanionHello = buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: navigatorA,
      targetPrimaryInstanceId: primaryA,
      surface: "navigator",
    }, 1);
    expect(parseStudioCompanionMessage({ ...validCompanionHello, view: "canvas" })).toBeNull();
    expect(parseStudioCompanionMessage({ ...validCompanionHello, view: null })).toBeNull();
    expect(parseStudioCompanionMessage({ ...validCompanionHello, extra: true })).toBeNull();
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

  it("binds one live companion per surface while preserving independent leases", () => {
    const binding = new StudioCompanionPrimaryBinding();
    const workspaceHello = buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: null,
    }, 10_000);
    const competingWorkspaceHello = buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionB,
      targetPrimaryInstanceId: null,
    }, 10_000);
    const navigatorHello = buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: navigatorA,
      targetPrimaryInstanceId: primaryA,
      surface: "navigator",
    }, 10_000);
    const reviewHello = buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: reviewA,
      targetPrimaryInstanceId: primaryA,
      surface: "review",
    }, 10_000);

    expect(binding.acceptHello(workspaceHello, primaryA, 10_000)).toBe(true);
    expect(binding.acceptHello(navigatorHello, primaryA, 10_000)).toBe(true);
    expect(binding.acceptHello(reviewHello, primaryA, 10_000)).toBe(true);
    expect(binding.acceptHello(competingWorkspaceHello, primaryA, 10_000)).toBe(false);
    expect(binding.companionInstanceId()).toBe(companionA);
    expect(binding.companionInstanceId("navigator")).toBe(navigatorA);
    expect(binding.companionInstanceId("review")).toBe(reviewA);
    expect(binding.activeBindings()).toHaveLength(3);
    expect(binding.generation()).toBe(1);
    expect(binding.generation("navigator")).toBe(1);
    expect(binding.generation("review")).toBe(1);

    expect(binding.acceptHello(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      surface: "navigator",
    }, 10_001), primaryA, 10_001)).toBe(false);
    expect(binding.acceptPing(buildStudioCompanionPing({
      companionInstanceId: navigatorB,
      targetPrimaryInstanceId: primaryA,
      nonce: "ping-from-b-1234",
    }, 10_001), primaryA, 10_001)).toBe(false);

    expect(binding.acceptHello({ ...competingWorkspaceHello, at: 21_999 }, primaryA, 21_999))
      .toBe(false);
    expect(binding.acceptHello({ ...competingWorkspaceHello, at: 22_001 }, primaryA, 22_001))
      .toBe(true);
    expect(binding.companionInstanceId()).toBe(companionB);
    expect(binding.generation()).toBe(2);
    expect(binding.companionInstanceId("navigator")).toBe(navigatorA);
    expect(binding.companionInstanceId("review")).toBe(reviewA);
    expect(binding.generation("navigator")).toBe(1);
    expect(binding.generation("review")).toBe(1);

    binding.release("workspace");
    expect(binding.companionInstanceId()).toBeNull();
    expect(binding.companionInstanceId("navigator")).toBe(navigatorA);
    expect(binding.acceptHello(competingWorkspaceHello, primaryA, 10_002)).toBe(true);
    expect(binding.companionInstanceId()).toBe(companionB);
    expect(binding.generation()).toBe(3);
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
    expect(parseStudioCompanionSurface("?session=primary-a-1234")).toBe("workspace");
    expect(parseStudioCompanionSurface("?session=primary-a-1234&view=navigator")).toBe("navigator");
    expect(parseStudioCompanionSurface("?view=review")).toBe("review");
    expect(parseStudioCompanionSurface("?view=unknown")).toBeNull();
    expect(parseStudioCompanionSurface("?view=navigator&view=review")).toBeNull();
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

  it("isolates workspace, Navigator and Review popup URLs, names and reuse", () => {
    const makePopup = (href: string) => ({
      closed: false,
      focus: vi.fn(),
      location: { href },
    }) as unknown as Window;
    const navigatorPopup = makePopup(
      "http://localhost/studio/tools-companion?session=primary-a-1234&view=navigator"
    );
    const reviewPopup = makePopup(
      "http://localhost/studio/tools-companion?session=primary-a-1234&view=review"
    );
    const openNavigator = vi.fn(() => navigatorPopup);
    const openReview = vi.fn(() => reviewPopup);

    expect(openStudioCompanionSurfaceWindow(
      primaryA,
      "navigator",
      null,
      openNavigator
    )).toBe(navigatorPopup);
    expect(openNavigator).toHaveBeenCalledWith(
      expect.stringContaining("view=navigator"),
      "toonspectrum-studio-tools-primary-a-1234-navigator",
      expect.any(String)
    );
    expect(isStudioToolsCompanionWindowReusable(primaryA, navigatorPopup, "navigator")).toBe(true);
    expect(isStudioToolsCompanionWindowReusable(primaryA, navigatorPopup, "review")).toBe(false);

    expect(openStudioCompanionSurfaceWindow(primaryA, "review", null, openReview)).toBe(reviewPopup);
    expect(openReview).toHaveBeenCalledWith(
      expect.stringContaining("view=review"),
      "toonspectrum-studio-tools-primary-a-1234-review",
      expect.any(String)
    );
    expect(studioCompanionUrl(primaryA, "https://example.com")).not.toContain("view=");
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
    expect(binding.acceptHello(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: navigatorA,
      targetPrimaryInstanceId: primaryA,
      surface: "navigator",
    }, Date.now()), primaryA)).toBe(true);
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
    expect(release).toHaveBeenCalledWith("workspace");
    expect(binding.companionInstanceId("navigator")).toBe(navigatorA);
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
    expect(binding.acceptControl(firstControl, primaryA, 10_001)).toBe(true);

    const legacy = buildStudioCompanionCommand({
      command: "pen",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      commandId: "legacy-command-0002",
      sequence: 2,
    }, 10_002);
    expect(binding.acceptCommand(legacy, primaryA, 10_002)).toBe(true);
    expect(binding.acceptControl(firstControl, primaryA, 10_003)).toBe(false);

    const wrongGeneration = buildStudioCompanionControl({
      control: { kind: "history", action: "undo" },
      generation: 2,
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      commandId: "control-command-0003",
      sequence: 3,
    }, 10_003);
    expect(binding.acceptControl(wrongGeneration, primaryA, 10_003)).toBe(false);
    expect(binding.acceptControl({ ...wrongGeneration, generation: 1 }, primaryA, 10_004))
      .toBe(true);

    const wrongTarget = buildStudioCompanionControl({
      control: { kind: "select-layer", layerId: "layer-1" },
      generation: 1,
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryB,
      commandId: "control-command-0004",
      sequence: 4,
    }, 10_005);
    expect(binding.acceptControl(wrongTarget, primaryA, 10_005)).toBe(false);
    expect(binding.acceptControl({ ...wrongTarget, targetPrimaryInstanceId: primaryA }, primaryA, 10_006))
      .toBe(true);
  });

  it("isolates replay fences per surface and rejects cross-surface controls before sequencing", () => {
    const binding = new StudioCompanionPrimaryBinding();
    for (const [surface, companionInstanceId] of [
      ["workspace", companionA],
      ["navigator", navigatorA],
      ["review", reviewA],
    ] as const) {
      expect(binding.acceptHello(buildStudioCompanionHello({
        role: "companion",
        companionInstanceId,
        targetPrimaryInstanceId: primaryA,
        surface,
      }, 10_000), primaryA, 10_000)).toBe(true);
    }

    const navigatorHistory = buildStudioCompanionControl({
      control: { kind: "history", action: "undo" },
      generation: 1,
      companionInstanceId: navigatorA,
      targetPrimaryInstanceId: primaryA,
      commandId: "navigator-invalid-0001",
      sequence: 1,
    }, 10_001);
    expect(binding.acceptControl(navigatorHistory, primaryA, 10_001)).toBe(false);
    expect(binding.acceptControl(buildStudioCompanionControl({
      control: { kind: "navigator-demand", active: true },
      generation: 1,
      companionInstanceId: navigatorA,
      targetPrimaryInstanceId: primaryA,
      commandId: "navigator-valid-0001",
      sequence: 1,
    }, 10_002), primaryA, 10_002)).toBe(true);

    const reviewNavigate = buildStudioCompanionControl({
      control: { kind: "navigate", point: { x: 0.5, y: 0.5 } },
      generation: 1,
      companionInstanceId: reviewA,
      targetPrimaryInstanceId: primaryA,
      commandId: "review-invalid-0001",
      sequence: 1,
    }, 10_001);
    expect(binding.acceptControl(reviewNavigate, primaryA, 10_001)).toBe(false);
    expect(binding.acceptControl(buildStudioCompanionControl({
      control: { kind: "brush", patch: { size: 8 } },
      generation: 1,
      companionInstanceId: reviewA,
      targetPrimaryInstanceId: primaryA,
      commandId: "review-valid-0001",
      sequence: 1,
    }, 10_002), primaryA, 10_002)).toBe(true);

    expect(binding.acceptCommand(buildStudioCompanionCommand({
      command: "pen",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      commandId: "workspace-command-0001",
      sequence: 1,
    }, 10_003), primaryA, 10_003)).toBe(true);
    expect(binding.acceptCommand(buildStudioCompanionCommand({
      command: "pen",
      companionInstanceId: reviewA,
      targetPrimaryInstanceId: primaryA,
      commandId: "review-command-0002",
      sequence: 2,
    }, 10_004), primaryA, 10_004)).toBe(false);
    expect(binding.acceptCommand(buildStudioCompanionCommand({
      command: "focus-primary",
      companionInstanceId: reviewA,
      targetPrimaryInstanceId: primaryA,
      commandId: "review-focus-0002",
      sequence: 2,
    }, 10_005), primaryA, 10_005)).toBe(true);
  });

  it("expires stale surfaces independently and keeps generation monotonic per surface", () => {
    const binding = new StudioCompanionPrimaryBinding();
    expect(binding.acceptHello(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
    }, 10_000), primaryA, 10_000)).toBe(true);
    expect(binding.acceptHello(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: navigatorA,
      targetPrimaryInstanceId: primaryA,
      surface: "navigator",
    }, 10_000), primaryA, 10_000)).toBe(true);
    expect(binding.acceptHello(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: reviewA,
      targetPrimaryInstanceId: primaryA,
      surface: "review",
    }, 10_000), primaryA, 10_000)).toBe(true);
    expect(binding.acceptPing(buildStudioCompanionPing({
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryA,
      nonce: "workspace-ping-0001",
    }, 20_000), primaryA, 20_000)).toBe(true);
    expect(binding.acceptPing(buildStudioCompanionPing({
      companionInstanceId: reviewA,
      targetPrimaryInstanceId: primaryA,
      nonce: "review-peer-ping-01",
    }, 20_000), primaryA, 20_000)).toBe(true);

    expect(binding.expireStale(22_001)).toEqual([
      expect.objectContaining({ surface: "navigator", companionInstanceId: navigatorA }),
    ]);
    expect(binding.companionInstanceId()).toBe(companionA);
    expect(binding.companionInstanceId("navigator")).toBeNull();
    expect(binding.companionInstanceId("review")).toBe(reviewA);
    expect(binding.acceptHello(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: navigatorB,
      targetPrimaryInstanceId: primaryA,
      surface: "navigator",
    }, 22_002), primaryA, 22_002)).toBe(true);
    expect(binding.generation("navigator")).toBe(2);
    expect(binding.generation()).toBe(1);
    expect(binding.generation("review")).toBe(1);
    const staleGenerationControl = buildStudioCompanionControl({
      control: { kind: "navigator-demand", active: true },
      generation: 1,
      companionInstanceId: navigatorB,
      targetPrimaryInstanceId: primaryA,
      commandId: "navigator-stale-0001",
      sequence: 1,
    }, 22_003);
    expect(binding.acceptControl(staleGenerationControl, primaryA, 22_003)).toBe(false);
    expect(binding.acceptControl({
      ...staleGenerationControl,
      generation: 2,
      commandId: "navigator-fresh-0001",
    }, primaryA, 22_004)).toBe(true);
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

  it("fans one projection out to all bound surfaces with target-specific generations", () => {
    RuntimeBroadcastChannel.instances.length = 0;
    vi.stubGlobal("BroadcastChannel", RuntimeBroadcastChannel);
    const fullProjection = reviewProjection({ documentRevision: 12 });
    const getReviewProjection = vi.fn(() => fullProjection);
    const runtime = startStudioCompanionPrimaryRuntime({
      search: `?session=${primaryA}`,
      getSnapshot: () => ({
        tool: "pen",
        density: "full",
        canvasOnly: false,
        title: "1화",
      }),
      getReviewProjection,
      onCommand: vi.fn(),
      onControl: vi.fn(),
    });
    const channel = RuntimeBroadcastChannel.instances[0]!;
    const initialHello = channel.postMessage.mock.calls[0]?.[0] as Extract<
      StudioCompanionMessage,
      { type: "hello"; role: "primary" }
    >;
    for (const [surface, companionInstanceId] of [
      ["workspace", companionA],
      ["navigator", navigatorA],
      ["review", reviewA],
    ] as const) {
      channel.emit(buildStudioCompanionHello({
        role: "companion",
        companionInstanceId,
        targetPrimaryInstanceId: initialHello.primaryInstanceId,
        surface,
      }));
    }

    channel.postMessage.mockClear();
    getReviewProjection.mockClear();
    runtime?.publish();
    const messages = channel.postMessage.mock.calls.map(([message]) => message as StudioCompanionMessage);
    expect(getReviewProjection).toHaveBeenCalledOnce();
    expect(messages.filter((message) => message.type === "primary-state").map((message) => (
      message.type === "primary-state" ? message.targetCompanionInstanceId : ""
    ))).toEqual([companionA, navigatorA, reviewA]);
    expect(messages.filter((message) => message.type === "primary-review-state").map((message) => (
      message.type === "primary-review-state"
        ? [message.targetCompanionInstanceId, message.generation]
        : []
    ))).toEqual([
      [companionA, 1],
      [navigatorA, 1],
      [reviewA, 1],
    ]);
    const navigatorState = messages.find((message) => (
      message.type === "primary-state" && message.targetCompanionInstanceId === navigatorA
    ));
    const navigatorReview = messages.find((message) => (
      message.type === "primary-review-state" && message.targetCompanionInstanceId === navigatorA
    ));
    const workspaceReview = messages.find((message) => (
      message.type === "primary-review-state" && message.targetCompanionInstanceId === companionA
    ));
    const reviewReview = messages.find((message) => (
      message.type === "primary-review-state" && message.targetCompanionInstanceId === reviewA
    ));
    expect(navigatorState).toEqual(expect.objectContaining({ title: "스튜디오" }));
    expect(workspaceReview).toEqual(expect.objectContaining({ projection: fullProjection }));
    expect(reviewReview).toEqual(expect.objectContaining({ projection: fullProjection }));
    if (!navigatorReview || navigatorReview.type !== "primary-review-state") {
      throw new Error("Navigator review projection missing");
    }
    expect(navigatorReview.projection).toEqual({
      revision: fullProjection.revision,
      documentRevision: fullProjection.documentRevision,
      pageLabel: "캔버스",
      selectionLabel: null,
      canUndo: false,
      canRedo: false,
      captureAllowed: fullProjection.captureAllowed,
      viewport: fullProjection.viewport,
      layers: [],
      history: [],
      comments: [],
      brush: {
        id: "navigator",
        label: "Navigator",
        size: 1,
        opacity: 1,
        color: "#000000",
        choices: [{ id: "navigator", label: "Navigator" }],
      },
      truncated: { layers: 0, history: 0, comments: 0 },
    });
    expect(parseStudioCompanionMessage(navigatorReview)).toEqual(navigatorReview);
    const serializedNavigator = JSON.stringify(navigatorReview);
    expect(serializedNavigator).not.toContain("1화");
    expect(serializedNavigator).not.toContain("선화");
    expect(serializedNavigator).not.toContain("편집자");
    expect(serializedNavigator).not.toContain("눈썹 확인");
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

  it("prioritizes the dedicated Navigator without letting Review disturb capture ownership", async () => {
    vi.useFakeTimers({ now: 10_000 });
    RuntimeBroadcastChannel.instances.length = 0;
    vi.stubGlobal("BroadcastChannel", RuntimeBroadcastChannel);
    const projection = reviewProjection({ documentRevision: 30, captureAllowed: true });
    const pending: Array<{
      request: {
        generation: number;
        revision: number;
        sequence: number;
        signal: AbortSignal;
      };
      resolve: (value: {
        generation: number;
        revision: number;
        sequence: number;
        width: number;
        height: number;
        blob: Blob;
      } | null) => void;
    }> = [];
    const onControl = vi.fn();
    const runtime = startStudioCompanionPrimaryRuntime({
      search: `?session=${primaryA}`,
      getSnapshot: () => ({
        tool: "select",
        density: "full",
        canvasOnly: false,
        title: "1화",
      }),
      getReviewProjection: () => projection,
      captureNavigatorFrame: (request) => new Promise((resolve) => {
        pending.push({ request, resolve });
      }),
      onCommand: vi.fn(),
      onControl,
    });
    const channel = RuntimeBroadcastChannel.instances[0]!;
    const primaryHello = channel.postMessage.mock.calls[0]?.[0] as Extract<
      StudioCompanionMessage,
      { type: "hello"; role: "primary" }
    >;
    channel.emit(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryHello.primaryInstanceId,
    }));
    demandNavigator({
      channel,
      primaryInstanceId: primaryHello.primaryInstanceId,
      companionInstanceId: companionA,
    });
    await Promise.resolve();
    expect(pending).toHaveLength(1);

    channel.emit(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: reviewA,
      targetPrimaryInstanceId: primaryHello.primaryInstanceId,
      surface: "review",
    }));
    channel.emit(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: navigatorA,
      targetPrimaryInstanceId: primaryHello.primaryInstanceId,
      surface: "navigator",
    }));
    expect(pending[0]?.request.signal.aborted).toBe(false);

    demandNavigator({
      channel,
      primaryInstanceId: primaryHello.primaryInstanceId,
      companionInstanceId: navigatorA,
    });
    await Promise.resolve();
    expect(pending[0]?.request.signal.aborted).toBe(true);
    expect(pending).toHaveLength(2);
    pending[0]?.resolve(null);
    const navigatorRequest = pending[1]!.request;
    pending[1]?.resolve({
      generation: navigatorRequest.generation,
      revision: navigatorRequest.revision,
      sequence: navigatorRequest.sequence,
      width: 640,
      height: 960,
      blob: new Blob(["navigator"], { type: "image/webp" }),
    });
    await vi.advanceTimersByTimeAsync(0);
    const sharedFrameMessages = channel.postMessage.mock.calls
      .map(([message]) => message as StudioCompanionMessage)
      .filter((message): message is Extract<StudioCompanionMessage, { type: "navigator-frame" }> => (
        message.type === "navigator-frame" && message.sequence === navigatorRequest.sequence
      ));
    expect(sharedFrameMessages.map((message) => message.targetCompanionInstanceId)).toEqual([
      companionA,
      navigatorA,
    ]);
    expect(sharedFrameMessages.map((message) => message.generation)).toEqual([
      runtime?.generation("workspace"),
      runtime?.generation("navigator"),
    ]);
    expect(sharedFrameMessages[0]?.blob).toBe(sharedFrameMessages[1]?.blob);
    expect(sharedFrameMessages.some((message) => (
      message.targetCompanionInstanceId === reviewA
    ))).toBe(false);

    channel.emit(buildStudioCompanionControl({
      control: { kind: "navigate", point: { x: 0.25, y: 0.75 } },
      generation: 1,
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryHello.primaryInstanceId,
      commandId: "workspace-navigate-02",
      sequence: 2,
    }));
    expect(onControl).toHaveBeenCalledWith({
      kind: "navigate",
      point: { x: 0.25, y: 0.75 },
    });

    demandNavigator({
      channel,
      primaryInstanceId: primaryHello.primaryInstanceId,
      companionInstanceId: navigatorA,
      sequence: 2,
      active: false,
    });
    await Promise.resolve();
    expect(pending).toHaveLength(3);
    const workspaceRequest = pending[2]!.request;
    pending[2]?.resolve({
      generation: workspaceRequest.generation,
      revision: workspaceRequest.revision,
      sequence: workspaceRequest.sequence,
      width: 640,
      height: 960,
      blob: new Blob(["workspace"], { type: "image/webp" }),
    });
    await vi.advanceTimersByTimeAsync(0);
    const workspaceOnlyFrames = channel.postMessage.mock.calls
      .map(([message]) => message as StudioCompanionMessage)
      .filter((message): message is Extract<StudioCompanionMessage, { type: "navigator-frame" }> => (
        message.type === "navigator-frame" && message.sequence === workspaceRequest.sequence
      ));
    expect(workspaceOnlyFrames.map((message) => message.targetCompanionInstanceId)).toEqual([
      companionA,
    ]);
    runtime?.dispose();
  });

  it("encodes once and fans the same frame Blob to every demanded non-Review surface", async () => {
    vi.useFakeTimers({ now: 10_000 });
    RuntimeBroadcastChannel.instances.length = 0;
    vi.stubGlobal("BroadcastChannel", RuntimeBroadcastChannel);
    let projection = reviewProjection({ documentRevision: 50, captureAllowed: false });
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
      blob: new Blob([`frame-${request.sequence}`], { type: "image/webp" }),
    }));
    const runtime = startStudioCompanionPrimaryRuntime({
      search: `?session=${primaryA}`,
      getSnapshot: () => ({
        tool: "select",
        density: "full",
        canvasOnly: false,
        title: "비공개 50화",
      }),
      getReviewProjection: () => projection,
      captureNavigatorFrame: capture,
      onCommand: vi.fn(),
    });
    const channel = RuntimeBroadcastChannel.instances[0]!;
    const primaryHello = channel.postMessage.mock.calls[0]?.[0] as Extract<
      StudioCompanionMessage,
      { type: "hello"; role: "primary" }
    >;
    channel.emit(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryHello.primaryInstanceId,
    }));
    runtime?.binding.release("workspace");
    channel.emit(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionB,
      targetPrimaryInstanceId: primaryHello.primaryInstanceId,
    }));
    channel.emit(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: navigatorA,
      targetPrimaryInstanceId: primaryHello.primaryInstanceId,
      surface: "navigator",
    }));
    channel.emit(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: reviewA,
      targetPrimaryInstanceId: primaryHello.primaryInstanceId,
      surface: "review",
    }));
    demandNavigator({
      channel,
      primaryInstanceId: primaryHello.primaryInstanceId,
      companionInstanceId: companionB,
      generation: 2,
    });
    demandNavigator({
      channel,
      primaryInstanceId: primaryHello.primaryInstanceId,
      companionInstanceId: navigatorA,
    });
    expect(capture).not.toHaveBeenCalled();

    projection = reviewProjection({ documentRevision: 50, captureAllowed: true });
    channel.postMessage.mockClear();
    runtime?.publish();
    await vi.advanceTimersByTimeAsync(0);
    expect(capture).toHaveBeenCalledOnce();
    const firstFrames = channel.postMessage.mock.calls
      .map(([message]) => message as StudioCompanionMessage)
      .filter((message): message is Extract<StudioCompanionMessage, { type: "navigator-frame" }> => (
        message.type === "navigator-frame"
      ));
    expect(firstFrames.map((message) => [
      message.targetCompanionInstanceId,
      message.generation,
    ])).toEqual([
      [companionB, 2],
      [navigatorA, 1],
    ]);
    expect(firstFrames[0]?.blob).toBe(firstFrames[1]?.blob);
    expect(firstFrames.some((message) => message.targetCompanionInstanceId === reviewA)).toBe(false);

    demandNavigator({
      channel,
      primaryInstanceId: primaryHello.primaryInstanceId,
      companionInstanceId: companionB,
      generation: 2,
      sequence: 2,
      active: false,
    });
    projection = reviewProjection({ revision: 2, documentRevision: 51, captureAllowed: true });
    channel.postMessage.mockClear();
    runtime?.publish();
    await vi.advanceTimersByTimeAsync(500);
    expect(capture).toHaveBeenCalledTimes(2);
    const secondFrames = channel.postMessage.mock.calls
      .map(([message]) => message as StudioCompanionMessage)
      .filter((message): message is Extract<StudioCompanionMessage, { type: "navigator-frame" }> => (
        message.type === "navigator-frame"
      ));
    expect(secondFrames.map((message) => message.targetCompanionInstanceId)).toEqual([navigatorA]);
    runtime?.dispose();
  });

  it("performs one bounded refresh when a secondary demander joins an unchanged owner", async () => {
    vi.useFakeTimers({ now: 10_000 });
    RuntimeBroadcastChannel.instances.length = 0;
    vi.stubGlobal("BroadcastChannel", RuntimeBroadcastChannel);
    const projection = reviewProjection({ documentRevision: 60, captureAllowed: true });
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
      blob: new Blob([`refresh-${request.sequence}`], { type: "image/webp" }),
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
    const primaryHello = channel.postMessage.mock.calls[0]?.[0] as Extract<
      StudioCompanionMessage,
      { type: "hello"; role: "primary" }
    >;
    channel.emit(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: navigatorA,
      targetPrimaryInstanceId: primaryHello.primaryInstanceId,
      surface: "navigator",
    }));
    demandNavigator({
      channel,
      primaryInstanceId: primaryHello.primaryInstanceId,
      companionInstanceId: navigatorA,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(capture).toHaveBeenCalledOnce();

    channel.emit(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: companionA,
      targetPrimaryInstanceId: primaryHello.primaryInstanceId,
    }));
    channel.postMessage.mockClear();
    demandNavigator({
      channel,
      primaryInstanceId: primaryHello.primaryInstanceId,
      companionInstanceId: companionA,
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(capture).toHaveBeenCalledTimes(2);
    const refreshFrames = channel.postMessage.mock.calls
      .map(([message]) => message as StudioCompanionMessage)
      .filter((message): message is Extract<StudioCompanionMessage, { type: "navigator-frame" }> => (
        message.type === "navigator-frame"
      ));
    expect(refreshFrames.map((message) => message.targetCompanionInstanceId)).toEqual([
      companionA,
      navigatorA,
    ]);

    demandNavigator({
      channel,
      primaryInstanceId: primaryHello.primaryInstanceId,
      companionInstanceId: companionA,
      sequence: 2,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(capture).toHaveBeenCalledTimes(2);
    runtime?.dispose();
  });

  it("expires an idle surface without requiring a document publish and preserves healthy peers", () => {
    vi.useFakeTimers({ now: 10_000 });
    RuntimeBroadcastChannel.instances.length = 0;
    vi.stubGlobal("BroadcastChannel", RuntimeBroadcastChannel);
    const runtime = startStudioCompanionPrimaryRuntime({
      search: `?session=${primaryA}`,
      getSnapshot: () => ({
        tool: "select",
        density: "full",
        canvasOnly: false,
        title: "1화",
      }),
      getReviewProjection: () => reviewProjection({ documentRevision: 40 }),
      onCommand: vi.fn(),
    });
    const channel = RuntimeBroadcastChannel.instances[0]!;
    const primaryHello = channel.postMessage.mock.calls[0]?.[0] as Extract<
      StudioCompanionMessage,
      { type: "hello"; role: "primary" }
    >;
    for (const [surface, companionInstanceId] of [
      ["workspace", companionA],
      ["navigator", navigatorA],
      ["review", reviewA],
    ] as const) {
      channel.emit(buildStudioCompanionHello({
        role: "companion",
        companionInstanceId,
        targetPrimaryInstanceId: primaryHello.primaryInstanceId,
        surface,
      }, Date.now()));
    }

    vi.advanceTimersByTime(8_000);
    for (const [companionInstanceId, nonce] of [
      [companionA, "workspace-ping-0001"],
      [reviewA, "review-peer-ping-01"],
    ] as const) {
      channel.emit(buildStudioCompanionPing({
        companionInstanceId,
        targetPrimaryInstanceId: primaryHello.primaryInstanceId,
        nonce,
      }, Date.now()));
    }
    vi.advanceTimersByTime(4_001);

    expect(runtime?.binding.companionInstanceId()).toBe(companionA);
    expect(runtime?.binding.companionInstanceId("navigator")).toBeNull();
    expect(runtime?.binding.companionInstanceId("review")).toBe(reviewA);
    expect(runtime?.binding.activeBindings()).toHaveLength(2);
    channel.emit(buildStudioCompanionHello({
      role: "companion",
      companionInstanceId: navigatorB,
      targetPrimaryInstanceId: primaryHello.primaryInstanceId,
      surface: "navigator",
    }, Date.now()));
    expect(runtime?.generation("navigator")).toBe(2);
    expect(runtime?.generation()).toBe(1);
    expect(runtime?.generation("review")).toBe(1);
    runtime?.dispose();
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

      await vi.advanceTimersByTimeAsync(1_500);
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
