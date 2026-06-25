// 웹툰 가위바위보 — 순수 게임 로직.
// 손가락 컬(solveHandToFingerBones 출력)을 가위/바위/보로 분류하고, 라운드 판정·점수·AI를
// 결정적 순수 함수로 처리한다(React/DOM/MediaPipe 의존 없음 → 단위 테스트 가능).

import type { FingerEulerMap } from "@/src/domains/creator/studio-vrm-hand-solver";

export type Hand = "rock" | "paper" | "scissors";
export type Outcome = "win" | "lose" | "draw";

export const HAND_EMOJI: Record<Hand, string> = { rock: "✊", paper: "✋", scissors: "✌️" };
export const HAND_LABEL: Record<Hand, string> = { rock: "바위", paper: "보", scissors: "가위" };

// 손가락 3마디 컬 합(rad) 임계 — 펴짐/접힘 판정.
const EXTENDED_MAX = 1.2; // 합 < 이 값이면 편 손가락
const CURLED_MIN = 2.0; // 합 > 이 값이면 접은 손가락
const FINGERS = ["Index", "Middle", "Ring", "Little"] as const;
const SEGMENTS = ["Proximal", "Intermediate", "Distal"] as const;

/** 한 손가락의 컬 합(Z축 회전 크기 합). */
export function fingerCurl(curls: FingerEulerMap, side: "left" | "right", finger: string): number {
  let sum = 0;
  for (const seg of SEGMENTS) {
    const v = curls[`${side}${finger}${seg}`];
    if (v) sum += Math.abs(v[2]);
  }
  return sum;
}

/**
 * 손가락 컬 맵 → 가위/바위/보. 애매하면 null(미인식 → 캡처 잠금 안 함).
 *  - 보(paper)   : 검지·중지·약지·소지 모두 폄
 *  - 바위(rock)  : 네 손가락 모두 접음
 *  - 가위(scissors): 검지·중지 폄 + 약지·소지 접음
 */
export function classifyGesture(curls: FingerEulerMap, side: "left" | "right"): Hand | null {
  const [index, middle, ring, little] = FINGERS.map((f) => fingerCurl(curls, side, f));
  const ext = (v: number) => v < EXTENDED_MAX;
  const curl = (v: number) => v > CURLED_MIN;

  if (ext(index) && ext(middle) && ext(ring) && ext(little)) return "paper";
  if (curl(index) && curl(middle) && curl(ring) && curl(little)) return "rock";
  if (ext(index) && ext(middle) && curl(ring) && curl(little)) return "scissors";
  return null;
}

/** a가 b를 이기는가(바위>가위>보>바위). */
export function beats(a: Hand, b: Hand): boolean {
  return (
    (a === "rock" && b === "scissors") ||
    (a === "scissors" && b === "paper") ||
    (a === "paper" && b === "rock")
  );
}

/** 플레이어 관점 라운드 결과. */
export function resolveRound(player: Hand, ai: Hand): Outcome {
  if (player === ai) return "draw";
  return beats(player, ai) ? "win" : "lose";
}

/** 결정적 AI 선택(rng 주입). history가 있으면 약하게 카운터(가장 잦은 패에 상성). */
export function pickAiHand(rng: () => number, history: Hand[] = [], rubberband = false): Hand {
  const all: Hand[] = ["rock", "paper", "scissors"];
  if (rubberband && history.length >= 2 && rng() < 0.6) {
    const freq: Record<Hand, number> = { rock: 0, paper: 0, scissors: 0 };
    for (const h of history) freq[h] += 1;
    const most = all.reduce((a, b) => (freq[b] > freq[a] ? b : a), all[0]);
    // most를 이기는 손을 낸다.
    return all.find((h) => beats(h, most)) ?? all[Math.floor(rng() * 3)];
  }
  return all[Math.floor(rng() * 3)] ?? "rock";
}

export interface Score {
  win: number;
  lose: number;
  draw: number;
  round: number;
}

export const EMPTY_SCORE: Score = { win: 0, lose: 0, draw: 0, round: 0 };

/** 라운드 결과를 점수에 누적(순수). */
export function scoreReducer(score: Score, outcome: Outcome): Score {
  return {
    win: score.win + (outcome === "win" ? 1 : 0),
    lose: score.lose + (outcome === "lose" ? 1 : 0),
    draw: score.draw + (outcome === "draw" ? 1 : 0),
    round: score.round + 1,
  };
}

/** 선승 target에 먼저 도달한 쪽(무승부는 미집계). null이면 계속. */
export function matchOver(score: Score, target = 3): "player" | "ai" | null {
  if (score.win >= target) return "player";
  if (score.lose >= target) return "ai";
  return null;
}

/* ── 묵찌빠 ───────────────────────────────────────────────────────────── */
// 묵=바위(rock), 찌=가위(scissors), 빠=보(paper).
export const MUK_LABEL: Record<Hand, string> = { rock: "묵", scissors: "찌", paper: "빠" };

/** 선(공격권) 보유자. null이면 아직 가위바위보로 정하는 단계. */
export type Initiative = "player" | "ai" | null;

export interface MukStep {
  /** 다음 선 보유자(또는 동일 유지). */
  initiative: Initiative;
  /** 이번 한 판으로 매치 승자가 결정됐으면 그 쪽, 아니면 null. */
  matchWinner: "player" | "ai" | null;
  /** 결정 단계에서 비겨 다시 내야 하면 true. */
  replay: boolean;
  /** 결과 후 단계: "decide"(선 정하기) | "attack"(묵찌빠 던지기). */
  phase: "decide" | "attack";
}

/**
 * 묵찌빠 한 판 전이(순수).
 *  - 선 미정(decide): 가위바위보로 선을 정한다. 비기면 replay. 이긴 쪽이 선 → attack 단계.
 *  - 선 있음(attack): 두 손이 같으면 현재 선 보유자가 매치 승리. 다르면 이긴 쪽이 선을 가져가 계속.
 */
export function mukjjippaStep(initiative: Initiative, player: Hand, ai: Hand): MukStep {
  if (initiative === null) {
    const out = resolveRound(player, ai);
    if (out === "draw") return { initiative: null, matchWinner: null, replay: true, phase: "decide" };
    const holder = out === "win" ? "player" : "ai";
    return { initiative: holder, matchWinner: null, replay: false, phase: "attack" };
  }
  if (player === ai) {
    return { initiative, matchWinner: initiative, replay: false, phase: "attack" };
  }
  const out = resolveRound(player, ai);
  const holder = out === "win" ? "player" : "ai";
  return { initiative: holder, matchWinner: null, replay: false, phase: "attack" };
}

/**
 * 디바운스 — 최근 N프레임 동안 동일 손이 유지될 때만 그 손을 확정(흔들림 방지).
 * 샘플이 부족하거나 불안정하면 null.
 */
export function stabilizeGesture(samples: (Hand | null)[], minStable = 5): Hand | null {
  if (samples.length < minStable) return null;
  const recent = samples.slice(-minStable);
  const first = recent[0];
  if (!first) return null;
  return recent.every((s) => s === first) ? first : null;
}
