/**
 * 가상 공간 주야 사이클 (24시간 가상 시계)
 *
 * - 소유권: 페이지는 가상 시계를 소유하고 1초마다 `now`를 캔버스에 전달한다.
 *   (`setDayNightCycle({ ...getDayNightCycle(), now })`)
 * - 이 모듈은 순수 시간 계산만 한다: 가상 시각 → 하루 중 비율(0~1)과
 *   시간대 이름. 비율은 순찰 배우의 밤 휴식·대피 같은 행동 판정과
 *   조명 패널의 시간대 표시에만 쓰인다.
 * - 화면 전체에 깔리는 틴트 오버레이는 뿌옇고 가독성이 떨어져 제거했다.
 *   이 모듈에 틴트 색상·알파를 산출하는 경로는 두지 않는다 — 밤 분위기는
 *   창문 조명·네온 같은 국소 광원이 담당한다.
 */

/** 하루 한 바퀴 (ms). */
export const STUDIO_DAY_NIGHT_CYCLE_MS = 24 * 60 * 60 * 1000;

/** 가상 시계(ms)를 0~1 비율로 정규화. */
export function studioDayNightTimeOfDay(nowMs: number, startMs: number, cycleMs: number = STUDIO_DAY_NIGHT_CYCLE_MS): number {
  const cycle = Number.isFinite(cycleMs) && cycleMs > 0 ? cycleMs : STUDIO_DAY_NIGHT_CYCLE_MS;
  const safeNow = Number.isFinite(nowMs) ? nowMs : 0;
  const safeStart = Number.isFinite(startMs) ? startMs : 0;
  const ratio = ((safeNow - safeStart) % cycle + cycle) % cycle / cycle;
  return ratio;
}

/** 하루 중 이름 (UI 라벨용). */
export function studioDayNightName(timeOfDay: number): { readonly ko: string; readonly en: string } {
  const hour = Math.floor(timeOfDay * 24);
  if (hour >= 5 && hour < 8) return { ko: "새벽", en: "Dawn" };
  if (hour >= 8 && hour < 12) return { ko: "아침", en: "Morning" };
  if (hour >= 12 && hour < 17) return { ko: "낮", en: "Day" };
  if (hour >= 17 && hour < 20) return { ko: "해질녘", en: "Dusk" };
  return { ko: "밤", en: "Night" };
}
