// 웹툰 인기 대결 — 클래식 Higher/Lower(높낮이 맞히기)의 순수 엔진.
// 앵커 웹툰의 조회수가 공개된 상태에서, 도전자 웹툰이 조회수가 더 많은지/적은지를 맞힌다.
// 상태 전이/도전자 추첨/판정을 순수 함수로 처리한다(React/DOM 의존 없음 → 단위 테스트).

import type { PlayTitle } from "../../play-types";

export type Guess = "higher" | "lower";

export interface DuelState {
  /** 기준이 되는(조회수 공개된) 웹툰. */
  anchor: PlayTitle;
  /** 비교 대상(아직 조회수 미공개) 웹툰. */
  challenger: PlayTitle;
  score: number;
  best: number;
  /** 게임 종료(오답) 여부. */
  over: boolean;
  /** 직전 판정 결과(애니메이션/문구용). 첫 라운드는 null. */
  lastCorrect: boolean | null;
}

/** 게임에 충분한 풀이 있는지(최소 2편). */
export function hasEnoughTitles(pool: readonly PlayTitle[]): boolean {
  return pool.length >= 2;
}

/**
 * 앵커가 아닌 도전자 1편을 무작위로 뽑는다(주입 rng).
 * 절대 앵커와 같은 id를 반환하지 않는다. 후보가 없으면(풀이 앵커뿐) 앵커를 그대로 반환.
 */
export function nextChallenger(
  pool: readonly PlayTitle[],
  currentId: string,
  rng: () => number,
): PlayTitle {
  const candidates = pool.filter((t) => t.id !== currentId);
  if (candidates.length === 0) {
    // 풀에 다른 후보가 전혀 없음 — 호출 측 가드용 폴백.
    return pool[0] ?? ({ id: currentId } as PlayTitle);
  }
  const idx = Math.floor(rng() * candidates.length);
  return candidates[Math.min(idx, candidates.length - 1)];
}

/**
 * 판정 — 도전자 조회수가 앵커보다 더 많은지(higher)/적은지(lower)를 맞혔는지.
 * 동률은 어느 쪽 추측이든 정답 처리(플레이어에게 유리).
 */
export function judge(anchorViews: number, challengerViews: number, guess: Guess): boolean {
  if (challengerViews === anchorViews) return true;
  return guess === "higher" ? challengerViews > anchorViews : challengerViews < anchorViews;
}

/** 새 게임 시작 — 앵커 + 첫 도전자 추첨. best는 이어받는다. */
export function startDuel(pool: readonly PlayTitle[], rng: () => number, best = 0): DuelState {
  const anchorIdx = Math.floor(rng() * pool.length);
  const anchor = pool[Math.min(anchorIdx, pool.length - 1)];
  const challenger = nextChallenger(pool, anchor.id, rng);
  return {
    anchor,
    challenger,
    score: 0,
    best,
    over: false,
    lastCorrect: null,
  };
}

/**
 * 추측 처리 — 정답이면 점수 +1, 도전자가 새 앵커가 되고 신선한 도전자가 들어온다(무한 런).
 * 오답이면 게임 종료(over). best 갱신.
 */
export function guessNext(
  state: DuelState,
  guess: Guess,
  pool: readonly PlayTitle[],
  rng: () => number,
): DuelState {
  if (state.over) return state;
  const correct = judge(state.anchor.views, state.challenger.views, guess);
  if (!correct) {
    return {
      ...state,
      over: true,
      lastCorrect: false,
      best: Math.max(state.best, state.score),
    };
  }
  const score = state.score + 1;
  const newAnchor = state.challenger;
  return {
    anchor: newAnchor,
    challenger: nextChallenger(pool, newAnchor.id, rng),
    score,
    best: Math.max(state.best, score),
    over: false,
    lastCorrect: true,
  };
}
