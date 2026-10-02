/**
 * 메가폰 방송 (T4).
 *
 * 스포트라이트의 "우선 발화" 개념을 전사 방송으로 확장한다.
 * - 범위: room(현재 방) | world(전체 월드).
 * - 권한: 역할 태그 기반 — owner·admin만 방송할 수 있다.
 * - 방송 중 화면 공유(T1)와 연결: start({shareScreen:true})면
 *   PlaceMediaSession.startScreenShare({ scope: "broadcast" })를 호출한다.
 * - 청취자 측 자막: MegaphoneCaption 목록을 푸시하고 최대 개수를 유지한다.
 *
 * 실제 음성 송출은 로컬 시뮬레이션 범위다. 실제 P2P/SFU 송출은 후속 작업.
 */

import type { StudioTeamRole } from "../studio-team-client";

/** 메가폰 방송 범위. */
export type MegaphoneScope = "room" | "world";

/** 메가폰 방송 세션 상태. */
export type MegaphoneSessionStatus = "idle" | "broadcasting" | "failed";

/** 방송 권한: owner·admin만 메가폰을 켤 수 있다. */
export function canMegaphoneBroadcast(role: StudioTeamRole): boolean {
  return role === "owner" || role === "admin";
}

/** 청취자 자막 한 줄. */
export interface MegaphoneCaption {
  readonly id: string;
  readonly textKo: string;
  readonly textEn: string;
  /** 방송 중 화면 공유 중이면 청취자 배너에 함께 표시한다. */
  readonly sharingScreen: boolean;
  readonly createdAt: number;
}

export const MEGAPHONE_MAX_CAPTIONS = 20;

let captionSequence = 0;

function nextCaptionId(): string {
  captionSequence += 1;
  return `megaphone-caption-${Date.now().toString(36)}-${captionSequence}`;
}

/** 자막을 푸시하고 최대 개수를 유지한다. */
export function pushMegaphoneCaption(
  captions: readonly MegaphoneCaption[],
  input: { readonly textKo: string; readonly textEn?: string; readonly sharingScreen?: boolean; readonly createdAt?: number },
): readonly MegaphoneCaption[] {
  const textKo = input.textKo.trim();
  if (!textKo) return captions;
  const textEn = input.textEn?.trim() || textKo;
  const caption: MegaphoneCaption = {
    id: nextCaptionId(),
    textKo: textKo.slice(0, 300),
    textEn: textEn.slice(0, 300),
    sharingScreen: input.sharingScreen ?? false,
    createdAt: input.createdAt ?? Date.now(),
  };
  const next = [...captions, caption];
  return Object.freeze(next.slice(-MEGAPHONE_MAX_CAPTIONS));
}

function cleanCaptionText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= 300 ? text : null;
}

/** 메가폰 방송 세션 스냅샷. */
export interface MegaphoneSessionSnapshot {
  readonly status: MegaphoneSessionStatus;
  readonly scope: MegaphoneScope;
  readonly broadcasterName: string;
  readonly sharingScreen: boolean;
  readonly captions: readonly MegaphoneCaption[];
  readonly error: string | null;
}

export interface MegaphoneSessionOptions {
  readonly scope?: MegaphoneScope;
  readonly broadcasterName?: string;
  readonly shareScreen?: boolean;
  readonly now?: () => number;
}

const INITIAL: MegaphoneSessionSnapshot = {
  status: "idle",
  scope: "room",
  broadcasterName: "",
  sharingScreen: false,
  captions: [],
  error: null,
};

/**
 * 메가폰 방송 세션 상태머신. 리스너로 스냅샷을 전파한다.
 * 실제 송출/화면공유 장치는 호출자(useStudioVirtualSpaceMegaphone)가 다룬다.
 */
export class MegaphoneSession {
  private snapshot: MegaphoneSessionSnapshot = INITIAL;
  private readonly listeners = new Set<(snapshot: MegaphoneSessionSnapshot) => void>();
  private readonly now: () => number;

  constructor(options?: { readonly now?: () => number }) {
    this.now = options?.now ?? (() => Date.now());
  }

  getSnapshot(): MegaphoneSessionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: MegaphoneSessionSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => { this.listeners.delete(listener); };
  }

  private emit(): void {
    this.listeners.forEach((listener) => {
      try { listener(this.snapshot); } catch { /* 무시 */ }
    });
  }

  private set(partial: Partial<MegaphoneSessionSnapshot>): void {
    this.snapshot = Object.freeze({ ...this.snapshot, ...partial });
    this.emit();
  }

  /**
   * 방송 시작. 권한(role)은 호출자가 canMegaphoneBroadcast로 먼저 확인한다.
   * shareScreen이 true면 호출자가 화면 공유 장치도 함께 시작한다.
   */
  start(options: MegaphoneSessionOptions = {}): void {
    if (this.snapshot.status === "broadcasting") return;
    const name = cleanCaptionText(options.broadcasterName) ?? "";
    this.set({
      status: "broadcasting",
      scope: options.scope === "world" ? "world" : "room",
      broadcasterName: name,
      sharingScreen: options.shareScreen === true,
      error: null,
    });
  }

  /** 방송 중지. */
  stop(): void {
    if (this.snapshot.status !== "broadcasting") return;
    this.set({ ...INITIAL, captions: this.snapshot.captions });
  }

  /** 청취자 자막 추가. */
  pushCaption(textKo: string, textEn?: string): void {
    const cleaned = cleanCaptionText(textKo);
    if (!cleaned) return;
    this.set({
      captions: pushMegaphoneCaption(this.snapshot.captions, {
        textKo: cleaned,
        textEn,
        sharingScreen: this.snapshot.sharingScreen,
        createdAt: this.now(),
      }),
    });
  }

  /** 화면 공유 상태 반영 (방송 중 공유 시작/중지 시). */
  setSharingScreen(sharing: boolean): void {
    if (this.snapshot.sharingScreen === sharing) return;
    this.set({ sharingScreen: sharing });
  }

  /** 방송 실패 표시. */
  fail(message: string): void {
    this.set({ status: "failed", error: message.slice(0, 200) });
  }
}
