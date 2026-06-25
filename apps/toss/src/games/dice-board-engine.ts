// 웹툰 주사위 보드 — 단판 레이스 보드의 순수 엔진.
// ~30칸의 선형 트랙을 주사위(1..6)로 전진해 골(마지막 칸)에 도달/통과하면 승리.
// 일부 칸은 이벤트 칸: 추천(+점수, 추천 웹툰 카드 공개) · 전진(+2칸) · 후퇴(-3칸) · 함정(한 턴 쉼).
// 칸 종류와 추천 인덱스 부여는 주입 rng로 결정적이며, React/DOM 의존이 없다(단위 테스트).

export const BOARD_SIZE = 30; // 칸 0..30 (0=출발, BOARD_SIZE=골)
export const RECOMMEND_SCORE = 25; // 추천 칸 점수
const TILE_STEP_SCORE = 1; // 한 칸 전진당 기본 점수
const FORWARD_STEPS = 2;
const BACK_STEPS = 3;

export type TileType = "start" | "normal" | "goal" | "recommend" | "forward" | "back" | "trap";

export interface Tile {
  /** 보드상의 인덱스 0..BOARD_SIZE. */
  index: number;
  type: TileType;
}

export interface BoardState {
  tiles: Tile[];
  /** 현재 말 위치 0..BOARD_SIZE. */
  pos: number;
  /** 직전 주사위 값(0=아직 안 굴림 또는 쉬는 턴). */
  dice: number;
  score: number;
  /** 한 턴 쉼 잔여 횟수(함정). */
  skipTurns: number;
  /** 굴린 총 횟수(턴 카운트). */
  rolls: number;
  /** 수집한 추천 웹툰의 title 인덱스(usePlayTitles 배열 기준). */
  collected: number[];
  /** 추천으로 부여 가능한 title 후보 개수(보유 목록 길이). */
  titleCount: number;
  /** 최근 해결된 이벤트 설명(UI 안내/aria-live). */
  lastEvent: string;
  /** 골 도달 여부. */
  finished: boolean;
}

const clampi = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

/**
 * 칸 i의 종류 결정 — 출발/골/골 직전은 고정, 그 외 내부 칸만 rng를 1회 소비해 분배.
 * (rng 소비 순서를 makeBoard의 인덱스 순회와 일치시켜 결정성을 보장한다.)
 */
function tileTypeAt(i: number, rng: () => number): TileType {
  if (i === 0) return "start";
  if (i === BOARD_SIZE) return "goal";
  if (i >= BOARD_SIZE - 1) return "normal"; // 골 직전 칸은 평범하게.
  const r = rng();
  // 약 55% 평범, 나머지는 이벤트 칸으로 분배.
  if (r < 0.2) return "recommend";
  if (r < 0.3) return "forward";
  if (r < 0.4) return "back";
  if (r < 0.45) return "trap";
  return "normal";
}

/**
 * 보드 생성 — 0=출발, BOARD_SIZE=골, 그 사이 칸을 결정적으로 이벤트 칸으로 배치.
 * 같은 rng 시드면 같은 보드. 출발/골은 항상 고정, 골 직전 칸은 함정/후퇴를 피해 안정적 마무리.
 */
export function makeBoard(rng: () => number): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i <= BOARD_SIZE; i++) {
    tiles.push({ index: i, type: tileTypeAt(i, rng) });
  }
  return tiles;
}

/**
 * 초기 상태 — 보드 생성 + 출발 칸.
 * @param titleCount 추천 칸에서 부여할 수 있는 웹툰 후보 수(usePlayTitles 길이).
 */
export function makeInitialState(rng: () => number, titleCount = 0): BoardState {
  return {
    tiles: makeBoard(rng),
    pos: 0,
    dice: 0,
    score: 0,
    skipTurns: 0,
    rolls: 0,
    collected: [],
    titleCount: Math.max(0, Math.floor(titleCount)),
    lastEvent: "출발! 주사위를 굴려 골을 향해 달려보세요.",
    finished: false,
  };
}

/** 골 도달 여부. */
export function isFinished(state: BoardState): boolean {
  return state.finished || state.pos >= BOARD_SIZE;
}

