// 웹툰 인기 대결 — Higher/Lower 순수 엔진(toonspectrum 본 레포 이식).
import type { GameTitle as PlayTitle } from './types';

export type Guess = 'higher' | 'lower';

export interface DuelState {
  anchor: PlayTitle;
  challenger: PlayTitle;
  score: number;
  best: number;
  over: boolean;
  lastCorrect: boolean | null;
}

export function hasEnoughTitles(pool: readonly PlayTitle[]): boolean {
  return pool.length >= 2;
}

export function nextChallenger(pool: readonly PlayTitle[], currentId: string, rng: () => number): PlayTitle {
  const candidates = pool.filter((t) => t.id !== currentId);
  if (candidates.length === 0) return pool[0] ?? ({ id: currentId } as PlayTitle);
  const idx = Math.floor(rng() * candidates.length);
  return candidates[Math.min(idx, candidates.length - 1)];
}

export function judge(anchorViews: number, challengerViews: number, guess: Guess): boolean {
  if (challengerViews === anchorViews) return true;
  return guess === 'higher' ? challengerViews > anchorViews : challengerViews < anchorViews;
}

export function startDuel(pool: readonly PlayTitle[], rng: () => number, best = 0): DuelState {
  const anchorIdx = Math.floor(rng() * pool.length);
  const anchor = pool[Math.min(anchorIdx, pool.length - 1)];
  const challenger = nextChallenger(pool, anchor.id, rng);
  return { anchor, challenger, score: 0, best, over: false, lastCorrect: null };
}

export function guessNext(state: DuelState, guess: Guess, pool: readonly PlayTitle[], rng: () => number): DuelState {
  if (state.over) return state;
  const correct = judge(state.anchor.views, state.challenger.views, guess);
  if (!correct) {
    return { ...state, over: true, lastCorrect: false, best: Math.max(state.best, state.score) };
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
