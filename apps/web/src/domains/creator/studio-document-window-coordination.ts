import { isStudioDocumentWorkspace, type StudioDocumentWorkspaceId } from "./studio-document-workspace";

const SOURCE = "toonspectrum-studio-document-windows";
const CHANNEL_PREFIX = "toonspectrum:studio-document-windows:v1:";
const HEARTBEAT_MS = 15_000;
const PEER_RETENTION_MS = 180_000;
const FUTURE_TOLERANCE_MS = 60_000;
const MAX_PEERS = 32;
const MAX_SEEN_MESSAGES = 256;
const MAX_STORAGE_MESSAGE_LENGTH = 4_096;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{7,95}$/u;

type Transport = "broadcast" | "storage" | "isolated";
type PresenceMessageType = "hello" | "state";

export interface StudioDocumentWindowPresence {
  readonly instanceId: string;
  readonly workspace: StudioDocumentWorkspaceId;
  readonly visible: boolean;
  readonly focused: boolean;
  readonly openedAt: number;
  readonly lastSeenAt: number;
}

export interface StudioDocumentWindowSnapshot {
  readonly local: StudioDocumentWindowPresence;
  readonly peers: readonly StudioDocumentWindowPresence[];
  readonly transport: Transport;
}
interface MessageBase {
  readonly v: 1;
  readonly source: typeof SOURCE;
  readonly messageId: string;
  readonly documentKey: string;
  readonly at: number;
}

interface PresenceMessage extends MessageBase {
  readonly type: PresenceMessageType;
  readonly instanceId: string;
  readonly workspace: StudioDocumentWorkspaceId;
  readonly visible: boolean;
  readonly focused: boolean;
  readonly openedAt: number;
}
interface GoodbyeMessage extends MessageBase {
  readonly type: "goodbye";
  readonly instanceId: string;
}

interface FocusRequestMessage extends MessageBase {
  readonly type: "focus-request";
  readonly requesterInstanceId: string;
  readonly targetInstanceId: string;
}

interface FocusAcknowledgedMessage extends MessageBase {
  readonly type: "focus-acknowledged";
  readonly responderInstanceId: string;
  readonly targetInstanceId: string;
}
export type StudioDocumentWindowMessage =
  | PresenceMessage
  | GoodbyeMessage
  | FocusRequestMessage
  | FocusAcknowledgedMessage;

export interface StudioDocumentWindowChannel {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

export interface StudioDocumentWindowCoordinatorOptions {
  readonly documentKey: string;
  readonly workspace: StudioDocumentWorkspaceId;
  readonly instanceId?: string;
  readonly openedAt?: number;
  readonly channelFactory?: ((name: string) => StudioDocumentWindowChannel | null) | null;
  readonly storage?: Pick<Storage, "setItem" | "removeItem"> | null;
  readonly windowTarget?: EventTarget | null;
  readonly documentTarget?: EventTarget | null;
  readonly readVisibility?: () => DocumentVisibilityState;
  readonly readFocus?: () => boolean;
  readonly focusWindow?: () => void;
  readonly now?: () => number;
  readonly setInterval?: (
    handler: () => void,
    timeout: number,
  ) => ReturnType<typeof globalThis.setInterval>;
  readonly clearInterval?: (
    timer: ReturnType<typeof globalThis.setInterval>,
  ) => void;
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  return value as Record<string, unknown>;
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(record, key));
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function isSafeDocumentKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 480) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return false;
  }
  return true;
}

const BASE_KEYS = ["v", "source", "type", "messageId", "documentKey", "at"] as const;
const PRESENCE_KEYS = [
  ...BASE_KEYS,
  "instanceId",
  "workspace",
  "visible",
  "focused",
  "openedAt",
] as const;
const GOODBYE_KEYS = [...BASE_KEYS, "instanceId"] as const;
const FOCUS_REQUEST_KEYS = [
  ...BASE_KEYS,
  "requesterInstanceId",
  "targetInstanceId",
] as const;
const FOCUS_ACK_KEYS = [
  ...BASE_KEYS,
  "responderInstanceId",
  "targetInstanceId",
] as const;

