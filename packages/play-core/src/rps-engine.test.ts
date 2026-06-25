import { describe, expect, it } from "vitest";

import {
  beats,
  EMPTY_SCORE,
  matchOver,
  mukjjippaStep,
  pickAiHand,
  resolveRound,
  scoreReducer,
  type Hand,
} from "./rps-engine";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("rps-engine", () => {
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

  it("mukjjippaStep 결정 단계: 비기면 replay, 이기면 선 확정 후 attack", () => {
    expect(mukjjippaStep(null, "rock", "rock")).toEqual({
      initiative: null,
      matchWinner: null,
      replay: true,
      phase: "decide",
    });
    expect(mukjjippaStep(null, "rock", "scissors")).toEqual({
      initiative: "player",
      matchWinner: null,
      replay: false,
      phase: "attack",
    });
    expect(mukjjippaStep(null, "scissors", "rock").initiative).toBe("ai");
  });

  it("mukjjippaStep 공격 단계: 같은 손이면 선 보유자 승, 다르면 이긴 쪽이 선 가져감", () => {
    // 플레이어가 선인데 같은 손 → 플레이어 매치 승
    expect(mukjjippaStep("player", "paper", "paper").matchWinner).toBe("player");
    // ai가 선인데 같은 손 → ai 매치 승
    expect(mukjjippaStep("ai", "rock", "rock").matchWinner).toBe("ai");
    // 다른 손: 이긴 쪽이 선을 가져가고 매치는 계속(winner null)
    const r = mukjjippaStep("ai", "rock", "scissors"); // rock>scissors, player 승
    expect(r.matchWinner).toBeNull();
    expect(r.initiative).toBe("player");
  });
});
