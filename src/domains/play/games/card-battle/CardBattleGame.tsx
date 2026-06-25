import { Heart, RotateCcw, Swords } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { GameHelp } from "../../GameHelp";
import { usePlayTitles } from "../../use-play-catalog";

import {
  aiTakeTurn,
  attack,
  endTurn,
  HERO_HP,
  playCard,
  startBattle,
  type BattleState,
  type Card,
  type Minion,
  type Side,
} from "./card-battle-engine";

import type { HelpStep } from "../../GameHelp";
import type { PlayGameProps } from "../../play-types";

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

/** 카드/미니언 미니 일러스트 — 실제 커버 또는 OKLCH 그라디언트 폴백. */
function CardArt({ card, className }: { card: Card; className?: string }) {
  const [broken, setBroken] = useState(false);
  const gradient = `linear-gradient(150deg, ${card.cover[0]}, ${card.cover[1]})`;
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ background: gradient }}>
      {card.coverImage && !broken && (
        <img
          src={card.coverImage}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-90"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}

function HandCard({
  card,
  playable,
  onPlay,
}: {
  card: Card;
  playable: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!playable}
      onClick={onPlay}
      className={cn(
        "group relative w-[5.2rem] shrink-0 overflow-hidden rounded-lg border text-left transition sm:w-24",
        playable
          ? "border-accent/70 hover:-translate-y-2 hover:shadow-lg hover:shadow-accent/20"
          : "border-line opacity-60",
      )}
      aria-label={`${card.name} 소환 (코스트 ${card.cost}, ${card.atk}/${card.hp})`}
    >
      <CardArt card={card} className="h-20 w-full sm:h-24" />
      <div className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-sky-500 text-[0.62rem] font-bold text-white shadow">
        {card.cost}
      </div>
      <div className="truncate bg-card/95 px-1.5 py-1 text-[0.6rem] font-medium text-fg">{card.name}</div>
      <div className="flex items-center justify-between bg-card/95 px-1.5 pb-1 text-[0.62rem] font-bold">
        <span className="text-amber-500">⚔ {card.atk}</span>
        <span className="text-rose-500">♥ {card.hp}</span>
      </div>
    </button>
  );
}

function BoardMinion({
  minion,
  side,
  selectable,
  selected,
  targetable,
  onClick,
}: {
  minion: Minion;
  side: Side;
  selectable: boolean;
  selected: boolean;
  targetable: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!selectable && !targetable}
      onClick={onClick}
      className={cn(
        "relative w-16 shrink-0 overflow-hidden rounded-lg border-2 transition sm:w-[4.4rem]",
        selected && "ring-2 ring-accent ring-offset-1 ring-offset-card",
        targetable && "border-rose-500 animate-pulse",
        !selected && !targetable && (side === "you" ? "border-emerald-500/60" : "border-rose-400/50"),
        selectable && !selected && "hover:-translate-y-1 cursor-pointer",
        minion.ready && side === "you" && "shadow-[0_0_0_2px_theme(colors.emerald.400/40%)]",
      )}
      aria-label={`${minion.name} ${minion.atk}/${minion.curHp}${minion.ready ? " (공격 가능)" : ""}`}
    >
      <CardArt card={minion} className="h-16 w-full sm:h-[4.4rem]" />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-1 py-0.5 text-[0.62rem] font-bold text-white">
        <span className="text-amber-300">{minion.atk}</span>
        <span className="text-rose-300">{minion.curHp}</span>
      </div>
    </button>
  );
}

function HeroBar({ side, hp, targetable, onClick }: { side: Side; hp: number; targetable: boolean; onClick: () => void }) {
  const label = side === "you" ? "나" : "상대";
  return (
    <button
      type="button"
      disabled={!targetable}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition",
        targetable ? "border-rose-500 animate-pulse cursor-pointer" : "border-line",
      )}
      aria-label={`${label} 영웅 체력 ${hp}`}
    >
      <span className="text-fg-2">{label}</span>
      <span className="flex items-center gap-1 text-rose-500">
        <Heart className="h-4 w-4 fill-rose-500" />
        <span className="tabular-nums text-base">{Math.max(0, hp)}</span>
      </span>
    </button>
  );
}

