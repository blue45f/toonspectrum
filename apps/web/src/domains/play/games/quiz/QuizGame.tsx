import {
  answerOf,
  buildQuestion,
  isCorrect,
  ROUND_COUNT,
  type QuizQuestion,
} from "@toonstudio/play-core";
import { Check, History, RotateCcw, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { GameHelp } from "../../GameHelp";
import { PlayCover } from "../../PlayCover";
import { PlayGameError, PlayGameSkeleton } from "../GameStates";
import { usePlayTitles } from "../../use-play-catalog";
import { recordResult, usePlayDraft } from "../../lab/play-storage";

import type { PlayGameProps, PlayTitle  } from "../../play-types";

import { SharePageButton } from "@/shared/components/share-page-button";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 정답 표지를 흐릿하게 보여주는 힌트 카드 — 공개 전까지 제목/표지를 가린다(PlayCover mystery). */
function HintCard({ title, revealed }: { title: PlayTitle; revealed: boolean }) {
  return (
    <div className="relative mx-auto w-40 sm:w-44">
      <PlayCover
        id={title.id}
        title={title.title}
        cover={title.cover}
        coverImage={title.coverImage}
        mode="mystery"
        revealed={revealed}
        big
        className="w-full rounded-xl border border-line shadow-sm"
      />
      {/* 공개 시 제목 띠 — 정답 확인용. */}
      {revealed && (
        <div className="absolute inset-x-0 bottom-0 truncate rounded-b-xl bg-black/60 px-2 py-1 text-center text-xs font-semibold text-white">
          {title.title}
        </div>
      )}
    </div>
  );
}

type Phase = "playing" | "answered" | "done";

/** 이어하기용 진행 스냅샷 — 브라우저에 저장해 중간에 나가도 계속 풀 수 있다. */
interface QuizDraft {
  seed: number;
  round: number;
  score: number;
  streak: number;
  bestStreak: number;
}
function isQuizDraft(value: unknown): value is QuizDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return (
    Number.isInteger(d.seed) &&
    Number.isInteger(d.round) &&
    (d.round as number) >= 1 &&
    (d.round as number) <= ROUND_COUNT &&
    typeof d.score === "number" &&
    d.score >= 0 &&
    d.score <= ROUND_COUNT &&
    Number.isInteger(d.streak) &&
    (d.streak as number) >= 0 &&
    Number.isInteger(d.bestStreak) &&
    (d.bestStreak as number) >= 0
  );
}
const resumable = (draft: QuizDraft | null): draft is QuizDraft =>
  draft !== null && (draft.round > 1 || draft.score > 0);

