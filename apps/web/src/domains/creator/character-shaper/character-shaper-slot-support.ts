import type {
  CharacterSlotAvailability,
  CharacterSlotEntry,
} from "./character-shaper-contract";

export type CharacterSlotSupportStatus =
  | "fully-supported"
  | "partially-supported"
  | "unavailable"
  | "unknown";

export interface CharacterSlotSupportSummary {
  readonly status: CharacterSlotSupportStatus;
  readonly label: string;
  readonly available: number;
  readonly partial: number;
  readonly unavailable: number;
  readonly total: number;
}

export interface SummarizeCharacterSlotSupportOptions {
  readonly ready?: boolean;
}

export function summarizeCharacterSlotSupport(
  entries: readonly CharacterSlotEntry[],
  evaluate: (entry: CharacterSlotEntry) => CharacterSlotAvailability,
  options: SummarizeCharacterSlotSupportOptions = {},
): CharacterSlotSupportSummary {
  if (options.ready === false || entries.length === 0) {
    return Object.freeze({
      status: "unknown",
      label: "지원 정보 없음",
      available: 0,
      partial: 0,
      unavailable: 0,
      total: 0,
    });
  }
  let available = 0;
  let partial = 0;
  let unavailable = 0;
  for (const entry of entries) {
    const status = evaluate(entry).status;
    if (status === "available") available += 1;
    else if (status === "partial") partial += 1;
    else unavailable += 1;
  }
  const status: CharacterSlotSupportStatus = available === entries.length
    ? "fully-supported"
    : available + partial > 0
      ? "partially-supported"
      : "unavailable";
  const label = status === "fully-supported"
    ? `완전 지원 ${available}개`
    : status === "partially-supported"
      ? `일부 지원 · 완전 ${available} · 일부 ${partial} · 불가 ${unavailable}`
      : `적용 불가 ${unavailable}개`;
  return Object.freeze({ status, label, available, partial, unavailable, total: entries.length });
}
