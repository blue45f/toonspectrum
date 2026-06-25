import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '../../tds-shim';
import { GameHelp, type HelpStep } from '../../games/GameHelp';
import { ShareResult } from '../../games/ShareResult';
import {
  aiTakeTurn,
  attack,
  endTurn,
  playCard,
  startBattle,
  type BattleState,
  type Card,
  type Minion,
  type Side,
} from '../../games/card-battle-engine';
import { liveRng, useGameTitles } from '../../games/types';
import { navigate } from '../../router';
import { theme, pageShell } from '../../theme';

/** 결정적 덱 셔플을 위한 시드 rng(웹 레퍼런스와 동일한 mulberry32). */
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
function CardArt({ card, style }: { card: Card; style?: React.CSSProperties }) {
  const [broken, setBroken] = useState(false);
  const gradient = `linear-gradient(150deg, ${card.cover[0]}, ${card.cover[1]})`;
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: gradient, ...style }}>
      {card.coverImage && !broken && (
        <img
          src={card.coverImage}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }}
        />
      )}
    </div>
  );
}

function HandCard({ card, playable, onPlay }: { card: Card; playable: boolean; onPlay: () => void }) {
  return (
    <button
      type="button"
      className="pressable"
      disabled={!playable}
      onClick={onPlay}
      aria-label={`${card.name} 소환 (코스트 ${card.cost}, ${card.atk}/${card.hp})`}
      style={{
        position: 'relative',
        width: 84,
        flexShrink: 0,
        overflow: 'hidden',
        borderRadius: 10,
        textAlign: 'left',
        padding: 0,
        cursor: playable ? 'pointer' : 'default',
        background: theme.surface,
        border: playable ? `1px solid ${theme.accent}` : `1px solid ${theme.border}`,
        opacity: playable ? 1 : 0.6,
      }}
    >
      <CardArt card={card} style={{ height: 80, width: '100%' }} />
      <div style={{ position: 'absolute', left: 4, top: 4, display: 'grid', placeItems: 'center', height: 20, width: 20, borderRadius: 999, background: '#0ea5e9', color: '#fff', fontSize: 11, fontWeight: 800, boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
        {card.cost}
      </div>
      <div style={{ background: 'rgba(34,26,19,0.95)', padding: '4px 6px 0', fontSize: 10, fontWeight: 600, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {card.name}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(34,26,19,0.95)', padding: '0 6px 4px', fontSize: 11, fontWeight: 700 }}>
        <span style={{ color: '#fbbf24' }}>⚔ {card.atk}</span>
        <span style={{ color: '#fb7185' }}>♥ {card.hp}</span>
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
  const border = selected
    ? `2px solid ${theme.accent}`
    : targetable
      ? '2px solid #fb7185'
      : side === 'you'
        ? '2px solid rgba(52,211,153,0.55)'
        : '2px solid rgba(251,113,133,0.45)';
  return (
    <button
      type="button"
      className={`pressable${targetable ? ' rise' : ''}`}
      disabled={!selectable && !targetable}
      onClick={onClick}
      aria-label={`${minion.name} ${minion.atk}/${minion.curHp}${minion.ready ? ' (공격 가능)' : ''}`}
      style={{
        position: 'relative',
        width: 64,
        flexShrink: 0,
        overflow: 'hidden',
        borderRadius: 10,
        padding: 0,
        cursor: selectable || targetable ? 'pointer' : 'default',
        background: theme.surface,
        border,
        boxShadow: selected
          ? `0 0 0 2px ${theme.accentSoft}`
          : minion.ready && side === 'you'
            ? '0 0 0 2px rgba(52,211,153,0.4)'
            : 'none',
      }}
    >
      <CardArt card={minion} style={{ height: 64, width: '100%' }} />
      <div style={{ position: 'absolute', insetInline: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.55)', padding: '2px 4px', fontSize: 11, fontWeight: 700, color: '#fff' }}>
        <span style={{ color: '#fcd34d' }}>{minion.atk}</span>
        <span style={{ color: '#fda4af' }}>{minion.curHp}</span>
      </div>
    </button>
  );
}

function HeroBar({ side, hp, targetable, onClick }: { side: Side; hp: number; targetable: boolean; onClick: () => void }) {
  const label = side === 'you' ? '나' : '상대';
  return (
    <button
      type="button"
      className={`pressable${targetable ? ' rise' : ''}`}
      disabled={!targetable}
      onClick={onClick}
      aria-label={`${label} 영웅 체력 ${hp}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 999,
        padding: '6px 14px',
        fontSize: 14,
        fontWeight: 700,
        cursor: targetable ? 'pointer' : 'default',
        background: 'transparent',
        border: targetable ? '1px solid #fb7185' : `1px solid ${theme.border}`,
        color: theme.text,
      }}
    >
      <span style={{ color: theme.textMuted }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#fb7185' }}>
        <span aria-hidden>♥</span>
        <span style={{ fontSize: 16 }}>{Math.max(0, hp)}</span>
      </span>
    </button>
  );
}

/** 카드 배틀 규칙(목표/소환/공격/턴) — 공용 GameHelp에 주입. */
const HELP_STEPS: HelpStep[] = [
  {
    emoji: '🎯',
    title: '목표',
    desc: (
      <>
        미니언을 소환·공격시켜 <b style={{ color: '#fb7185' }}>상대 영웅의 ♥(체력)</b>를 0으로 만들면 승리해요.
      </>
    ),
  },
  {
    emoji: '🃏',
    title: '소환',
    desc: (
      <>
        맨 아래 <b style={{ color: theme.text }}>손패 카드</b>를 누르면 내 필드로 나와요. 카드 좌상단{' '}
        <b style={{ color: '#0ea5e9' }}>파란 숫자 = 마나 코스트</b>(가진 마나 ●●만큼만 낼 수 있어요).{' '}
        <span style={{ color: '#fbbf24' }}>⚔ 공격력</span> · <span style={{ color: '#fb7185' }}>♥ 체력</span>.
      </>
    ),
  },
  {
    emoji: '⚔️',
    title: '공격',
    desc: (
      <>
        소환한 그 턴엔 공격 못 해요(다음 턴부터!). <b style={{ color: '#34d399' }}>내 미니언(초록 테두리)</b>을 눌러 고른 다음,{' '}
        <b style={{ color: '#fb7185' }}>적 미니언</b>이나 <b style={{ color: '#fb7185' }}>상대 영웅</b>을 누르면 공격해요.
      </>
    ),
  },
  {
    emoji: '🔄',
    title: '턴',
    desc: (
      <>
        턴마다 마나가 1씩 늘고 카드를 1장 뽑아요. 할 일을 마치면 <b style={{ color: theme.text }}>“턴 종료”</b>를 누르세요.
      </>
    ),
  },
];

export function CardBattleGame() {
  const { titles, loading } = useGameTitles();
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
    if (!state || state.winner || state.active !== 'ai') return;
    const t = setTimeout(() => {
      setState((cur) => (cur && cur.active === 'ai' && !cur.winner ? aiTakeTurn(cur, rngRef.current) : cur));
    }, 850);
    return () => clearTimeout(t);
  }, [state]);

  const restart = () => {
    const next = seed + 1;
    setSeed(next);
    newGame(next);
  };

  const yourTurn = !!state && state.active === 'you' && !state.winner;

  const onHandPlay = (card: Card) => {
    if (!state || !yourTurn) return;
    setState(playCard(state, 'you', card.uid));
  };

  const onMinionClick = (minion: Minion, side: Side) => {
    if (!state || !yourTurn) return;
    if (side === 'you') {
      if (minion.ready) setSelected((cur) => (cur === minion.uid ? null : minion.uid));
      return;
    }
    // 적 미니언 = 공격 대상.
    if (selected) {
      setState(attack(state, 'you', selected, minion.uid));
      setSelected(null);
    }
  };

  const onHeroAttack = () => {
    if (!state || !yourTurn || !selected) return;
    setState(attack(state, 'you', selected, 'hero'));
    setSelected(null);
  };

  const onEndTurn = () => {
    if (!state || !yourTurn) return;
    setSelected(null);
    setState(endTurn(state));
  };

  if (loading || !state) {
    return (
      <div style={{ ...pageShell, paddingTop: 80, textAlign: 'center', color: theme.textMuted }} aria-live="polite">
        {loading ? '웹툰 카드를 불러오는 중…' : '카드를 준비하는 중…'}
      </div>
    );
  }

  const attacking = selected !== null;

  return (
    <div style={pageShell}>
      <button type="button" className="pressable" onClick={() => navigate('/play')} style={{ background: 'none', border: 'none', color: theme.textMuted, padding: '14px 0', cursor: 'pointer', fontSize: 14 }}>
        ← 놀이터
      </button>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 상대 영웅 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <HeroBar side="ai" hp={state.heroHp.ai} targetable={attacking} onClick={onHeroAttack} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: theme.textMuted }}>
            <span>턴 {state.turn}</span>
            {!state.winner && <GameHelp id="card-battle" title="웹툰 카드 배틀" steps={HELP_STEPS} />}
          </div>
        </div>

        {/* 상대 필드 */}
        <div style={{ display: 'flex', minHeight: 74, flexWrap: 'wrap', alignItems: 'center', gap: 6, borderRadius: 14, border: `1px solid ${theme.border}`, background: 'rgba(251,113,133,0.05)', padding: 8 }}>
          {state.board.ai.length === 0 && <span style={{ fontSize: 12, color: theme.textMuted }}>상대 필드가 비어 있음</span>}
          {state.board.ai.map((m) => (
            <BoardMinion
              key={m.uid}
              minion={m}
              side="ai"
              selectable={false}
              selected={false}
              targetable={attacking}
              onClick={() => onMinionClick(m, 'ai')}
            />
          ))}
        </div>

        {/* 내 필드 */}
        <div style={{ display: 'flex', minHeight: 74, flexWrap: 'wrap', alignItems: 'center', gap: 6, borderRadius: 14, border: `1px solid ${theme.border}`, background: 'rgba(52,211,153,0.05)', padding: 8 }}>
          {state.board.you.length === 0 && <span style={{ fontSize: 12, color: theme.textMuted }}>카드를 소환해 필드를 채우세요</span>}
          {state.board.you.map((m) => (
            <BoardMinion
              key={m.uid}
              minion={m}
              side="you"
              selectable={yourTurn && m.ready}
              selected={selected === m.uid}
              targetable={false}
              onClick={() => onMinionClick(m, 'you')}
            />
          ))}
        </div>

        {/* 내 영웅 + 마나 + 턴 종료 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <HeroBar side="you" hp={state.heroHp.you} targetable={false} onClick={() => {}} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 700, color: '#0ea5e9' }} aria-label={`마나 ${state.mana.you}/${state.maxMana.you}`}>
            {Array.from({ length: state.maxMana.you }).map((_, i) => (
              <span key={i} style={{ height: 12, width: 12, borderRadius: 999, background: i < state.mana.you ? '#0ea5e9' : 'rgba(14,165,233,0.2)' }} />
            ))}
            <span style={{ marginLeft: 4, color: theme.textMuted }}>{state.mana.you}/{state.maxMana.you}</span>
          </div>
          <Button variant={yourTurn ? undefined : 'weak'} disabled={!yourTurn} onClick={onEndTurn} style={{ minHeight: 40, padding: '0 16px', fontSize: 14 }}>
            {state.active === 'ai' ? '상대 턴…' : '턴 종료'}
          </Button>
        </div>

        {/* 손패 */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, overflowX: 'auto', borderRadius: 14, border: `1px solid ${theme.border}`, background: 'rgba(255,255,255,0.02)', padding: 8 }}>
          {state.hand.you.map((c) => (
            <HandCard
              key={c.uid}
              card={c}
              playable={yourTurn && state.mana.you >= c.cost && state.board.you.length < 7}
              onPlay={() => onHandPlay(c)}
            />
          ))}
          {state.hand.you.length === 0 && <span style={{ padding: '24px 8px', fontSize: 12, color: theme.textMuted }}>손패가 비었음</span>}
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: theme.textMuted, margin: 0 }} aria-live="polite">
          {state.winner
            ? state.winner === 'you'
              ? '🏆 승리! 웹툰 군단이 상대 영웅을 쓰러뜨렸습니다.'
              : '💀 패배… 다시 도전해 보세요.'
            : attacking
              ? '공격 대상(적 미니언 또는 상대 영웅)을 선택하세요.'
              : yourTurn
                ? '손패를 내거나, 준비된 내 미니언을 눌러 공격하세요.'
                : '상대가 수를 두는 중…'}
        </p>

        {/* 승패 — 다시 대전 + 결과 공유 */}
        {state.winner && (
          <div>
            <Button onClick={restart} style={{ width: '100%' }}>
              🔄 다시 대전
            </Button>
            <ShareResult
              message={
                state.winner === 'you'
                  ? `툰스펙트럼 웹툰 카드 배틀 승리! 🏆 ${state.turn}턴 만에 상대 영웅을 쓰러뜨렸어요. 너도 덤벼봐!`
                  : `툰스펙트럼 웹툰 카드 배틀에서 졌어요… 💀 ${state.turn}턴까지 버텼는데! 너는 이길 수 있어?`
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default CardBattleGame;
