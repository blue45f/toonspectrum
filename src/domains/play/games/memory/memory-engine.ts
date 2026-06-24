// 웹툰 짝맞추기(집중력/메모리 매치) — 순수 엔진.
// 실제 웹툰 카탈로그에서 N쌍을 뽑아 같은 커버를 가진 2N개의 타일 보드를 구성하고,
// 뒤집기/판정(매치·미스매치)/이동 횟수의 상태 전이를 순수 함수로 처리한다
// (React/DOM 의존 없음 → 단위 테스트). 무작위성은 주입된 rng로만.

import type { PlayTitle } from "../../play-types";

/** 보드 타일 1개 — 같은 titleId를 가진 두 타일이 한 쌍. */
export interface Tile {
  /** 타일 인스턴스 고유 id(보드 내 위치 안정). */
  id: string;
  /** 짝 판정 기준이 되는 웹툰 id. */
  titleId: string;
  /** OKLCH 그라디언트 2색(커버 폴백/배경). */
  cover: [string, string];
  /** 프록시된 실제 커버 이미지 URL(있으면). */
  coverImage?: string;
  /** 웹툰 제목(접근성 라벨/매치 표시). */
  name: string;
}

/** 게임 상태. flipped = 현재 앞면으로 뒤집힌(미판정) 타일 id들(최대 2). */
export interface MemoryState {
  tiles: Tile[];
  /** 판정 대기 중 앞면 타일 id(0~2개). */
  flipped: string[];
  /** 짝이 맞아 영구히 앞면 고정된 타일 id 집합. */
  matched: string[];
  /** 누적 시도(두 장을 뒤집어 판정한 횟수). */
  moves: number;
  /** 직전 판정 직후 잠금(미스매치 애니메이션 동안 입력 차단). */
  locked: boolean;
}

export type MemoryAction =
  | { type: "flip"; id: string }
  | { type: "resolve" }
  | { type: "reset"; tiles: Tile[] };

/** Fisher–Yates(주입 rng) — 입력 불변. */
export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 보드 구성 — titles에서 pairs쌍(중복 titleId 제외)을 뽑아 각 쌍을 2장씩 만든 뒤
 * 전체를 섞는다. 결정적(rng 주입). titles가 부족하면 가능한 만큼만 만든다.
 */
export function buildBoard(
  titles: readonly PlayTitle[],
  pairs: number,
  rng: () => number,
): Tile[] {
  // 같은 웹툰이 두 쌍으로 중복되지 않도록 titleId 기준 중복 제거.
  const seen = new Set<string>();
  const unique: PlayTitle[] = [];
  for (const t of titles) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    unique.push(t);
  }
  const chosen = shuffle(unique, rng).slice(0, Math.max(0, pairs));
  const tiles: Tile[] = [];
  chosen.forEach((t, i) => {
    for (let copy = 0; copy < 2; copy++) {
      tiles.push({
        id: `${i}-${copy}`,
        titleId: t.id,
        cover: t.cover,
        coverImage: t.coverImage,
        name: t.title,
      });
    }
  });
  return shuffle(tiles, rng);
}

/** 새 게임 초기 상태(타일은 외부에서 buildBoard로 구성해 주입). */
export function initState(tiles: Tile[]): MemoryState {
  return { tiles, flipped: [], matched: [], moves: 0, locked: false };
}

/** 모든 타일이 매치되었는지(승리 조건). */
export function isSolved(state: MemoryState): boolean {
  return state.tiles.length > 0 && state.matched.length === state.tiles.length;
}

/** 해당 타일이 현재 보이는(앞면) 상태인지 — 판정 대기 또는 매치 완료. */
export function isFaceUp(state: MemoryState, id: string): boolean {
  return state.flipped.includes(id) || state.matched.includes(id);
}

function tileById(state: MemoryState, id: string): Tile | undefined {
  return state.tiles.find((t) => t.id === id);
}

/**
 * 상태 전이 리듀서.
 * - flip: 잠금/이미 앞면/2장이상이면 무시. 1장 뒤집으면 그대로, 2장째면 moves++ 후 잠금
 *   (매치면 즉시 matched에 합류해 잠금 해제, 미스매치면 잠금 유지 → resolve 대기).
 * - resolve: 미스매치 잠금 해제(앞면 2장 뒤집어 닫음). 매치/비잠금 상태면 no-op.
 * - reset: 새 보드로 초기화.
 */
export function flipReducer(state: MemoryState, action: MemoryAction): MemoryState {
  switch (action.type) {
    case "reset":
      return initState(action.tiles);

    case "resolve": {
      // 미스매치로 잠긴 경우에만 두 장을 닫는다.
      if (!state.locked || state.flipped.length < 2) return state;
      return { ...state, flipped: [], locked: false };
    }

    case "flip": {
      const { id } = action;
      if (state.locked) return state;
      if (state.matched.includes(id) || state.flipped.includes(id)) return state;
      if (state.flipped.length >= 2) return state;
      const tile = tileById(state, id);
      if (!tile) return state;

      // 첫 번째 카드 뒤집기.
      if (state.flipped.length === 0) {
        return { ...state, flipped: [id] };
      }

      // 두 번째 카드 — 판정.
      const firstId = state.flipped[0];
      const first = tileById(state, firstId);
      const moves = state.moves + 1;
      if (first && first.titleId === tile.titleId) {
        // 매치 — 두 장을 matched로, flipped 비우고 잠금 해제(연속 진행 가능).
        return {
          ...state,
          flipped: [],
          matched: [...state.matched, firstId, id],
          moves,
          locked: false,
        };
      }
      // 미스매치 — 두 장 앞면 유지 + 잠금(resolve가 닫을 때까지 입력 차단).
      return { ...state, flipped: [firstId, id], moves, locked: true };
    }

    default:
      return state;
  }
}
