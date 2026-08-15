import type {
  StudioLiveTransport,
  StudioLiveTransportControlEvent,
  StudioLiveTransportFactory,
  StudioLiveTransportStatus,
} from "./studio-live-collaboration-transport";

/**
 * Server-mode shell used when production has Cloudflare presence/signaling but no
 * Nest Socket.IO CRDT host. Purpose-routing and the P2P overlay can wrap this
 * without advertising a BroadcastChannel as a remote room.
 */
export function createStudioLiveSignalingServerTransport(): StudioLiveTransport {
  const listeners = new Set<(value: unknown) => void>();
  const controlListeners = new Set<(event: StudioLiveTransportControlEvent) => void>();
  let connected = false;
  let closed = false;

  const emitControl = (status: StudioLiveTransportStatus): void => {
    const event: StudioLiveTransportControlEvent = { type: "status", status };
    for (const listener of controlListeners) {
      try {
        listener(event);
      } catch {
        // Room observers do not own this signaling shell.
      }
    }
  };

  return {
    mode: "server",
    crdtFanout: "none",
    get ready() {
      return connected && !closed;
    },
    connect() {
      if (closed) {
        return Promise.reject(new Error("이미 닫힌 실시간 시그널 채널입니다."));
      }
      connected = true;
      emitControl({
        state: "ready",
        message: "실시간 시그널에 연결했습니다.",
        recoverable: true,
      });
      return Promise.resolve();
    },
    send() {
      return false;
    },
    subscribe(listener) {
      if (closed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeControl(listener) {
      if (closed) return () => undefined;
      controlListeners.add(listener);
      return () => controlListeners.delete(listener);
    },
    close() {
      if (closed) return;
      closed = true;
      connected = false;
      listeners.clear();
      controlListeners.clear();
    },
  };
}

export const createStudioLiveSignalingServerTransportFactory: StudioLiveTransportFactory =
  () => createStudioLiveSignalingServerTransport();
