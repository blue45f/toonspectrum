/**
 * tip-store.ts
 *
 * 에피소드 후원 기록의 브라우저 저장소.
 * localStorage를 원천으로 하고 변경 시 CustomEvent를 발행해
 * 여러 컴포넌트가 같은 집계 상태를 공유한다.
 */

import {
  sanitizeTipMessage,
  type EpisodeTipSummary,
  type NewTipInput,
  type TipRecord,
} from "./tip-model";

const TIP_STORAGE_KEY = "toonspectrum:monetization:tips";
export const TIP_STORE_EVENT = "toonspectrum:monetization:tips-changed";

function readStoredTips(): TipRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TIP_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is TipRecord => isTipRecord(item));
  } catch {
    return [];
  }
}

function isTipRecord(item: unknown): item is TipRecord {
  if (typeof item !== "object" || item === null) return false;
  const record = item as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.episodeId === "string" &&
    typeof record.creatorId === "string" &&
    typeof record.tipperId === "string" &&
    typeof record.amountKrw === "number" &&
    typeof record.createdAt === "string"
  );
}

function writeStoredTips(tips: readonly TipRecord[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(TIP_STORAGE_KEY, JSON.stringify(tips));
    window.dispatchEvent(new CustomEvent(TIP_STORE_EVENT));
    return true;
  } catch {
    return false;
  }
}

function createTipId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tip-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** 모든 후원 기록을 읽는다 (최신순 정렬). */
export function listTips(): TipRecord[] {
  return readStoredTips().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 특정 회차의 후원 기록을 읽는다. */
export function listTipsByEpisode(episodeId: string): TipRecord[] {
  return listTips().filter((tip) => tip.episodeId === episodeId);
}

/** 특정 창작자가 받은 후원 기록을 읽는다. */
export function listTipsByCreator(creatorId: string): TipRecord[] {
  return listTips().filter((tip) => tip.creatorId === creatorId);
}

/** 새 후원을 기록한다. */
export function recordTip(input: NewTipInput): TipRecord {
  const record: TipRecord = {
    id: createTipId(),
    episodeId: input.episodeId,
    titleId: input.titleId,
    creatorId: input.creatorId,
    tipperId: input.tipperId,
    tipperName: input.tipperName,
    amountKrw: Math.round(input.amountKrw),
    message: sanitizeTipMessage(input.message),
    status: "completed",
    orderId: input.orderId ?? null,
    createdAt: new Date().toISOString(),
  };
  const tips = readStoredTips();
  tips.push(record);
  writeStoredTips(tips);
  return record;
}

/** 후원 상태를 갱신한다 (결제 실패 등). */
export function updateTipStatus(id: string, status: TipRecord["status"]): boolean {
  const tips = readStoredTips();
  const target = tips.find((tip) => tip.id === id);
  if (!target) return false;
  const next: TipRecord = { ...target, status };
  const updated = tips.map((tip) => (tip.id === id ? next : tip));
  return writeStoredTips(updated);
}

/** 스토어 변경을 구독한다. 반환값으로 구독을 해제한다. */
export function subscribeTipStore(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(TIP_STORE_EVENT, listener);
  return () => window.removeEventListener(TIP_STORE_EVENT, listener);
}

export type { EpisodeTipSummary };
