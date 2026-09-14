import {
  createStudioPeerBulkTransfer,
  type StudioPeerBulkKind,
  type StudioPeerBulkOffer,
  type StudioPeerBulkReceived,
  type StudioPeerBulkSendInput,
  type StudioPeerBulkTransferOptions,
  type StudioPeerBulkTransferPort,
  type StudioPeerBulkTransferReceipt,
} from "./studio-peer-bulk-transfer";
import type { StudioPeerFabricPeer, StudioPeerFabricPort } from "./studio-peer-fabric";

export interface StudioPeerBulkExchangeHandler {
  readonly accept?: (
    sender: StudioPeerFabricPeer,
    offer: StudioPeerBulkOffer,
  ) => boolean | Promise<boolean>;
  readonly receive: (received: StudioPeerBulkReceived) => void | Promise<void>;
}

export interface StudioPeerBulkExchangePort {
  send(
    targetSessionId: string,
    input: StudioPeerBulkSendInput,
  ): Promise<StudioPeerBulkTransferReceipt>;
  register(kind: StudioPeerBulkKind, handler: StudioPeerBulkExchangeHandler): () => void;
  cancel(transferId: string, reason?: string): boolean;
  close(): void;
}

export class StudioPeerBulkExchange implements StudioPeerBulkExchangePort {
  private readonly handlers = new Map<
    StudioPeerBulkKind,
    Set<StudioPeerBulkExchangeHandler>
  >();
  private readonly transfer: StudioPeerBulkTransferPort;
  private readonly acceptedHandlers = new Map<string, readonly StudioPeerBulkExchangeHandler[]>();
  private closed = false;

  constructor(
    fabric: StudioPeerFabricPort,
    options: Omit<StudioPeerBulkTransferOptions, "onOffer" | "onReceive"> = {},
  ) {
    this.transfer = createStudioPeerBulkTransfer(fabric, {
      ...options,
      onOffer: (sender, offer) => this.accept(sender, offer),
      onReceive: (received) => this.receive(received),
    });
  }

  send(
    targetSessionId: string,
    input: StudioPeerBulkSendInput,
  ): Promise<StudioPeerBulkTransferReceipt> {
    if (this.closed) return Promise.reject(new Error("P2P bulk exchange가 종료되었습니다."));
    return this.transfer.send(targetSessionId, input);
  }

  register(kind: StudioPeerBulkKind, handler: StudioPeerBulkExchangeHandler): () => void {
    if (this.closed) return () => undefined;
    const handlers = this.handlers.get(kind) ?? new Set<StudioPeerBulkExchangeHandler>();
    handlers.add(handler);
    this.handlers.set(kind, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.handlers.delete(kind);
    };
  }

  cancel(transferId: string, reason?: string): boolean {
    return this.transfer.cancel(transferId, reason);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.transfer.close();
    this.handlers.clear();
    this.acceptedHandlers.clear();
  }

  private async accept(
    sender: StudioPeerFabricPeer,
    offer: StudioPeerBulkOffer,
  ): Promise<boolean> {
    const handlers = this.handlers.get(offer.kind);
    if (!handlers?.size) return false;
    const accepted: StudioPeerBulkExchangeHandler[] = [];
    for (const handler of handlers) {
      try {
        if (!handler.accept || await handler.accept(sender, offer)) accepted.push(handler);
      } catch {
        // Another registered consumer can still accept this exact kind.
      }
    }
    if (accepted.length === 0) return false;
    const key = `${sender.sessionId}:${offer.transferId}`;
    this.acceptedHandlers.set(key, Object.freeze([...accepted]));
    while (this.acceptedHandlers.size > 512) {
      const oldest = this.acceptedHandlers.keys().next().value;
      if (typeof oldest !== "string") break;
      this.acceptedHandlers.delete(oldest);
    }
    return true;
  }

  private async receive(received: StudioPeerBulkReceived): Promise<void> {
    const key = `${received.sender.sessionId}:${received.offer.transferId}`;
    const handlers = this.acceptedHandlers.get(key);
    this.acceptedHandlers.delete(key);
    if (!handlers?.length) {
      throw new Error("수신한 P2P bulk transfer의 승인 소비자가 없습니다.");
    }
    await Promise.all(handlers.map((handler) => handler.receive(received)));
  }
}

export function createStudioPeerBulkExchange(
  fabric: StudioPeerFabricPort,
  options: Omit<StudioPeerBulkTransferOptions, "onOffer" | "onReceive"> = {},
): StudioPeerBulkExchangePort {
  return new StudioPeerBulkExchange(fabric, options);
}