function clone(s: BoardState): BoardState {
  return {
    ...s,
    tiles: s.tiles, // 보드는 불변이므로 공유.
    collected: s.collected.slice(),
  };
}

/**
 * 주사위를 굴려(1..6) 말을 전진시키고, 도착 칸 이벤트를 해결한다.
 * - 함정으로 쉬는 턴이면 주사위를 굴리지 않고 쉼 1회를 소모한다.
 * - recommend 칸: 점수 가산 + 추천 title 인덱스 1개 수집(rng로 결정).
 * - forward: +2칸(골 넘으면 골), back: -3칸(0 미만 방지), trap: 다음 한 턴 쉼.
 * 결정적(rng 주입). 입력 불변(클론 반환).
 */
export function rollAndMove(state: BoardState, rng: () => number): BoardState {
  if (isFinished(state)) return state;
  const d = clone(state);
  d.rolls += 1;

  // 함정으로 쉬는 턴: 주사위 없이 쉼 소모.
  if (d.skipTurns > 0) {
    d.skipTurns -= 1;
    d.dice = 0;
    d.lastEvent = "함정에 빠져 이번 턴은 쉽니다…";
    return d;
  }

  const roll = clampi(rng() * 6 + 0.5, 1, 6);
  d.dice = roll;
  moveTo(d, d.pos + roll);
  if (d.finished) return d;

  resolveTile(d, rng);
  return d;
}

/** 말을 목표 인덱스로 이동(경계 처리 + 전진 점수 + 골 판정). 직접 변경. */
function moveTo(d: BoardState, target: number): void {
  const next = clampi(target, 0, BOARD_SIZE);
  const advanced = Math.max(0, next - d.pos);
  d.pos = next;
  d.score += advanced * TILE_STEP_SCORE;
  if (d.pos >= BOARD_SIZE) {
    d.pos = BOARD_SIZE;
    d.finished = true;
    d.lastEvent = "🏆 골 도착! 레이스 완주!";
  }
}

/** 도착 칸의 이벤트를 적용(연쇄 이동은 점수만 가산, 추가 이벤트 미발동). 직접 변경. */
function resolveTile(d: BoardState, rng: () => number): void {
  const tile = d.tiles[d.pos];
  switch (tile.type) {
    case "recommend": {
      d.score += RECOMMEND_SCORE;
      if (d.titleCount > 0) {
        const idx = grantRecommend(d, rng);
        d.lastEvent =
          idx >= 0
            ? `⭐ 추천 칸! 웹툰 한 편을 발견하고 +${RECOMMEND_SCORE}점.`
            : `⭐ 추천 칸! +${RECOMMEND_SCORE}점 (모든 추천을 모았습니다).`;
      } else {
        d.lastEvent = `⭐ 추천 칸! +${RECOMMEND_SCORE}점.`;
      }
      break;
    }
    case "forward": {
      d.lastEvent = `⏩ 전진 칸! ${FORWARD_STEPS}칸 앞으로.`;
      moveTo(d, d.pos + FORWARD_STEPS);
      break;
    }
    case "back": {
      d.lastEvent = `⏪ 후퇴 칸! ${BACK_STEPS}칸 뒤로.`;
      moveTo(d, d.pos - BACK_STEPS);
      break;
    }
    case "trap": {
      d.skipTurns += 1;
      d.lastEvent = "🕳️ 함정 칸! 다음 한 턴을 쉽니다.";
      break;
    }
    default: {
      d.lastEvent = `🎲 ${d.dice} — ${d.pos}칸 도착.`;
      break;
    }
  }
}

/**
 * 아직 모으지 않은 추천 title 인덱스 하나를 rng로 골라 수집한다.
 * 남은 후보가 없으면 -1 반환. 결정적(rng 주입). 직접 변경.
 */
function grantRecommend(d: BoardState, rng: () => number): number {
  const owned = new Set(d.collected);
  const remaining: number[] = [];
  for (let i = 0; i < d.titleCount; i++) {
    if (!owned.has(i)) remaining.push(i);
  }
  if (remaining.length === 0) return -1;
  const pick = remaining[Math.floor(rng() * remaining.length)];
  d.collected.push(pick);
  return pick;
}
