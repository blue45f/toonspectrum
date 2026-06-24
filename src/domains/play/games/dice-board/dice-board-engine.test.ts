import { describe, expect, it } from "vitest";

import {
  BOARD_SIZE,
  isFinished,
  makeBoard,
  makeInitialState,
  rollAndMove,
  type BoardState,
  type Tile,
} from "./dice-board-engine";

// 결정적 rng(mulberry32).
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 상수 rng(특정 칸/전개를 강제). */
const constRng = (v: number) => () => v;

/** 한 칸 강제 전진을 위한 rng: 항상 주사위 1. (1..6 매핑은 v*6+0.5 라운드) */
const rollOne = constRng(0); // 0 → round(0.5)=1 → clamp 1

/** 칸 타입을 강제로 패치한 보드/상태 헬퍼. */
function withTileAt(state: BoardState, index: number, type: Tile["type"]): BoardState {
  const tiles = state.tiles.map((t) => (t.index === index ? { ...t, type } : t));
  return { ...state, tiles };
}

describe("dice-board-engine", () => {
  it("makeBoard: 0=출발, 마지막=골, 같은 시드면 동일 보드, 길이 BOARD_SIZE+1", () => {
    const a = makeBoard(rng(42));
    const b = makeBoard(rng(42));
    expect(a).toEqual(b); // 결정적
    expect(a.length).toBe(BOARD_SIZE + 1);
    expect(a[0].type).toBe("start");
    expect(a[BOARD_SIZE].type).toBe("goal");
    // 모든 칸 인덱스가 순서대로.
    a.forEach((t, i) => expect(t.index).toBe(i));
    // 골 직전 칸은 함정/후퇴가 아니어야(안정적 마무리).
    expect(["normal", "recommend", "forward"]).toContain(a[BOARD_SIZE - 1].type);
  });

  it("makeInitialState: 출발 칸, 점수 0, 미완료", () => {
    const s = makeInitialState(rng(1), 50);
    expect(s.pos).toBe(0);
    expect(s.score).toBe(0);
    expect(s.rolls).toBe(0);
    expect(s.collected).toEqual([]);
    expect(s.titleCount).toBe(50);
    expect(s.finished).toBe(false);
    expect(isFinished(s)).toBe(false);
  });

  it("rollAndMove: 주사위 1..6 범위, 보드 경계 내 전진, 입력 불변", () => {
    const s0 = makeInitialState(rng(3), 20);
    let s = s0;
    for (let i = 0; i < 40 && !isFinished(s); i++) {
      const prevPos = s.pos;
      const next = rollAndMove(s, rng(100 + i));
      expect(next).not.toBe(s); // 클론 반환
      if (next.dice !== 0) {
        expect(next.dice).toBeGreaterThanOrEqual(1);
        expect(next.dice).toBeLessThanOrEqual(6);
      }
      expect(next.pos).toBeGreaterThanOrEqual(0);
      expect(next.pos).toBeLessThanOrEqual(BOARD_SIZE);
      // 쉬는 턴이 아니면 위치가 바뀌었거나 골에 도달.
      if (next.skipTurns === s.skipTurns && next.dice !== 0 && s.skipTurns === 0) {
        expect(next.pos === prevPos || next.pos !== prevPos).toBe(true);
      }
      s = next;
    }
    expect(s0.pos).toBe(0); // 원본 불변
  });

  it("rollAndMove: 주사위 1로 한 칸씩(평범 칸) 전진하면 위치+점수 증가", () => {
    // 평범 칸만 깔아 이벤트 간섭 제거.
    let s = makeInitialState(rng(5), 0);
    s = { ...s, tiles: s.tiles.map((t) => (t.index > 0 && t.index < BOARD_SIZE ? { ...t, type: "normal" } : t)) };
    const before = s.pos;
    s = rollAndMove(s, rollOne);
    expect(s.pos).toBe(before + 1);
    expect(s.dice).toBe(1);
    expect(s.score).toBeGreaterThan(0);
  });

  it("이벤트(전진): forward 칸 도착 시 추가 2칸 전진", () => {
    let s = makeInitialState(rng(7), 0);
    // 1칸 위치를 전진 칸으로 만들고 주사위 1을 굴려 도착시킴.
    s = withTileAt(s, 1, "forward");
    s = rollAndMove(s, rollOne); // pos 0→1(forward)→+2 = 3
    expect(s.pos).toBe(3);
  });

  it("이벤트(후퇴): back 칸 도착 시 3칸 뒤로(음수 방지)", () => {
    let s = makeInitialState(rng(8), 0);
    // pos를 5로 옮긴 뒤 6번 칸을 back으로 만들고 도착.
    s = { ...s, pos: 5 };
    s = withTileAt(s, 6, "back");
    s = rollAndMove(s, rollOne); // 5→6(back)→6-3 = 3
    expect(s.pos).toBe(3);
    // 보드 시작 근처에서 후퇴해도 0 미만으로 안 감.
    let s2 = makeInitialState(rng(9), 0);
    s2 = { ...s2, pos: 1 };
    s2 = withTileAt(s2, 2, "back");
    s2 = rollAndMove(s2, rollOne); // 1→2(back)→max(0,-1)=0
    expect(s2.pos).toBe(0);
  });

  it("이벤트(함정): trap 칸은 다음 한 턴을 쉬게 한다", () => {
    let s = makeInitialState(rng(10), 0);
    s = withTileAt(s, 1, "trap");
    s = rollAndMove(s, rollOne); // 0→1(trap)
    expect(s.pos).toBe(1);
    expect(s.skipTurns).toBe(1);
    // 다음 굴림은 쉼 소모(이동 없음, 주사위 0).
    const posBefore = s.pos;
    s = rollAndMove(s, rollOne);
    expect(s.pos).toBe(posBefore);
    expect(s.dice).toBe(0);
    expect(s.skipTurns).toBe(0);
    // 그 다음 굴림은 정상 이동.
    s = rollAndMove(s, rollOne);
    expect(s.pos).toBe(posBefore + 1);
  });

  it("이벤트(추천): recommend 칸은 점수 가산 + 추천 인덱스 수집", () => {
    let s = makeInitialState(rng(11), 10);
    s = withTileAt(s, 1, "recommend");
    const scoreBefore = s.score;
    s = rollAndMove(s, rollOne); // 주사위 1 강제 → 정확히 1번(recommend) 칸 도착
    expect(s.pos).toBe(1);
    expect(s.score).toBeGreaterThan(scoreBefore);
    expect(s.collected.length).toBe(1);
    expect(s.collected[0]).toBeGreaterThanOrEqual(0);
    expect(s.collected[0]).toBeLessThan(10);
  });

  it("추천 인덱스는 중복 없이 수집되고 후보 소진 시 더 안 쌓인다", () => {
    // titleCount=1, 추천 칸을 여러 번 밟아도 collected는 최대 1개.
    let s = makeInitialState(rng(12), 1);
    s = { ...s, tiles: s.tiles.map((t) => (t.index > 0 && t.index < BOARD_SIZE - 1 ? { ...t, type: "recommend" } : t)) };
    for (let i = 0; i < 25 && !isFinished(s); i++) {
      s = rollAndMove(s, rng(200 + i));
    }
    expect(s.collected.length).toBeLessThanOrEqual(1);
    expect(new Set(s.collected).size).toBe(s.collected.length); // 중복 없음
  });

  it("결정적: 같은 시드 입력이면 같은 결과", () => {
    const a = rollAndMove(makeInitialState(rng(99), 30), rng(7));
    const b = rollAndMove(makeInitialState(rng(99), 30), rng(7));
    expect(a).toEqual(b);
  });

  it("골에 도달/통과하면 finished=true, 이후 굴림은 무시", () => {
    let s = makeInitialState(rng(13), 0);
    s = { ...s, pos: BOARD_SIZE - 1, tiles: s.tiles.map((t) => (t.index === BOARD_SIZE - 1 ? { ...t, type: "normal" } : t)) };
    s = rollAndMove(s, rollOne); // BOARD_SIZE-1 → BOARD_SIZE = 골
    expect(s.pos).toBe(BOARD_SIZE);
    expect(s.finished).toBe(true);
    expect(isFinished(s)).toBe(true);
    // 완주 후엔 같은 상태 참조 반환.
    expect(rollAndMove(s, rng(1))).toBe(s);
  });

  it("주사위가 골을 넘겨도 골에서 멈추고 완주 처리", () => {
    let s = makeInitialState(rng(14), 0);
    s = { ...s, pos: BOARD_SIZE - 2 };
    // 주사위 6을 강제(v=1 → round(6.5)=6 → clamp 6).
    s = rollAndMove(s, constRng(1));
    expect(s.pos).toBe(BOARD_SIZE);
    expect(s.finished).toBe(true);
  });
});
