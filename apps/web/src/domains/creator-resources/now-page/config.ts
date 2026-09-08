import {
  DAILY_THEMES,
  NOW_TIMER_SECONDS,
  type DailyTheme,
  type KstDay,
  type NowModeId,
} from "../now";

export const ACTION_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-panel px-4 py-2 text-sm font-bold text-fg transition-colors hover:border-accent/55 hover:bg-accent-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";
export const PRIMARY_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none";
export const FLOW_LINK =
  "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none";

export const ARCHIVE_DAYS = DAILY_THEMES.length;
export const WEEKLY_WINDOW_DAYS = 7;

export const SESSION_PRESETS = [
  {
    id: "quick",
    minutes: 10,
    seconds: 10 * 60,
    label: "퀵스케치",
    tagline: "막힘부터 해제",
    deliverable: "한 문장 훅과 우표 크기 썸네일 다섯 개",
    constraint: "레퍼런스 탐색 없이 형태·시선·패널 흐름만 결정합니다.",
    start: "첫 2분 안에 가장 큰 형태부터 그립니다.",
  },
  {
    id: "focus",
    minutes: 20,
    seconds: NOW_TIMER_SECONDS,
    label: "집중 제작",
    tagline: "오늘의 기본 루프",
    deliverable: "5컷 썸네일과 첫 장면 러프 한 장",
    constraint: "레퍼런스는 세 개까지만 보고 곧바로 제작으로 돌아옵니다.",
    start: "5분 조사, 10분 썸네일, 5분 독해 점검으로 나눕니다.",
  },
  {
    id: "deep",
    minutes: 40,
    seconds: 40 * 60,
    label: "딥다이브",
    tagline: "연출까지 검증",
    deliverable: "5컷 러프와 색·빛 테스트, 10초 독해 리뷰",
    constraint: "새 아이디어를 늘리기보다 선택한 한 안의 명료도를 높입니다.",
    start: "10분 리서치 뒤 남은 30분은 캔버스에서만 보냅니다.",
  },
] as const;

export type SessionPreset = (typeof SESSION_PRESETS)[number];
export type SessionPresetId = SessionPreset["id"];
export type ArchiveFilterId = "all" | "saved" | "completed";
export interface ArchiveEntry {
  day: KstDay;
  theme: DailyTheme;
}

export const MODE_SIGNALS: Record<NowModeId, readonly { label: string; value: number }[]> = {
  balanced: [
    { label: "정보 명료도", value: 82 },
    { label: "감정 압력", value: 62 },
    { label: "형식 실험", value: 48 },
  ],
  emotion: [
    { label: "정보 명료도", value: 58 },
    { label: "감정 압력", value: 92 },
    { label: "형식 실험", value: 44 },
  ],
  mystery: [
    { label: "정보 명료도", value: 68 },
    { label: "감정 압력", value: 80 },
    { label: "형식 실험", value: 61 },
  ],
  visual: [
    { label: "정보 명료도", value: 54 },
    { label: "감정 압력", value: 57 },
    { label: "형식 실험", value: 96 },
  ],
};

export function trimDates(dates: readonly string[], limit: number): string[] {
  return [...new Set(dates)].slice(-limit);
}

export function makeShareUrl(dayIso: string, todayIso: string): string {
  if (typeof window === "undefined") return "https://www.toonstudio.cloud/now";
  const origin = window.location.origin === "null" ? "https://www.toonstudio.cloud" : window.location.origin;
  const url = new URL("/now", origin);
  if (dayIso !== todayIso) url.searchParams.set("day", dayIso);
  return url.toString();
}
