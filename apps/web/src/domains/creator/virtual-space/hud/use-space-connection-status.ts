import { useSyncExternalStore } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { useStudioLiveCollaboration } from "../../live/studio-live-collaboration-context";
import {
  getStudioConnectivityServerSnapshot,
  getStudioConnectivitySnapshot,
  subscribeStudioConnectivity,
} from "../../offline/studio-connectivity";

export type SpaceConnectionTone = "good" | "warn" | "bad";

export interface SpaceConnectionStatus {
  readonly tone: SpaceConnectionTone;
  readonly label: string;
}

/** 프로젝트 공간의 실시간 연결 상태를 색과 글자로 함께 표현한다(색만으로 전달하지 않는다). */
export function useSpaceConnectionStatus(preparing: boolean): SpaceConnectionStatus {
  const bt = useBilingual("StudioVirtualSpaceConnectionBadge");
  const live = useStudioLiveCollaboration();
  const connectivity = useSyncExternalStore(subscribeStudioConnectivity, getStudioConnectivitySnapshot, getStudioConnectivityServerSnapshot);
  const direct = Boolean(live.room?.direct && live.availability === "ready");
  const tone: SpaceConnectionTone = connectivity.localOnly ? "warn" : direct ? "good" : live.availability === "error" ? "bad" : "warn";
  const label = connectivity.mode === "offline"
    ? bt("오프라인 · 로컬 작업", "Offline · local work")
    : connectivity.mode === "server-unavailable"
      ? bt("서버 연결 없음 · 로컬 작업", "Server unavailable · local work")
      : connectivity.mode === "reconnecting"
        ? bt("온라인 복구 중", "Reconnecting")
        : preparing
          ? bt("실시간 연결 준비 중", "Preparing live connection")
          : direct
            ? bt("P2P 연결됨", "P2P connected")
            : live.availability === "ready"
              ? bt("접속 정보 연결됨", "Presence connected")
              : live.availability === "error"
                ? bt("연결 확인 필요", "Connection needs attention")
                : bt("연결 중", "Connecting");
  return { tone, label };
}
