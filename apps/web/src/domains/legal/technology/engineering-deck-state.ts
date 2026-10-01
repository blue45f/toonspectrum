/**
 * 발표 모드 URL 상태.
 *
 * - 정본 형식: `/about/technology/deck?track=talk#slide-3` (슬라이드 번호는 1부터).
 * - 발표자 창: `?track=talk&view=presenter#slide-3`.
 * - 이전 형식(`?audience=seminar&duration=30#deck=seminar:9`)도 계속 연다.
 *   seminar → talk, investor → brief, study → lecture로 옮기고 번호는 그대로 유지한다.
 */

export const DECK_TRACKS = ["talk", "brief", "lecture"] as const;
export type DeckTrack = (typeof DECK_TRACKS)[number];
export type DeckView = "audience" | "presenter";

export interface EngineeringDeckState {
  readonly track: DeckTrack;
  /** 0부터 시작하는 슬라이드 위치. 범위 제한은 `clampDeckIndex`로 한다. */
  readonly index: number;
  readonly view: DeckView;
}

const LEGACY_AUDIENCE_TRACK = {
  seminar: "talk",
  investor: "brief",
  study: "lecture",
} as const satisfies Record<string, DeckTrack>;

type LegacyAudience = keyof typeof LEGACY_AUDIENCE_TRACK;

const MAX_SLIDE_DIGITS = 4;

export function isDeckTrack(value: unknown): value is DeckTrack {
  return DECK_TRACKS.some((track) => track === value);
}

function isLegacyAudience(value: unknown): value is LegacyAudience {
  return typeof value === "string" && Object.hasOwn(LEGACY_AUDIENCE_TRACK, value);
}

function slidePositionFromHash(hash: string): number | null {
  const current = new RegExp(`^#slide-(\\d{1,${MAX_SLIDE_DIGITS}})$`, "u").exec(hash);
  const legacy = /^#deck=(?:investor|seminar|study):(\d{1,6})$/u.exec(hash);
  const raw = current?.[1] ?? legacy?.[1];
  if (!raw) return null;
  const position = Number(raw);
  return Number.isSafeInteger(position) && position > 0 ? position : null;
}

export function parseEngineeringDeckState(search: string, hash: string): EngineeringDeckState {
  const query = new URLSearchParams(search);
  const requestedTrack = query.get("track");
  const legacyHashAudience = /^#deck=(investor|seminar|study):/u.exec(hash)?.[1];
  const legacyAudience = legacyHashAudience ?? query.get("audience");
  const track: DeckTrack = isDeckTrack(requestedTrack)
    ? requestedTrack
    : isLegacyAudience(legacyAudience)
      ? LEGACY_AUDIENCE_TRACK[legacyAudience]
      : "talk";
  const position = slidePositionFromHash(hash);
  return {
    track,
    index: position === null ? 0 : position - 1,
    view: query.get("view") === "presenter" ? "presenter" : "audience",
  };
}

export function clampDeckIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, Math.floor(index)));
}

export function engineeringDeckSearch(state: Pick<EngineeringDeckState, "track" | "view">): string {
  const query = new URLSearchParams({ track: state.track });
  if (state.view === "presenter") query.set("view", "presenter");
  return `?${query.toString()}`;
}

export function engineeringDeckHash(index: number): string {
  return `#slide-${Math.max(0, Math.floor(index)) + 1}`;
}

export function engineeringDeckHref(
  state: Pick<EngineeringDeckState, "track" | "index"> & { readonly view?: DeckView },
): string {
  return `/about/technology/deck${engineeringDeckSearch({ track: state.track, view: state.view ?? "audience" })}${engineeringDeckHash(state.index)}`;
}
