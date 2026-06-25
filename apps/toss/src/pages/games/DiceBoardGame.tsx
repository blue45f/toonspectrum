import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '../../tds-shim';
import { GameHelp } from '../../games/GameHelp';
import { ShareResult } from '../../games/ShareResult';
import {
  BOARD_SIZE,
  isFinished,
  makeInitialState,
  RECOMMEND_SCORE,
  rollAndMove,
  type BoardState,
  type Tile,
} from '../../games/dice-board-engine';
import { liveRng, useGameTitles, type GameTitle } from '../../games/types';
import { navigate } from '../../router';
import { theme, pageShell } from '../../theme';

/** 결정적 보드를 위한 시드 rng(웹 레퍼런스와 동일한 mulberry32). */
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TILE_META: Record<Tile['type'], { glyph: string; label: string; ring: string; fill: string }> = {
  start: { glyph: '출', label: '출발', ring: theme.border, fill: theme.surface },
  normal: { glyph: '', label: '일반', ring: 'rgba(255,255,255,0.05)', fill: 'rgba(255,255,255,0.03)' },
  goal: { glyph: '🏁', label: '골', ring: theme.accent, fill: theme.accentSoft },
  recommend: { glyph: '⭐', label: '추천', ring: 'rgba(251,191,36,0.5)', fill: 'rgba(251,191,36,0.12)' },
  forward: { glyph: '⏩', label: '전진', ring: 'rgba(52,211,153,0.5)', fill: 'rgba(52,211,153,0.12)' },
  back: { glyph: '⏪', label: '후퇴', ring: 'rgba(56,189,248,0.5)', fill: 'rgba(56,189,248,0.12)' },
  trap: { glyph: '🕳️', label: '함정', ring: 'rgba(251,113,133,0.5)', fill: 'rgba(251,113,133,0.12)' },
};

