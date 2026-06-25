// @toonspectrum/play-core — 웹(/play)·토스(apps/toss) 양쪽이 공유하는 순수 놀이터 엔진.
// React/DOM 의존 없는 결정적(rng 주입) 게임 로직만 모은다. 앱별 타이틀 타입(PlayTitle·
// GameTitle)은 PlayCoreTitle에 구조적으로 할당 가능하므로 그대로 엔진에 넘길 수 있다.

export type { PlayCoreTitle } from "./play-title";

export {
  ROUND_COUNT,
  CHOICE_COUNT,
  shuffle as shuffleQuiz,
  buildQuestion,
  isCorrect,
  answerOf,
  type QuizQuestion,
} from "./quiz-engine";

export {
  popularityScore,
  popularityTier,
  genreChips,
  filterByGenre,
  pickRandom,
  reasonFor,
  tierLabel,
  type PopularityTier,
} from "./roulette-engine";

export {
  shuffle,
  buildBoard,
  initState,
  isSolved,
  isFaceUp,
  flipReducer,
  type Tile,
  type MemoryState,
  type MemoryAction,
} from "./memory-engine";

export {
  hasEnoughTitles,
  nextChallenger,
  judge,
  startDuel,
  guessNext,
  type Guess,
  type DuelState,
} from "./duel-engine";

export {
  HAND_EMOJI,
  HAND_LABEL,
  MUK_LABEL,
  EMPTY_SCORE,
  beats,
  resolveRound,
  pickAiHand,
  scoreReducer,
  matchOver,
  mukjjippaStep,
  type Hand,
  type Outcome,
  type Score,
  type Initiative,
  type MukStep,
} from "./rps-engine";
