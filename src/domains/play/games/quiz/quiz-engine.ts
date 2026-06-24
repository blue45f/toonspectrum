// 웹툰 퀴즈 — 객관식 트리비아의 순수 엔진.
// 실제 웹툰 풀에서 정답 1편 + 오답 3편을 뽑아 보기 4개를 섞고, 정답 판정을 한다.
// React/DOM 의존 없음 → 단위 테스트 가능. 무작위성은 주입 rng(() => number)로만.

import type { PlayTitle } from "../../play-types";

export const ROUND_COUNT = 10;
export const CHOICE_COUNT = 4;

/** 한 문제 — 정답 id + 보기 4개(정답 포함, 섞인 순서). */
export interface QuizQuestion {
  answerId: string;
  /** 정답 1 + 오답 3 = 4개(섞인 순서). 첫 인덱스가 정답이 아님. */
  choices: PlayTitle[];
}

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
 * 풀에서 정답 1편 + 오답 3편을 뽑아 보기 4개를 섞은 문제를 만든다.
 * - 정답은 id 기준 유일, 오답도 정답과 겹치지 않게 선택.
 * - 풀이 4편 미만이면 가능한 만큼만(중복 없이) 채운다(최소 1).
 * 결정적(rng 주입).
 */
export function buildQuestion(titles: readonly PlayTitle[], rng: () => number): QuizQuestion {
  if (titles.length === 0) {
    throw new Error("buildQuestion: titles 풀이 비어 있습니다");
  }
  // id 기준 중복 제거(같은 작품이 두 번 보기에 뜨지 않도록).
  const seen = new Set<string>();
  const unique: PlayTitle[] = [];
  for (const t of titles) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      unique.push(t);
    }
  }
  const shuffled = shuffle(unique, rng);
  const answer = shuffled[0];
  const pick = Math.min(CHOICE_COUNT, shuffled.length);
  // shuffled[0]=정답 포함 앞에서 pick개 → 모두 고유 id → 다시 섞어 정답 위치 무작위화.
  const subset = shuffled.slice(0, pick);
  const choices = shuffle(subset, rng);
  return { answerId: answer.id, choices };
}

/** 보기에서 고른 id가 정답인지. */
export function isCorrect(question: QuizQuestion, pickedId: string): boolean {
  return question.answerId === pickedId;
}

/** 문제에서 정답 PlayTitle 조회(렌더용 헬퍼). */
export function answerOf(question: QuizQuestion): PlayTitle | undefined {
  return question.choices.find((c) => c.id === question.answerId);
}
