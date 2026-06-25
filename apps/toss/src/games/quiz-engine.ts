// 웹툰 퀴즈 — 객관식 순수 엔진(toonspectrum 본 레포 이식).
import type { GameTitle as PlayTitle } from './types';

export const ROUND_COUNT = 10;
export const CHOICE_COUNT = 4;

export interface QuizQuestion {
  answerId: string;
  choices: PlayTitle[];
}

export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildQuestion(titles: readonly PlayTitle[], rng: () => number): QuizQuestion {
  if (titles.length === 0) throw new Error('buildQuestion: titles 풀이 비어 있습니다');
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
  const subset = shuffled.slice(0, pick);
  const choices = shuffle(subset, rng);
  return { answerId: answer.id, choices };
}

export function isCorrect(question: QuizQuestion, pickedId: string): boolean {
  return question.answerId === pickedId;
}

export function answerOf(question: QuizQuestion): PlayTitle | undefined {
  return question.choices.find((c) => c.id === question.answerId);
}
