import { Dice5, Flag, Gamepad2, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { GameHelp } from "../../GameHelp";
import { usePlayTitles } from "../../use-play-catalog";

import {
  BOARD_SIZE,
  isFinished,
  makeInitialState,
  RECOMMEND_SCORE,
  rollAndMove,
  type BoardState,
  type Tile,
} from "./dice-board-engine";

import type { PlayGameProps, PlayTitle } from "../../play-types";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TILE_META: Record<Tile["type"], { glyph: string; label: string; ring: string; fill: string }> = {
  start: { glyph: "출", label: "출발", ring: "border-line", fill: "bg-card" },
  normal: { glyph: "", label: "일반", ring: "border-line/50", fill: "bg-card/40" },
  goal: { glyph: "🏁", label: "골", ring: "border-accent", fill: "bg-accent-soft" },
  recommend: { glyph: "⭐", label: "추천", ring: "border-amber-400/70", fill: "bg-amber-400/10" },
  forward: { glyph: "⏩", label: "전진", ring: "border-emerald-400/70", fill: "bg-emerald-400/10" },
  back: { glyph: "⏪", label: "후퇴", ring: "border-sky-400/70", fill: "bg-sky-400/10" },
  trap: { glyph: "🕳️", label: "함정", ring: "border-rose-400/70", fill: "bg-rose-400/10" },
};

/** 추천 웹툰 커버 — 실제 이미지 또는 OKLCH 그라디언트 폴백. */
function RecommendCard({ title }: { title: PlayTitle }) {
  const [broken, setBroken] = useState(false);
  const gradient = `linear-gradient(150deg, ${title.cover[0]}, ${title.cover[1]})`;
  return (
    <div className="w-[4.6rem] shrink-0">
      <div
        className="relative h-[6.1rem] w-full overflow-hidden rounded-lg border border-line"
        style={{ background: gradient }}
      >
        {title.coverImage && !broken && (
          <img
            src={title.coverImage}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-90"
            onError={() => setBroken(true)}
          />
        )}
        <div className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-amber-400 text-[0.6rem] text-black shadow">
          ★
        </div>
      </div>
      <div className="mt-1 truncate text-[0.6rem] font-medium text-fg" title={title.title}>
        {title.title}
      </div>
    </div>
  );
}

/** 보드 트랙의 한 칸. */
function TrackTile({ tile, here }: { tile: Tile; here: boolean }) {
  const meta = TILE_META[tile.type];
  return (
    <div
      className={cn(
        "relative grid h-9 w-9 shrink-0 place-items-center rounded-md border text-[0.62rem] transition sm:h-10 sm:w-10",
        meta.ring,
        meta.fill,
        here && "ring-2 ring-accent ring-offset-1 ring-offset-card",
      )}
      aria-label={`${tile.index}번 칸 (${meta.label})${here ? " · 현재 위치" : ""}`}
    >
      <span aria-hidden className="leading-none">
        {meta.glyph || <span className="text-fg-3">{tile.index}</span>}
      </span>
      {here && (
        <span
          aria-hidden
          className="absolute -top-2 left-1/2 -translate-x-1/2 text-[0.95rem] drop-shadow"
        >
          📖
        </span>
      )}
    </div>
  );
}

const DICE_FACE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export function DiceBoardGame({ onExit }: PlayGameProps) {
  const { titles, loading } = usePlayTitles("popular", "webtoon", 120);
  const [state, setState] = useState<BoardState | null>(null);
  const [seed, setSeed] = useState(1);
  const [rolling, setRolling] = useState(false);
  const rngRef = useRef(seededRng(1));

  const newGame = useCallback(
    (s: number) => {
      rngRef.current = seededRng(s);
      setState(makeInitialState(rngRef.current, titles.length));
      setRolling(false);
    },
    [titles.length],
  );

  // 데이터(또는 빈 폴백) 준비되면 첫 게임 시작.
  useEffect(() => {
    if (!loading && !state) newGame(seed);
  }, [loading, state, newGame, seed]);

  const restart = () => {
    const next = seed + 1;
    setSeed(next);
    newGame(next);
  };

  const onRoll = () => {
    if (!state || isFinished(state) || rolling) return;
    setRolling(true);
    // 굴리는 연출 — 짧은 지연 후 결과 반영.
    setTimeout(() => {
      setState((cur) => (cur && !isFinished(cur) ? rollAndMove(cur, rngRef.current) : cur));
      setRolling(false);
    }, 280);
  };

  if (loading || !state) {
    return (
      <div className="grid min-h-[18rem] place-items-center text-sm text-fg-2">
        {loading ? "웹툰 보드를 준비하는 중…" : "보드를 그리는 중…"}
      </div>
    );
  }

  const finished = isFinished(state);
  const resting = state.skipTurns > 0;
  const progressPct = Math.round((state.pos / BOARD_SIZE) * 100);

  return (
    <div className="flex flex-col gap-3">
      {/* 상단 스탯 바 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1 font-semibold text-fg">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span className="tabular-nums">{state.score}</span>
            <span className="text-fg-3">점</span>
          </span>
          <span className="flex items-center gap-1 text-fg-2">
            <Flag className="h-4 w-4 text-accent" />
            <span className="tabular-nums">{state.pos}</span>
            <span className="text-fg-3">/ {BOARD_SIZE}</span>
          </span>
          <span className="text-fg-3">턴 {state.rolls}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] text-fg-3">추천 수집 {state.collected.length}</span>
          <GameHelp
            title="웹툰 주사위 보드"
            steps={[
              {
                emoji: "🎯",
                title: "목표",
                desc: (
                  <>
                    <b className="text-fg">{BOARD_SIZE}칸</b> 트랙을 달려 마지막{" "}
                    <span className="text-accent">🏁 골</span>에 도달하면 완주예요.
                  </>
                ),
              },
              {
                emoji: "🎲",
                title: "주사위 굴리기",
                desc: (
                  <>
                    <b className="text-fg">주사위 굴리기</b> 버튼으로 1~6칸 전진해요. 한 칸당{" "}
                    <b className="text-fg">+1점</b>씩 쌓여요.
                  </>
                ),
              },
              {
                emoji: "⭐",
                title: "이벤트 칸",
                desc: (
                  <>
                    <span className="text-amber-400">⭐추천</span> 칸은 웹툰 한 편 발견 +{RECOMMEND_SCORE}점,{" "}
                    <span className="text-emerald-400">⏩전진</span>·<span className="text-sky-400">⏪후퇴</span>는 위치
                    이동, <span className="text-rose-400">🕳️함정</span>은 다음 턴 쉼이에요.
                  </>
                ),
              },
              {
                emoji: "🏆",
                title: "완주",
                desc: (
                  <>
                    골에 도착하면 끝! <b className="text-fg">점수·턴·수집한 추천 웹툰</b>으로 결과를 확인해요.
                  </>
                ),
              },
            ]}
          />
        </div>
      </div>

      {/* 진행 게이지 */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line/40">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      {/* 보드 트랙 */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-line/60 bg-card/40 p-2.5">
        {state.tiles.map((t) => (
          <TrackTile key={t.index} tile={t} here={t.index === state.pos} />
        ))}
      </div>

      {/* 주사위 + 굴리기 */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line/60 bg-card/40 p-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "grid h-12 w-12 place-items-center rounded-xl border-2 border-line bg-card text-3xl leading-none transition",
              rolling && "animate-pulse",
            )}
            aria-hidden
          >
            {rolling ? "🎲" : DICE_FACE[state.dice] || "🎲"}
          </span>
          <span className="text-sm text-fg-2">
            {state.dice > 0 ? (
              <>
                주사위 <span className="font-bold text-fg tabular-nums">{state.dice}</span>
              </>
            ) : (
              <span className="text-fg-3">주사위를 굴려보세요</span>
            )}
          </span>
        </div>
        <Button
          size="md"
          variant={finished ? "quiet" : "solid"}
          disabled={finished || rolling}
          onClick={onRoll}
        >
          <Dice5 className="mr-1 h-4 w-4" />
          {finished ? "완주!" : rolling ? "굴리는 중…" : resting ? "쉬는 턴 넘기기" : "주사위 굴리기"}
        </Button>
      </div>

      {/* 상태 안내(aria-live) */}
      <p
        className="min-h-[1.25rem] text-center text-[0.78rem] text-fg-2"
        aria-live="polite"
        role="status"
      >
        {finished
          ? `🏆 완주! 총 ${state.score}점, ${state.rolls}턴, 추천 ${state.collected.length}편 수집.`
          : state.lastEvent}
      </p>

      {/* 수집한 추천 웹툰 */}
      {state.collected.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1 text-[0.72rem] font-medium text-fg-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            발견한 추천 웹툰
          </div>
          <div className="flex gap-2 overflow-x-auto rounded-xl border border-line/60 bg-card/40 p-2">
            {state.collected.map((idx) =>
              titles[idx] ? <RecommendCard key={titles[idx].id} title={titles[idx]} /> : null,
            )}
          </div>
        </div>
      )}

      {/* 컨트롤 */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="sm" onClick={restart}>
          <RotateCcw className="mr-1 h-4 w-4" /> 다시 시작
        </Button>
        {finished && (
          <Button variant="ghost" size="sm" onClick={onExit}>
            <Gamepad2 className="mr-1 h-4 w-4" /> 다른 게임
          </Button>
        )}
      </div>
    </div>
  );
}

export default DiceBoardGame;
