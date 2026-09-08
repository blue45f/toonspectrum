import { isStudioLiveJamScope } from "@/shared/lib/studio-live-jam-scope";

import type {
  StudioLiveTransport,
  StudioLiveTransportContext,
  StudioLiveTransportControlEvent,
} from "./studio-live-collaboration-transport";

export const STUDIO_LIVE_UNSUPPORTED_JAM_MESSAGE =
  "이 서버는 저장 전 공동 작업실을 지원하지 않습니다. 현재 문서를 먼저 초안으로 저장한 다음 공동 편집을 시작하세요. 협업 서버 설정을 변경했다면 새로고침 후 다시 시도하세요.";

const ADMISSION_DENIED_PREFIX = "작업실 참여 거절: ";

/** Presentation only. Neither this message nor a room name grants work access. */
export function formatStudioLiveAdmissionDeniedMessage(message: string): string {
  return message.startsWith(ADMISSION_DENIED_PREFIX)
    ? message
    : `${ADMISSION_DENIED_PREFIX}${message}`;
}

export function isStudioLiveAdmissionDeniedMessage(message: string): boolean {
  return message.startsWith(ADMISSION_DENIED_PREFIX);
}

export function isStudioLiveInstantJamTransportContext(
  context: StudioLiveTransportContext,
): boolean {
  // Purpose routing uses the canonical work scope as its room id. A BroadcastChannel name
  // is not an admission credential and cannot redirect a saved work into a jam.
  return isStudioLiveJamScope({ workId: context.workId, roomId: context.workId });
}

/** An unsupported remote document is not a local fallback or an admitted server room. */
export function createStudioLiveUnsupportedJamTransport(): StudioLiveTransport {
  const listeners = new Set<(event: StudioLiveTransportControlEvent) => void>();
  let closed = false;
  return {
    mode: "server",
    crdtFanout: "none",
    ready: false,
    async connect() {
      if (!closed) {
        for (const listener of listeners) {
          listener({
            type: "status",
            status: {
              state: "error",
              message: STUDIO_LIVE_UNSUPPORTED_JAM_MESSAGE,
              recoverable: true,
            },
          });
        }
      }
      // Retry re-evaluates configuration. Never latch revocation, create a BroadcastChannel,
      // or manufacture a CRDT persistence acknowledgement for an unsupported room.
      throw new Error(STUDIO_LIVE_UNSUPPORTED_JAM_MESSAGE);
    },
    send: () => false,
    subscribe: () => () => undefined,
    subscribeControl(listener) {
      if (closed) return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    close() {
      closed = true;
      listeners.clear();
    },
  };
}