/** 카드 배틀 규칙(목표/소환/공격/턴) — 공용 GameHelp에 주입. */
const HELP_STEPS: HelpStep[] = [
  {
    emoji: "🎯",
    title: "목표",
    desc: (
      <>
        미니언을 소환·공격시켜 <b className="text-rose-500">상대 영웅의 ♥(체력)</b>를 0으로 만들면 승리해요.
      </>
    ),
  },
  {
    emoji: "🃏",
    title: "소환",
    desc: (
      <>
        맨 아래 <b>손패 카드</b>를 누르면 내 필드로 나와요. 카드 좌상단{" "}
        <span className="font-bold text-sky-500">파란 숫자 = 마나 코스트</span>(가진 마나 ●●만큼만 낼 수 있어요).{" "}
        <span className="text-amber-500">⚔ 공격력</span> · <span className="text-rose-500">♥ 체력</span>.
      </>
    ),
  },
  {
    emoji: "⚔️",
    title: "공격",
    desc: (
      <>
        소환한 그 턴엔 공격 못 해요(다음 턴부터!). <b className="text-emerald-500">내 미니언(초록 테두리)</b>을 눌러 고른 다음,{" "}
        <b className="text-rose-500">적 미니언</b>이나 <b className="text-rose-500">상대 영웅</b>을 누르면 공격해요.
      </>
    ),
  },
  {
    emoji: "🔄",
    title: "턴",
    desc: (
      <>
        턴마다 마나가 1씩 늘고 카드를 1장 뽑아요. 할 일을 마치면 <b>&ldquo;턴 종료&rdquo;</b>를 누르세요.
      </>
    ),
  },
];

