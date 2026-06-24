import { describe, expect, it } from "vitest";

import {
  beats,
  classifyGesture,
  EMPTY_SCORE,
  matchOver,
  pickAiHand,
  resolveRound,
  scoreReducer,
  stabilizeGesture,
  type Hand,
} from "./rps-logic";

import type { FingerEulerMap } from "@/src/domains/creator/studio-vrm-hand-solver";


function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 손가락별 컬 합(rad)을 주면 3마디로 분배한 FingerEulerMap 생성(우측 손).
function curls(totals: { index: number; middle: number; ring: number; little: number }): FingerEulerMap {
  const map: Record<string, readonly [number, number, number]> = {};
  const set = (finger: string, total: number) => {
    for (const seg of ["Proximal", "Intermediate", "Distal"]) {
      map[`right${finger}${seg}`] = [0, 0, total / 3];
    }
  };
  set("Index", totals.index);
  set("Middle", totals.middle);
  set("Ring", totals.ring);
  set("Little", totals.little);
  return map;
}

const EXT = 0.3; // 편 손가락
const CURL = 2.7; // 접은 손가락

describe("rps-logic", () => {
  it("classifyGesture: 보/바위/가위를 컬에서 분류", () => {
    expect(classifyGesture(curls({ index: EXT, middle: EXT, ring: EXT, little: EXT }), "right")).toBe("paper");
    expect(classifyGesture(curls({ index: CURL, middle: CURL, ring: CURL, little: CURL }), "right")).toBe("rock");
    expect(classifyGesture(curls({ index: EXT, middle: EXT, ring: CURL, little: CURL }), "right")).toBe("scissors");
  });

  it("classifyGesture: 애매한 자세는 null", () => {
    // 검지만 폄(가리키기) → 어떤 패도 아님
    expect(classifyGesture(curls({ index: EXT, middle: CURL, ring: CURL, little: CURL }), "right")).toBeNull();
  });

  it("beats: 바위>가위>보>바위", () => {
    expect(beats("rock", "scissors")).toBe(true);
    expect(beats("scissors", "paper")).toBe(true);
    expect(beats("paper", "rock")).toBe(true);
    expect(beats("rock", "paper")).toBe(false);
  });

  it("resolveRound: 플레이어 관점 승/패/무", () => {
    expect(resolveRound("rock", "scissors")).toBe("win");
    expect(resolveRound("rock", "paper")).toBe("lose");
    expect(resolveRound("paper", "paper")).toBe("draw");
  });

  it("pickAiHand: 결정적이며 유효한 손", () => {
    const a = pickAiHand(rng(5));
    const b = pickAiHand(rng(5));
    expect(a).toBe(b);
    expect(["rock", "paper", "scissors"]).toContain(a);
  });

  it("pickAiHand: rubberband는 자주 낸 손을 카운터하는 경향", () => {
    const history: Hand[] = ["rock", "rock", "rock", "rock"];
    // rock을 많이 냈으면 paper(상성)를 낼 확률이 높다 — 시드 다수에서 검증.
    let paper = 0;
    for (let s = 1; s <= 20; s++) if (pickAiHand(rng(s), history, true) === "paper") paper++;
    expect(paper).toBeGreaterThan(6);
  });

  it("scoreReducer + matchOver: 선승 3 도달 시 승자", () => {
    let sc = EMPTY_SCORE;
    sc = scoreReducer(sc, "win");
    sc = scoreReducer(sc, "draw");
    sc = scoreReducer(sc, "win");
    expect(matchOver(sc, 3)).toBeNull();
    sc = scoreReducer(sc, "win");
    expect(sc.win).toBe(3);
    expect(sc.round).toBe(4);
    expect(matchOver(sc, 3)).toBe("player");
  });

  it("stabilizeGesture: N프레임 동일할 때만 확정", () => {
    expect(stabilizeGesture(["rock", "rock", "rock", "rock", "rock"], 5)).toBe("rock");
    expect(stabilizeGesture(["rock", "paper", "rock", "rock", "rock"], 5)).toBeNull();
    expect(stabilizeGesture(["rock", "rock"], 5)).toBeNull(); // 표본 부족
  });
});