export function parseStudioDocumentWindowMessage(
  value: unknown,
): StudioDocumentWindowMessage | null {
  const record = plainRecord(value);
  if (
    !record
    || record.v !== 1
    || record.source !== SOURCE
    || !isSafeIdentifier(record.messageId)
    || !isSafeDocumentKey(record.documentKey)
    || !isSafeInteger(record.at)
    || typeof record.type !== "string"
  ) return null;

  if (record.type === "hello" || record.type === "state") {
    if (
      !hasExactKeys(record, PRESENCE_KEYS)
      || !isSafeIdentifier(record.instanceId)
      || !isStudioDocumentWorkspace(record.workspace)
      || typeof record.visible !== "boolean"
      || typeof record.focused !== "boolean"
      || !isSafeInteger(record.openedAt)
    ) return null;
    return record as unknown as PresenceMessage;
  }
  if (record.type === "goodbye") {
    if (!hasExactKeys(record, GOODBYE_KEYS) || !isSafeIdentifier(record.instanceId)) {
      return null;
    }
    return record as unknown as GoodbyeMessage;
  }
  if (record.type === "focus-request") {
    if (
      !hasExactKeys(record, FOCUS_REQUEST_KEYS)
      || !isSafeIdentifier(record.requesterInstanceId)
      || !isSafeIdentifier(record.targetInstanceId)
    ) return null;
    return record as unknown as FocusRequestMessage;
  }
  if (record.type === "focus-acknowledged") {
    if (
      !hasExactKeys(record, FOCUS_ACK_KEYS)
      || !isSafeIdentifier(record.responderInstanceId)
      || !isSafeIdentifier(record.targetInstanceId)
    ) return null;
    return record as unknown as FocusAcknowledgedMessage;
  }
  return null;
}

function stableScopeHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}-${value.length.toString(36)}`;
}

export function studioDocumentWindowScopeToken(documentKey: string): string {
  if (!isSafeDocumentKey(documentKey)) {
    throw new Error("A valid Studio document key is required.");
  }
  return stableScopeHash(documentKey);
}

export function studioDocumentWindowChannelName(documentKey: string): string {
  return `${CHANNEL_PREFIX}${studioDocumentWindowScopeToken(documentKey)}`;
}
function createIdentifier(prefix: string): string {
  const entropy = (() => {
    try {
      return globalThis.crypto.randomUUID().replaceAll("-", "");
    } catch {
      return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    }
  })();
  return `${prefix}-${entropy.slice(0, 64).padEnd(12, "0")}`;
}

export function createStudioDocumentWindowInstanceId(): string {
  return createIdentifier("studio-window");
}

function defaultChannelFactory(name: string): StudioDocumentWindowChannel | null {
  if (typeof BroadcastChannel !== "function") return null;
  try {
    return new BroadcastChannel(name);
  } catch {
    return null;
  }
}
function defaultStorage(): Pick<Storage, "setItem" | "removeItem"> | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function defaultWindowTarget(): EventTarget | null {
  return typeof window === "undefined" ? null : window;
}

function defaultDocumentTarget(): EventTarget | null {
  return typeof document === "undefined" ? null : document;
}

function defaultVisibility(): DocumentVisibilityState {
  return typeof document === "undefined" ? "hidden" : document.visibilityState;
}

function defaultFocus(): boolean {
  return typeof document !== "undefined" && document.hasFocus();
}
function defaultFocusWindow(): void {
  if (typeof window !== "undefined") window.focus();
}

function freezePresence(
  value: StudioDocumentWindowPresence,
): StudioDocumentWindowPresence {
  return Object.freeze({ ...value });
}

export class StudioDocumentWindowCoordinator {
  private readonly documentKey: string;
  private readonly channelName: string;
  private readonly storageKey: string;
  private readonly channelFactory:
    ((name: string) => StudioDocumentWindowChannel | null) | null;
  private storage: Pick<Storage, "setItem" | "removeItem"> | null;
  private readonly windowTarget: EventTarget | null;
  private readonly documentTarget: EventTarget | null;
  private readonly readVisibility: () => DocumentVisibilityState;
  private readonly readFocus: () => boolean;
  private readonly focusWindow: () => void;
  private readonly now: () => number;
  private readonly setIntervalFn:
    StudioDocumentWindowCoordinatorOptions["setInterval"];
  private readonly clearIntervalFn:
    StudioDocumentWindowCoordinatorOptions["clearInterval"];
  private readonly listeners = new Set<() => void>();
  private readonly peers = new Map<string, StudioDocumentWindowPresence>();
  private readonly seenMessages = new Set<string>();
  private readonly seenMessageOrder: string[] = [];
  private channel: StudioDocumentWindowChannel | null = null;
  private heartbeatTimer: ReturnType<typeof globalThis.setInterval> | null = null;
  private started = false;
  private local: StudioDocumentWindowPresence;
  private snapshot: StudioDocumentWindowSnapshot;

  constructor(options: StudioDocumentWindowCoordinatorOptions) {
    if (!isSafeDocumentKey(options.documentKey)) {
      throw new Error("A valid Studio document key is required.");
    }
    if (!isStudioDocumentWorkspace(options.workspace)) {
      throw new Error("A valid Studio document workspace is required.");
    }
    const now = options.now ?? Date.now;
    const instanceId = options.instanceId ?? createStudioDocumentWindowInstanceId();
    const openedAt = options.openedAt ?? now();
    if (!isSafeIdentifier(instanceId) || !isSafeInteger(openedAt)) {
      throw new Error("A valid Studio window identity is required.");
    }
    this.documentKey = options.documentKey;
    this.channelName = studioDocumentWindowChannelName(options.documentKey);
    this.storageKey = this.channelName;
    this.channelFactory = options.channelFactory === undefined
      ? defaultChannelFactory
      : options.channelFactory;
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
    this.windowTarget = options.windowTarget === undefined
      ? defaultWindowTarget()
      : options.windowTarget;
    this.documentTarget = options.documentTarget === undefined
      ? defaultDocumentTarget()
      : options.documentTarget;
    this.readVisibility = options.readVisibility ?? defaultVisibility;
    this.readFocus = options.readFocus ?? defaultFocus;
    this.focusWindow = options.focusWindow ?? defaultFocusWindow;
    this.now = now;
    this.setIntervalFn = options.setInterval ?? globalThis.setInterval.bind(globalThis);
    this.clearIntervalFn = options.clearInterval ?? globalThis.clearInterval.bind(globalThis);
    const visible = this.readVisibility() === "visible";
    this.local = freezePresence({
      instanceId,
      workspace: options.workspace,
      visible,
      focused: visible && this.readFocus(),
      openedAt,
      lastSeenAt: openedAt,
    });
    this.snapshot = Object.freeze({
      local: this.local,
      peers: Object.freeze([]),
      transport: "isolated",
    });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): StudioDocumentWindowSnapshot => this.snapshot;
  readonly getServerSnapshot = (): StudioDocumentWindowSnapshot => this.snapshot;

  start(): () => void {
    if (this.started) return () => this.dispose();
    this.started = true;
    if (this.channelFactory) {
      try {
        this.channel = this.channelFactory(this.channelName);
        if (this.channel) this.channel.onmessage = this.handleChannelMessage;
      } catch {
        this.channel = null;
      }
    }
    this.addEventListeners();
    this.rebuildSnapshot();
    this.publishPresence("hello");
    this.heartbeatTimer = this.setIntervalFn?.(() => {
      this.prunePeers();
      this.publishPresence("state");
    }, HEARTBEAT_MS) ?? null;
    return () => this.dispose();
  }

  dispose(): void {
    if (!this.started) return;
    this.publishGoodbye();
    this.started = false;
    if (this.heartbeatTimer !== null) {
      this.clearIntervalFn?.(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.removeEventListeners();
    if (this.channel) {
      this.channel.onmessage = null;
      try {
        this.channel.close();
      } catch {
        // A closed channel is already disposed.
      }
      this.channel = null;
    }
    this.peers.clear();
    this.rebuildSnapshot();
  }
  updateWorkspace(workspace: StudioDocumentWorkspaceId): void {
    if (!isStudioDocumentWorkspace(workspace) || workspace === this.local.workspace) return;
    this.local = freezePresence({
      ...this.local,
      workspace,
      lastSeenAt: this.now(),
    });
    this.rebuildSnapshot();
    if (this.started) this.publishPresence("state");
  }

  requestFocus(instanceId: string): boolean {
    if (!isSafeIdentifier(instanceId) || !this.peers.has(instanceId)) return false;
    this.publish({
      ...this.messageBase("focus-request"),
      type: "focus-request",
      requesterInstanceId: this.local.instanceId,
      targetInstanceId: instanceId,
    });
    return true;
  }

  private addEventListeners(): void {
    this.windowTarget?.addEventListener("focus", this.handlePresenceEvent);
    this.windowTarget?.addEventListener("blur", this.handlePresenceEvent);
    this.windowTarget?.addEventListener("pageshow", this.handlePageShow);
    this.windowTarget?.addEventListener("pagehide", this.handlePageHide);
    this.windowTarget?.addEventListener("beforeunload", this.handlePageHide);
    this.windowTarget?.addEventListener("storage", this.handleStorageEvent);
    this.documentTarget?.addEventListener("visibilitychange", this.handlePresenceEvent);
  }

  private removeEventListeners(): void {
    this.windowTarget?.removeEventListener("focus", this.handlePresenceEvent);
    this.windowTarget?.removeEventListener("blur", this.handlePresenceEvent);
    this.windowTarget?.removeEventListener("pageshow", this.handlePageShow);
    this.windowTarget?.removeEventListener("pagehide", this.handlePageHide);
    this.windowTarget?.removeEventListener("beforeunload", this.handlePageHide);
    this.windowTarget?.removeEventListener("storage", this.handleStorageEvent);
    this.documentTarget?.removeEventListener("visibilitychange", this.handlePresenceEvent);
  }

  private readonly handleChannelMessage = (
    event: MessageEvent<unknown>,
  ): void => {
    this.accept(event.data);
  };

  private readonly handleStorageEvent = (event: Event): void => {
    const storageEvent = event as StorageEvent;
    if (storageEvent.key !== this.storageKey || typeof storageEvent.newValue !== "string") {
      return;
    }
    if (storageEvent.newValue.length > MAX_STORAGE_MESSAGE_LENGTH) return;
    try {
      this.accept(JSON.parse(storageEvent.newValue) as unknown);
    } catch {
      // Ignore malformed cross-tab storage signals.
    }
  };

  private readonly handlePresenceEvent = (): void => {
    this.updateLocalPresence();
    if (this.started) this.publishPresence("state");
  };

  private readonly handlePageShow = (): void => {
    this.updateLocalPresence();
    if (this.started) this.publishPresence("hello");
  };

  private readonly handlePageHide = (): void => {
    if (this.started) this.publishGoodbye();
  };

  private updateLocalPresence(): void {
    const visible = this.readVisibility() === "visible";
    const focused = visible && this.readFocus();
    if (this.local.visible === visible && this.local.focused === focused) return;
    this.local = freezePresence({
      ...this.local,
      visible,
      focused,
      lastSeenAt: this.now(),
    });
    this.rebuildSnapshot();
  }

  private messageBase(
    type: StudioDocumentWindowMessage["type"],
  ): MessageBase & { readonly type: typeof type } {
    return {
      v: 1,
      source: SOURCE,
      type,
      messageId: createIdentifier("studio-message"),
      documentKey: this.documentKey,
      at: this.now(),
    };
  }

  private publishPresence(type: PresenceMessageType): void {
    this.updateLocalPresence();
    this.publish({
      ...this.messageBase(type),
      type,
      instanceId: this.local.instanceId,
      workspace: this.local.workspace,
      visible: this.local.visible,
      focused: this.local.focused,
      openedAt: this.local.openedAt,
    });
  }

  private publishGoodbye(): void {
    this.publish({
      ...this.messageBase("goodbye"),
      type: "goodbye",
      instanceId: this.local.instanceId,
    });
  }

  private publish(message: StudioDocumentWindowMessage): void {
    if (this.channel) {
      try {
        this.channel.postMessage(message);
      } catch {
        try {
          this.channel.close();
        } catch {
          // Ignore a channel already closed by the browser.
        }
        this.channel = null;
      }
    }
    if (this.storage) {
      try {
        const serialized = JSON.stringify(message);
        this.storage.setItem(this.storageKey, serialized);
        this.storage.removeItem(this.storageKey);
      } catch {
        this.storage = null;
      }
    }
    this.rebuildSnapshot();
  }

  private accept(value: unknown): void {
    const message = parseStudioDocumentWindowMessage(value);
    const now = this.now();
    if (
      !message
      || message.documentKey !== this.documentKey
      || message.at < now - PEER_RETENTION_MS
      || message.at > now + FUTURE_TOLERANCE_MS
      || !this.rememberMessage(message.messageId)
    ) return;

    if (message.type === "hello" || message.type === "state") {
      if (message.instanceId === this.local.instanceId) return;
      this.peers.set(message.instanceId, freezePresence({
        instanceId: message.instanceId,
        workspace: message.workspace,
        visible: message.visible,
        focused: message.visible && message.focused,
        openedAt: Math.min(message.openedAt, message.at),
        lastSeenAt: now,
      }));
      this.limitPeers();
      this.rebuildSnapshot();
      if (message.type === "hello") this.publishPresence("state");
      return;
    }
    if (message.type === "goodbye") {
      if (this.peers.delete(message.instanceId)) this.rebuildSnapshot();
      return;
    }
    if (
      message.type === "focus-request"
      && message.targetInstanceId === this.local.instanceId
    ) {
      try {
        this.focusWindow();
      } catch {
        // Browser focus policy can reject background activation.
      }
      this.updateLocalPresence();
      this.publish({
        ...this.messageBase("focus-acknowledged"),
        type: "focus-acknowledged",
        responderInstanceId: this.local.instanceId,
        targetInstanceId: message.requesterInstanceId,
      });
      this.publishPresence("state");
      return;
    }
    if (
      message.type === "focus-acknowledged"
      && message.targetInstanceId === this.local.instanceId
      && this.peers.has(message.responderInstanceId)
    ) {
      const peer = this.peers.get(message.responderInstanceId);
      if (peer) {
        this.peers.set(peer.instanceId, freezePresence({
          ...peer,
          lastSeenAt: now,
        }));
        this.rebuildSnapshot();
      }
    }
  }

  private rememberMessage(messageId: string): boolean {
    if (this.seenMessages.has(messageId)) return false;
    this.seenMessages.add(messageId);
    this.seenMessageOrder.push(messageId);
    while (this.seenMessageOrder.length > MAX_SEEN_MESSAGES) {
      const oldest = this.seenMessageOrder.shift();
      if (oldest) this.seenMessages.delete(oldest);
    }
    return true;
  }

  private prunePeers(): void {
    const threshold = this.now() - PEER_RETENTION_MS;
    let changed = false;
    for (const [instanceId, peer] of this.peers) {
      if (peer.lastSeenAt >= threshold) continue;
      this.peers.delete(instanceId);
      changed = true;
    }
    if (changed) this.rebuildSnapshot();
  }

  private limitPeers(): void {
    if (this.peers.size <= MAX_PEERS) return;
    const oldest = [...this.peers.values()]
      .sort((left, right) => left.lastSeenAt - right.lastSeenAt)
      .slice(0, this.peers.size - MAX_PEERS);
    for (const peer of oldest) this.peers.delete(peer.instanceId);
  }

  private rebuildSnapshot(): void {
    const peers = [...this.peers.values()].sort((left, right) => {
      if (left.focused !== right.focused) return left.focused ? -1 : 1;
      if (left.visible !== right.visible) return left.visible ? -1 : 1;
      if (left.workspace !== right.workspace) {
        return left.workspace.localeCompare(right.workspace);
      }
      return left.openedAt - right.openedAt;
    });
    const transport: Transport = this.channel
      ? "broadcast"
      : this.storage
        ? "storage"
        : "isolated";
    this.snapshot = Object.freeze({
      local: this.local,
      peers: Object.freeze(peers),
      transport,
    });
    for (const listener of this.listeners) listener();
  }
}

export function createStudioDocumentWindowCoordinator(
  options: StudioDocumentWindowCoordinatorOptions,
): StudioDocumentWindowCoordinator {
  return new StudioDocumentWindowCoordinator(options);
}