export function QuizGame({ onExit }: PlayGameProps) {
  const { titles, loading, error, retry } = usePlayTitles("popular", "webtoon", 120);
  const {
    value: draft,
    setValue: setDraft,
  } = usePlayDraft<QuizDraft | null>("quiz-progress", () => null, (value): value is QuizDraft | null => value === null || isQuizDraft(value));
  const [seed, setSeed] = useState(1);
  const [resumed, setResumed] = useState(false);
  const rngRef = useRef(seededRng(1));

  const [question, setQuestion] = useState<QuizQuestion<PlayTitle> | null>(null);
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("playing");
  const doneHeadingRef = useRef<HTMLHeadingElement>(null);
  const recordedRef = useRef(false);

  const nextQuestion = useCallback(() => {
    if (titles.length < 4) return;
    setQuestion(buildQuestion(titles, rngRef.current));
    setPicked(null);
    setPhase("playing");
  }, [titles]);

  const newGame = useCallback(
    (s: number) => {
      if (titles.length < 4) return;
      rngRef.current = seededRng(s);
      setRound(1);
      setScore(0);
      setStreak(0);
      setBestStreak(0);
      setPicked(null);
      setPhase("playing");
      recordedRef.current = false;
      setQuestion(buildQuestion(titles, rngRef.current));
    },
    [titles],
  );

  // 데이터 로드되면 첫 게임 시작. 이어하기 대기 중이면 사용자 선택을 기다린다.
  useEffect(() => {
    if (titles.length < 4 || question) return;
    if (resumable(draft) && !resumed) return;
    newGame(seed);
  }, [titles.length, question, newGame, seed, draft, resumed]);

  /** 저장된 진행을 복원 — 같은 시드로 문제 순서를 재현해 해당 라운드부터 이어간다. */
  const resume = useCallback(() => {
    if (!draft || titles.length < 4) return;
    const rng = seededRng(draft.seed);
    for (let i = 1; i < draft.round; i += 1) buildQuestion(titles, rng);
    rngRef.current = rng;
    setSeed(draft.seed);
    setRound(draft.round);
    setScore(draft.score);
    setStreak(draft.streak);
    setBestStreak(draft.bestStreak);
    setPicked(null);
    setPhase("playing");
    recordedRef.current = false;
    setQuestion(buildQuestion(titles, rng));
    setResumed(true);
  }, [draft, titles]);

  const freshStart = useCallback(() => {
    setDraft(null);
    setResumed(true);
    const next = seed + 1;
    setSeed(next);
    newGame(next);
  }, [seed, newGame, setDraft]);

  const onPick = (id: string) => {
    if (!question || phase !== "playing") return;
    const correct = isCorrect(question, id);
    setPicked(id);
    setPhase("answered");
    const nextScore = correct ? score + 1 : score;
    const nextStreak = correct ? streak + 1 : 0;
    const nextBest = Math.max(bestStreak, nextStreak);
    setScore(nextScore);
    setStreak(nextStreak);
    setBestStreak(nextBest);
    setDraft({ seed, round, score: nextScore, streak: nextStreak, bestStreak: nextBest });
  };

  const onNext = () => {
    if (round >= ROUND_COUNT) {
      setDraft(null);
      setPhase("done");
      return;
    }
    const nextRound = round + 1;
    setRound(nextRound);
    nextQuestion();
    setDraft({ seed, round: nextRound, score, streak, bestStreak });
  };

  const restart = () => {
    setDraft(null);
    setResumed(true);
    const next = seed + 1;
    setSeed(next);
    newGame(next);
  };

  // 최종 화면 진입 시 한 번만: 기록 저장 + 결과 제목으로 포커스 이동.
  useEffect(() => {
    if (phase !== "done") return;
    if (!recordedRef.current) {
      recordedRef.current = true;
      recordResult({
        id: `quiz-${seed}`,
        game: "quiz",
        label: `웹툰 퀴즈 ${score}/${ROUND_COUNT} 정답`,
        score: Math.round((score / ROUND_COUNT) * 100),
      });
    }
    doneHeadingRef.current?.focus({ preventScroll: true });
  }, [phase, score, seed]);

  if (loading) {
    return <PlayGameSkeleton label="웹툰 문제를 불러오는 중" layout="quiz" />;
  }

  if (error && !question) {
    return <PlayGameError message={error} onRetry={retry} />;
  }

  if (titles.length < 4) {
    return (
      <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-fg-2">문제를 만들 웹툰이 부족합니다.</p>
        <Button variant="outline" size="sm" onClick={onExit}>
          다른 게임
        </Button>
      </div>
    );
  }

  // 이어하기 선택 화면.
  if (!question && resumable(draft) && !resumed) {
    return (
      <div className="flex min-h-[18rem] flex-col items-center justify-center gap-4 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
          <History className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-bold text-fg">이어서 풀까요?</h2>
          <p className="mt-1 text-sm text-fg-2">
            지난 {draft.round}라운드 · {draft.score}점부터 계속할 수 있어요.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="solid" onClick={resume}>
            이어서 풀기
          </Button>
          <Button variant="outline" onClick={freshStart}>
            새로 시작
          </Button>
        </div>
        <p className="text-xs text-fg-3">진행 상황은 이 브라우저에만 저장됩니다.</p>
      </div>
    );
  }

  if (!question) {
    return <PlayGameSkeleton label="문제를 준비하는 중" layout="quiz" />;
  }

  const answer = answerOf(question);

  // 최종 점수 화면.
  if (phase === "done") {
    const perfect = score === ROUND_COUNT;
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <Trophy className={cn("h-12 w-12", perfect ? "text-amber-400" : "text-accent")} />
        <div>
          <h2 ref={doneHeadingRef} tabIndex={-1} className="text-lg font-bold text-fg outline-none">
            {score} / {ROUND_COUNT} 정답
          </h2>
          <p className="mt-1 text-sm text-fg-2">최고 연속 정답 {bestStreak}회</p>
        </div>
        <p className="max-w-xs text-sm text-fg-3" aria-live="polite">
          {perfect
            ? "🏆 만점! 진정한 웹툰 마스터입니다."
            : score >= 7
              ? "👏 대단해요! 웹툰을 꽤 잘 아시는군요."
              : score >= 4
                ? "🙂 나쁘지 않아요. 한 판 더?"
                : "🌱 더 많은 웹툰을 만나볼 시간!"}
        </p>
        <p className="text-xs text-fg-3">결과를 내 창작 기록에 남겼어요.</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="solid" onClick={restart}>
            <RotateCcw className="mr-1 h-4 w-4" /> 다시 풀기
          </Button>
          <SharePageButton
            path="/play?game=quiz"
            text={`웹툰 퀴즈 ${score}/${ROUND_COUNT} 정답 · 최고 연속 ${bestStreak}회`}
            label="결과 공유"
          />
          <Button variant="outline" onClick={onExit}>
            다른 게임
          </Button>
        </div>
      </div>
    );
  }

  const answered = phase === "answered";
  const wasCorrect = answered && picked !== null && isCorrect(question, picked);

  return (
    <div className="flex flex-col gap-4">
      {/* 상단 진행/점수 */}
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-fg-2">
          문제 <span className="font-bold tabular-nums text-fg">{round}</span> / {ROUND_COUNT}
          <GameHelp
            id="quiz"
            title="웹툰 퀴즈"
            steps={[
              {
                emoji: "🎯",
                title: "목표",
                desc: (
                  <>
                    흐릿하게 가려진 <b className="text-fg">표지</b>와 단서를 보고 그 웹툰의{" "}
                    <b className="text-fg">제목</b>을 맞혀요.
                  </>
                ),
              },
              {
                emoji: "🃏",
                title: "단서",
                desc: (
                  <>
                    표지 아래에 <b className="text-fg">작가</b>와{" "}
                    <b className="text-fg">장르</b>(최대 3개)가 힌트로 주어져요.
                  </>
                ),
              },
              {
                emoji: "🔘",
                title: "정답 고르기",
                desc: (
                  <>
                    <b className="text-fg">4개 보기</b> 중 하나를 누르면 바로 채점돼요. 정답은{" "}
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">초록</span>
                    , 틀린 선택은{" "}
                    <span className="font-semibold text-rose-600 dark:text-rose-400">빨강</span>으로
                    표시돼요.
                  </>
                ),
              },
              {
                emoji: "🔥",
                title: "점수와 연속",
                desc: (
                  <>
                    맞힐 때마다 <b className="text-fg">1점</b>, 연속으로 맞히면{" "}
                    <b className="text-fg">연속 기록</b>이 쌓여요(틀리면 0으로 초기화).
                  </>
                ),
              },
              {
                emoji: "🏁",
                title: "한 판",
                desc: (
                  <>
                    총 <b className="text-fg">{ROUND_COUNT}문제</b>를 풀면 최종 점수와 최고 연속
                    기록을 보여줘요. 중간에 나가도 이어서 풀 수 있어요.
                  </>
                ),
              },
            ]}
          />
        </span>
        <span className="flex items-center gap-3">
          <span className="text-fg-2">
            점수 <span className="font-bold tabular-nums text-fg">{score}</span>
          </span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", streak >= 2 ? "bg-accent-soft text-accent" : "text-fg-3")}>
            🔥 {streak}연속
          </span>
        </span>
      </div>

      {/* 진행 바 */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-line/60"
        role="progressbar"
        aria-valuenow={round}
        aria-valuemin={1}
        aria-valuemax={ROUND_COUNT}
        aria-label="퀴즈 진행"
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(round / ROUND_COUNT) * 100}%` }} />
      </div>

      {/* 힌트 카드 + 단서 */}
      {answer && (
        <div className="flex flex-col items-center gap-2">
          <HintCard title={answer} revealed={answered} />
          <p className="text-center text-xs text-fg-3">
            <span className="font-medium text-fg-2">단서</span> · {answer.author}
            {answer.genres.length > 0 && (
              <>
                {" · "}
                {answer.genres.slice(0, 3).join(" / ")}
              </>
            )}
          </p>
          <p className="text-sm font-semibold text-fg">이 표지의 웹툰 제목은?</p>
        </div>
      )}

      {/* 보기 4개 */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {question.choices.map((c) => {
          const isAnswer = c.id === question.answerId;
          const isPicked = c.id === picked;
          return (
            <button
              key={c.id}
              type="button"
              disabled={answered}
              onClick={() => onPick(c.id)}
              aria-label={c.title}
              className={cn(
                "flex min-h-[2.75rem] items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition",
                !answered && "border-line bg-card hover:border-accent/70 hover:bg-accent-soft",
                answered && isAnswer && "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                answered && isPicked && !isAnswer && "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300",
                answered && !isAnswer && !isPicked && "border-line opacity-55",
              )}
            >
              <span className="truncate text-fg">{c.title}</span>
              {answered && isAnswer && <Check className="h-4 w-4 shrink-0 text-emerald-500" />}
              {answered && isPicked && !isAnswer && <X className="h-4 w-4 shrink-0 text-rose-500" />}
            </button>
          );
        })}
      </div>

      {/* 상태 라인(aria-live) */}
      <p className="min-h-[1.25rem] text-center text-sm" aria-live="polite">
        {answered ? (
          wasCorrect ? (
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">정답입니다! 🎉</span>
          ) : (
            <span className="font-semibold text-rose-600 dark:text-rose-400">
              아쉬워요. 정답은 「{answer?.title}」
            </span>
          )
        ) : (
          <span className="text-fg-3">표지와 단서를 보고 제목을 맞혀 보세요.</span>
        )}
      </p>

      {/* 다음 / 다시 시작 */}
      <div className="flex items-center justify-center gap-2">
        {answered ? (
          <Button variant="solid" onClick={onNext}>
            {round >= ROUND_COUNT ? "결과 보기" : "다음 문제"}
          </Button>
        ) : (
          <Button variant="quiet" onClick={restart}>
            <RotateCcw className="mr-1 h-4 w-4" /> 처음부터
          </Button>
        )}
      </div>
    </div>
  );
}

export default QuizGame;
