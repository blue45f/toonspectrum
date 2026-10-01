/**
 * 메가폰 방송 React 바인딩 (T4).
 *
 * MegaphoneSession 상태머신을 감싸고, 방송 시작 시 T1의 화면 공유와 연결한다.
 * `shareScreen: true`면 PlaceMediaSession.startScreenShare({ scope: "broadcast" })
 * 를 함께 호출하고, 방송 종료 시 공유도 함께 멈춘다.
 * 실제 음성 송출은 로컬 시뮬레이션 범위다.
 */

import { useEffect, useState } from "react";

import type { StudioTeamRole } from "../studio-team-client";
import type { StudioShareBandwidth } from "./studio-virtual-space-bubble-share";
import {
  canMegaphoneBroadcast,
  MegaphoneSession,
  type MegaphoneScope,
  type MegaphoneSessionSnapshot,
} from "./studio-virtual-space-megaphone";

/** 화면 공유 장치 연결부. PlaceMediaSession의 좁은 구조적 인터페이스다. */
export interface MegaphoneMediaLink {
  readonly startScreenShare: (options?: {
    readonly scope?: "broadcast";
    readonly bandwidth?: StudioShareBandwidth;
  }) => Promise<void>;
  readonly stopScreenShare: () => void;
}

export interface UseStudioVirtualSpaceMegaphoneInput {
  readonly role: StudioTeamRole;
  readonly broadcasterName: string;
  readonly media?: MegaphoneMediaLink | null;
}

export interface StudioVirtualSpaceMegaphoneBinding {
  readonly snapshot: MegaphoneSessionSnapshot;
  /** 현재 역할이 방송 권한을 가졌는지. */
  readonly canBroadcast: boolean;
  readonly start: (scope: MegaphoneScope, options?: {
    readonly shareScreen?: boolean;
    readonly bandwidth?: StudioShareBandwidth;
  }) => Promise<void>;
  readonly stop: () => void;
  readonly pushCaption: (textKo: string, textEn?: string) => void;
}

export function useStudioVirtualSpaceMegaphone(
  input: UseStudioVirtualSpaceMegaphoneInput,
): StudioVirtualSpaceMegaphoneBinding {
  const { role, broadcasterName, media = null } = input;
  const [session] = useState(() => new MegaphoneSession());
  const [snapshot, setSnapshot] = useState<MegaphoneSessionSnapshot>(() => session.getSnapshot());

  useEffect(() => session.subscribe(setSnapshot), [session]);

  const canBroadcast = canMegaphoneBroadcast(role);

  return {
    snapshot,
    canBroadcast,
    start: async (scope, options = {}) => {
      if (!canBroadcast) {
        session.fail("메가폰 방송 권한이 없습니다. / No megaphone permission.");
        return;
      }
      if (options.shareScreen === true && media) {
        try {
          await media.startScreenShare({ scope: "broadcast", bandwidth: options.bandwidth ?? "balanced" });
        } catch (error) {
          session.fail(error instanceof Error ? error.message : "screen share failed");
          return;
        }
      }
      session.start({ scope, broadcasterName, shareScreen: options.shareScreen === true && media != null });
    },
    stop: () => {
      if (session.getSnapshot().sharingScreen) {
        try { media?.stopScreenShare(); } catch { /* 무시 */ }
        session.setSharingScreen(false);
      }
      session.stop();
    },
    pushCaption: (textKo, textEn) => session.pushCaption(textKo, textEn),
  };
}
