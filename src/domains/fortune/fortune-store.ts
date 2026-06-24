import { create } from "zustand";
import { persist } from "zustand/middleware";

// 운세 페이지 재방문 영속화 — 생년월일 등 입력을 기억해 재입력을 없애고,
// 운세를 본 날짜를 모아 '연속 출석(스트릭)'을 계산한다. localStorage 영속.

export interface FortuneProfile {
  lastCharacterId: string | null;
  birthDate: string;
  birthTime: string;
  gender: string;
  partnerBirthDate: string;
  partnerBirthTime: string;
}

interface FortuneStore extends FortuneProfile {
  viewedDates: string[]; // 운세를 본 KST 날짜(YYYY-MM-DD) 모음
  setProfile: (patch: Partial<FortuneProfile>) => void;
  recordView: () => void;
}

// KST 기준 오늘 날짜
function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const useFortuneStore = create<FortuneStore>()(
  persist(
    (set) => ({
      lastCharacterId: null,
      birthDate: "",
      birthTime: "",
      gender: "none",
      partnerBirthDate: "",
      partnerBirthTime: "",
      viewedDates: [],
      setProfile: (patch) => set(patch),
      recordView: () =>
        set((s) => {
          const today = todayKst();
          if (s.viewedDates.includes(today)) return s;
          // 최근 60일치만 보관
          const next = [...s.viewedDates, today].slice(-60);
          return { viewedDates: next };
        }),
    }),
    {
      name: "toonspectrum-fortune",
      version: 1,
    }
  )
);

// 연속 출석일 계산 — 오늘(또는 어제)부터 끊김 없이 이어진 일수
export function computeStreak(viewedDates: string[]): number {
  if (viewedDates.length === 0) return 0;
  const set = new Set(viewedDates);
  const dayMs = 24 * 60 * 60 * 1000;
  const base = new Date(todayKst() + "T00:00:00Z").getTime();
  // 오늘 안 봤으면 어제부터 카운트(아직 오늘 볼 수 있으니 끊김 아님)
  let cursor = set.has(todayKst()) ? base : base - dayMs;
  let streak = 0;
  while (set.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak += 1;
    cursor -= dayMs;
  }
  return streak;
}