const DICE_FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** 추천 웹툰 커버 — 실제 이미지 또는 OKLCH 그라디언트 폴백. */
function RecommendCard({ title }: { title: GameTitle }) {
  const [broken, setBroken] = useState(false);
  const gradient = `linear-gradient(150deg, ${title.cover[0]}, ${title.cover[1]})`;
  return (
    <div style={{ width: 74, flexShrink: 0 }}>
      <div style={{ position: 'relative', height: 98, width: '100%', overflow: 'hidden', borderRadius: 8, border: `1px solid ${theme.border}`, background: gradient }}>
        {title.coverImage && !broken && (
          <img
            src={title.coverImage}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }}
          />
        )}
        <div style={{ position: 'absolute', left: 4, top: 4, display: 'grid', placeItems: 'center', height: 16, width: 16, borderRadius: 999, background: '#fbbf24', color: '#000', fontSize: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
          ★
        </div>
      </div>
      <div style={{ marginTop: 4, fontSize: 10, fontWeight: 500, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
      style={{
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        height: 36,
        width: 36,
        flexShrink: 0,
        borderRadius: 8,
        border: `1px solid ${meta.ring}`,
        background: meta.fill,
        fontSize: 13,
        boxShadow: here ? `0 0 0 2px ${theme.accent}` : 'none',
      }}
      aria-label={`${tile.index}번 칸 (${meta.label})${here ? ' · 현재 위치' : ''}`}
    >
      <span aria-hidden style={{ lineHeight: 1 }}>
        {meta.glyph || <span style={{ color: theme.textMuted, fontSize: 11 }}>{tile.index}</span>}
      </span>
      {here && (
        <span aria-hidden style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', fontSize: 16, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>
          📖
        </span>
      )}
    </div>
  );
}

export function DiceBoardGame() {
  const { titles, loading } = useGameTitles();
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
      <div style={{ ...pageShell, paddingTop: 80, textAlign: 'center', color: theme.textMuted }} aria-live="polite">
        {loading ? '웹툰 보드를 준비하는 중…' : '보드를 그리는 중…'}
      </div>
    );
  }

  const finished = isFinished(state);
  const resting = state.skipTurns > 0;
  const progressPct = Math.round((state.pos / BOARD_SIZE) * 100);

  return (
    <div style={pageShell}>
      <button type="button" className="pressable" onClick={() => navigate('/play')} style={{ background: 'none', border: 'none', color: theme.textMuted, padding: '14px 0', cursor: 'pointer', fontSize: 14 }}>
        ← 놀이터
      </button>

      {/* 상단 스탯 바 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: theme.textMuted }}>
          <span style={{ fontWeight: 700, color: theme.text }}>
            ✨ <b style={{ color: theme.accent }}>{state.score}</b>점
          </span>
          <span>
            🚩 <b style={{ color: theme.text }}>{state.pos}</b>/{BOARD_SIZE}
          </span>
          <span>턴 {state.rolls}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: theme.textMuted }}>추천 수집 {state.collected.length}</span>
          <GameHelp
            id="dice-board"
            title="웹툰 주사위 보드"
            steps={[
              {
                emoji: '🎯',
                title: '목표',
                desc: (
                  <>
                    <b style={{ color: theme.text }}>{BOARD_SIZE}칸</b> 트랙을 달려 마지막{' '}
                    <span style={{ color: theme.accent }}>🏁 골</span>에 도달하면 완주예요.
                  </>
                ),
              },
              {
                emoji: '🎲',
                title: '주사위 굴리기',
                desc: (
                  <>
                    <b style={{ color: theme.text }}>주사위 굴리기</b> 버튼으로 1~6칸 전진해요. 한 칸당{' '}
                    <b style={{ color: theme.text }}>+1점</b>씩 쌓여요.
                  </>
                ),
              },
              {
                emoji: '⭐',
                title: '이벤트 칸',
                desc: (
                  <>
                    <span style={{ color: '#fbbf24' }}>⭐추천</span> 칸은 웹툰 한 편 발견 +{RECOMMEND_SCORE}점,{' '}
                    <span style={{ color: '#34d399' }}>⏩전진</span>·<span style={{ color: '#38bdf8' }}>⏪후퇴</span>는 위치
                    이동, <span style={{ color: '#fb7185' }}>🕳️함정</span>은 다음 턴 쉼이에요.
                  </>
                ),
              },
              {
                emoji: '🏆',
                title: '완주',
                desc: (
                  <>
                    골에 도착하면 끝! <b style={{ color: theme.text }}>점수·턴·수집한 추천 웹툰</b>으로 결과를 확인해요.
                  </>
                ),
              },
            ]}
          />
        </div>
      </div>

      {/* 진행 게이지 */}
      <div style={{ height: 6, width: '100%', overflow: 'hidden', borderRadius: 999, background: 'rgba(255,255,255,0.07)' }}>
        <div style={{ height: '100%', borderRadius: 999, background: theme.accent, width: `${progressPct}%`, transition: 'width .3s' }} />
      </div>

      {/* 보드 트랙 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, borderRadius: 14, border: `1px solid ${theme.border}`, background: 'rgba(255,255,255,0.02)', padding: 10, marginTop: 12 }}>
        {state.tiles.map((t) => (
          <TrackTile key={t.index} tile={t} here={t.index === state.pos} />
        ))}
      </div>

      {/* 주사위 + 굴리기 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 14, border: `1px solid ${theme.border}`, background: 'rgba(255,255,255,0.02)', padding: 12, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden
            className={rolling ? 'rise' : undefined}
            style={{ display: 'grid', placeItems: 'center', height: 48, width: 48, borderRadius: 14, border: `2px solid ${theme.border}`, background: theme.surface, fontSize: 28, lineHeight: 1, opacity: rolling ? 0.6 : 1 }}
          >
            {rolling ? '🎲' : DICE_FACE[state.dice] || '🎲'}
          </span>
          <span style={{ fontSize: 14, color: theme.textMuted }}>
            {state.dice > 0 ? (
              <>
                주사위 <b style={{ color: theme.text }}>{state.dice}</b>
              </>
            ) : (
              '주사위를 굴려보세요'
            )}
          </span>
        </div>
        <Button variant={finished ? 'weak' : undefined} disabled={finished || rolling} onClick={onRoll}>
          🎲 {finished ? '완주!' : rolling ? '굴리는 중…' : resting ? '쉬는 턴 넘기기' : '주사위 굴리기'}
        </Button>
      </div>

      {/* 상태 안내(aria-live) */}
      <p style={{ minHeight: 20, textAlign: 'center', fontSize: 13, color: theme.textMuted, margin: '12px 0 0' }} aria-live="polite" role="status">
        {finished
          ? `🏆 완주! 총 ${state.score}점, ${state.rolls}턴, 추천 ${state.collected.length}편 수집.`
          : state.lastEvent}
      </p>

      {/* 수집한 추천 웹툰 */}
      {state.collected.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: theme.textMuted }}>⭐ 발견한 추천 웹툰</div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', borderRadius: 14, border: `1px solid ${theme.border}`, background: 'rgba(255,255,255,0.02)', padding: 8 }}>
            {state.collected.map((idx) => (titles[idx] ? <RecommendCard key={titles[idx].id} title={titles[idx]} /> : null))}
          </div>
        </div>
      )}

      {/* 컨트롤 + 결과 공유 */}
      <div style={{ marginTop: 16 }}>
        <Button onClick={restart} style={{ width: '100%' }}>
          🔄 다시 시작
        </Button>
        {finished && (
          <ShareResult message={`툰스펙트럼 웹툰 주사위 보드 완주! 🎲 ${state.score}점 · ${state.rolls}턴 · 추천 ${state.collected.length}편 수집! 너의 기록은?`} />
        )}
      </div>
    </div>
  );
}

export default DiceBoardGame;