export function CardBattleGame({ onExit }: PlayGameProps) {
  const { titles, loading } = usePlayTitles("popular", "webtoon", 120);
  const [state, setState] = useState<BattleState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [seed, setSeed] = useState(1);
  const rngRef = useRef(seededRng(1));

  const newGame = useCallback(
    (s: number) => {
      if (titles.length < 16) return;
      rngRef.current = seededRng(s);
      const half = Math.floor(titles.length / 2);
      const youPool = titles.slice(0, Math.max(20, half));
      const aiPool = titles.slice(half > 20 ? half : 20);
      setState(startBattle(youPool, aiPool.length >= 16 ? aiPool : titles, rngRef.current));
      setSelected(null);
    },
    [titles],
  );

  // 데이터 로드되면 첫 게임 시작.
  useEffect(() => {
    if (titles.length >= 16 && !state) newGame(seed);
  }, [titles.length, state, newGame, seed]);

  // AI 턴 — 약간의 지연으로 진행감 부여.
  useEffect(() => {
    if (!state || state.winner || state.active !== "ai") return;
    const t = setTimeout(() => {
      setState((cur) => (cur && cur.active === "ai" && !cur.winner ? aiTakeTurn(cur, rngRef.current) : cur));
    }, 850);
    return () => clearTimeout(t);
  }, [state]);

  const restart = () => {
    const next = seed + 1;
    setSeed(next);
    newGame(next);
  };

  const yourTurn = !!state && state.active === "you" && !state.winner;

  const onHandPlay = (card: Card) => {
    if (!state || !yourTurn) return;
    setState(playCard(state, "you", card.uid));
  };

  const onMinionClick = (minion: Minion, side: Side) => {
    if (!state || !yourTurn) return;
    if (side === "you") {
      if (minion.ready) setSelected((cur) => (cur === minion.uid ? null : minion.uid));
      return;
    }
    // 적 미니언 = 공격 대상.
    if (selected) {
      setState(attack(state, "you", selected, minion.uid));
      setSelected(null);
    }
  };

  const onHeroAttack = () => {
    if (!state || !yourTurn || !selected) return;
    setState(attack(state, "you", selected, "hero"));
    setSelected(null);
  };

  const onEndTurn = () => {
    if (!state || !yourTurn) return;
    setSelected(null);
    setState(endTurn(state));
  };

  if (loading || !state) {
    return (
      <div className="grid min-h-[18rem] place-items-center text-sm text-fg-2">
        {loading ? "웹툰 카드를 불러오는 중…" : "카드를 준비하는 중…"}
      </div>
    );
  }

  const attacking = selected !== null;

  return (
    <div className="relative flex flex-col gap-3">
      {/* 상대 영웅 */}
      <div className="flex items-center justify-between">
        <HeroBar side="ai" hp={state.heroHp.ai} targetable={attacking} onClick={onHeroAttack} />
        <div className="flex items-center gap-2 text-[0.7rem] text-fg-3">
          <span>턴 {state.turn}</span>
          {!state.winner && <GameHelp id="card-battle" title="웹툰 카드 배틀" steps={HELP_STEPS} />}
        </div>
      </div>

      {/* 상대 필드 */}
      <div className="flex min-h-[4.6rem] flex-wrap items-center gap-1.5 rounded-xl border border-line/60 bg-rose-500/5 p-2">
        {state.board.ai.length === 0 && <span className="text-[0.7rem] text-fg-3">상대 필드가 비어 있음</span>}
        {state.board.ai.map((m) => (
          <BoardMinion
            key={m.uid}
            minion={m}
            side="ai"
            selectable={false}
            selected={false}
            targetable={attacking}
            onClick={() => onMinionClick(m, "ai")}
          />
        ))}
      </div>

      {/* 내 필드 */}
      <div className="flex min-h-[4.6rem] flex-wrap items-center gap-1.5 rounded-xl border border-line/60 bg-emerald-500/5 p-2">
        {state.board.you.length === 0 && <span className="text-[0.7rem] text-fg-3">카드를 소환해 필드를 채우세요</span>}
        {state.board.you.map((m) => (
          <BoardMinion
            key={m.uid}
            minion={m}
            side="you"
            selectable={yourTurn && m.ready}
            selected={selected === m.uid}
            targetable={false}
            onClick={() => onMinionClick(m, "you")}
          />
        ))}
      </div>

      {/* 내 영웅 + 마나 + 턴 종료 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <HeroBar side="you" hp={state.heroHp.you} targetable={false} onClick={() => {}} />
        <div className="flex items-center gap-1 text-sm font-semibold text-sky-500" aria-label={`마나 ${state.mana.you}/${state.maxMana.you}`}>
          {Array.from({ length: state.maxMana.you }).map((_, i) => (
            <span key={i} className={cn("h-3 w-3 rounded-full", i < state.mana.you ? "bg-sky-500" : "bg-sky-500/20")} />
          ))}
          <span className="ml-1 tabular-nums text-fg-2">{state.mana.you}/{state.maxMana.you}</span>
        </div>
        <Button size="sm" variant={yourTurn ? "solid" : "quiet"} disabled={!yourTurn} onClick={onEndTurn}>
          {state.active === "ai" ? "상대 턴…" : "턴 종료"}
        </Button>
      </div>

      {/* 손패 */}
      <div className="flex items-end gap-1.5 overflow-x-auto rounded-xl border border-line/60 bg-card/40 p-2">
        {state.hand.you.map((c) => (
          <HandCard key={c.uid} card={c} playable={yourTurn && state.mana.you >= c.cost && state.board.you.length < 7} onPlay={() => onHandPlay(c)} />
        ))}
        {state.hand.you.length === 0 && <span className="px-2 py-6 text-[0.7rem] text-fg-3">손패가 비었음</span>}
      </div>

      <p className="text-center text-[0.7rem] text-fg-3" aria-live="polite">
        {state.winner
          ? state.winner === "you"
            ? "🏆 승리! 웹툰 군단이 상대 영웅을 쓰러뜨렸습니다."
            : "💀 패배… 다시 도전해 보세요."
          : attacking
            ? "공격 대상(적 미니언 또는 상대 영웅)을 선택하세요."
            : yourTurn
              ? "손패를 내거나, 준비된 내 미니언을 눌러 공격하세요."
              : "상대가 수를 두는 중…"}
      </p>

      {/* 승패 오버레이 */}
      {state.winner && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="solid" onClick={restart}>
            <RotateCcw className="mr-1 h-4 w-4" /> 다시 대전
          </Button>
          <Button variant="outline" onClick={onExit}>
            <Swords className="mr-1 h-4 w-4" /> 다른 게임
          </Button>
        </div>
      )}
    </div>
  );
}

export default CardBattleGame;

export { HERO_HP };
