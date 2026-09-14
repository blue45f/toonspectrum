import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudioDocumentWindowCoordinator,
  parseStudioDocumentWindowMessage,
  studioDocumentWindowChannelName,
  type StudioDocumentWindowChannel,
} from "./studio-document-window-coordination";

class SharedChannel implements StudioDocumentWindowChannel {
  static readonly channels = new Map<string, Set<SharedChannel>>();
  static readonly transcript: unknown[] = [];

  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  private closed = false;

  constructor(readonly name: string) {
    const peers = SharedChannel.channels.get(name) ?? new Set<SharedChannel>();
    peers.add(this);
    SharedChannel.channels.set(name, peers);
  }

  postMessage(message: unknown): void {
    if (this.closed) return;
    SharedChannel.transcript.push(message);
    for (const peer of SharedChannel.channels.get(this.name) ?? []) {
      if (peer === this || peer.closed) continue;
      peer.onmessage?.({ data: message } as MessageEvent<unknown>);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onmessage = null;
    const peers = SharedChannel.channels.get(this.name);
    peers?.delete(this);
    if (peers?.size === 0) SharedChannel.channels.delete(this.name);
  }

  static reset(): void {
    for (const peers of SharedChannel.channels.values()) {
      for (const peer of peers) peer.close();
    }
    SharedChannel.channels.clear();
    SharedChannel.transcript.length = 0;
  }
}

function inertInterval(): ReturnType<typeof globalThis.setInterval> {
  return 1 as unknown as ReturnType<typeof globalThis.setInterval>;
}

function coordinator(input: {
  readonly instanceId: string;
  readonly workspace: "draw" | "review" | "3d";
  readonly documentKey?: string;
  readonly focusWindow?: () => void;
}) {
  return createStudioDocumentWindowCoordinator({
    documentKey: input.documentKey ?? "project:project-1:document:document-1",
    workspace: input.workspace,
    instanceId: input.instanceId,
    openedAt: 10_000,
    channelFactory: (name) => new SharedChannel(name),
    storage: null,
    windowTarget: null,
    documentTarget: null,
    readVisibility: () => "visible",
    readFocus: () => false,
    focusWindow: input.focusWindow,
    now: () => 10_000,
    setInterval: inertInterval,
    clearInterval: vi.fn(),
  });
}

afterEach(() => {
  SharedChannel.reset();
  vi.restoreAllMocks();
});

describe("Studio document window coordination", () => {
  it("isolates document channels without exposing raw document identities", () => {
    const first = studioDocumentWindowChannelName("project:secret-project:document:secret-page");
    const second = studioDocumentWindowChannelName("project:other-project:document:secret-page");

    expect(first).toMatch(/^toonspectrum:studio-document-windows:v1:/u);
    expect(first).not.toContain("secret-project");
    expect(first).not.toContain("secret-page");
    expect(first).not.toBe(second);
  });

  it("discovers peers, propagates workspace changes, focuses and cleans up", () => {
    const focusSecond = vi.fn();
    const first = coordinator({
      instanceId: "studio-window-first-1234",
      workspace: "draw",
    });
    const second = coordinator({
      instanceId: "studio-window-second-5678",
      workspace: "review",
      focusWindow: focusSecond,
    });

    first.start();
    second.start();

    expect(first.getSnapshot().transport).toBe("broadcast");
    expect(first.getSnapshot().peers).toEqual([
      expect.objectContaining({
        instanceId: "studio-window-second-5678",
        workspace: "review",
      }),
    ]);
    expect(second.getSnapshot().peers).toEqual([
      expect.objectContaining({
        instanceId: "studio-window-first-1234",
        workspace: "draw",
      }),
    ]);

    second.updateWorkspace("3d");
    expect(first.getSnapshot().peers[0]?.workspace).toBe("3d");
    expect(first.requestFocus("studio-window-second-5678")).toBe(true);
    expect(focusSecond).toHaveBeenCalledOnce();

    second.dispose();
    expect(first.getSnapshot().peers).toEqual([]);
    expect(first.requestFocus("studio-window-second-5678")).toBe(false);
    first.dispose();
  });

  it("keeps different documents fully isolated", () => {
    const first = coordinator({
      instanceId: "studio-window-first-1234",
      workspace: "draw",
      documentKey: "project:one:document:page",
    });
    const second = coordinator({
      instanceId: "studio-window-second-5678",
      workspace: "review",
      documentKey: "project:two:document:page",
    });

    first.start();
    second.start();
    expect(first.getSnapshot().peers).toEqual([]);
    expect(second.getSnapshot().peers).toEqual([]);
    first.dispose();
    second.dispose();
  });

  it("parses only the exact bounded protocol", () => {
    const runtime = coordinator({
      instanceId: "studio-window-first-1234",
      workspace: "draw",
    });
    runtime.start();
    const hello = SharedChannel.transcript[0];

    expect(parseStudioDocumentWindowMessage(hello)).toEqual(hello);
    expect(parseStudioDocumentWindowMessage({
      ...(hello as Record<string, unknown>),
      extra: true,
    })).toBeNull();
    expect(parseStudioDocumentWindowMessage({
      ...(hello as Record<string, unknown>),
      workspace: "unknown",
    })).toBeNull();
    expect(parseStudioDocumentWindowMessage({
      ...(hello as Record<string, unknown>),
      at: Number.NaN,
    })).toBeNull();
    expect(parseStudioDocumentWindowMessage(null)).toBeNull();
    runtime.dispose();
  });

  it("falls back to bounded storage signals when BroadcastChannel is unavailable", () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const runtime = createStudioDocumentWindowCoordinator({
      documentKey: "project:project-1:document:document-1",
      workspace: "draw",
      instanceId: "studio-window-storage-1234",
      openedAt: 10_000,
      channelFactory: null,
      storage,
      windowTarget: null,
      documentTarget: null,
      readVisibility: () => "visible",
      readFocus: () => true,
      now: () => 10_000,
      setInterval: inertInterval,
      clearInterval: vi.fn(),
    });

    runtime.start();
    expect(runtime.getSnapshot().transport).toBe("storage");
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(storage.removeItem).toHaveBeenCalledOnce();
    runtime.dispose();
  });
});
