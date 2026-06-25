import { useEffect, useReducer, useRef, useState } from 'react';

import { Button } from '../../tds-shim';
import { GameHelp } from '../../games/GameHelp';
import {
  buildBoard,
  flipReducer,
  initState,
  isFaceUp,
  isSolved,
  type Tile,
} from '../../games/memory-engine';
import { liveRng, useGameTitles } from '../../games/types';
import { ShareResult } from '../../games/ShareResult';
import { navigate } from '../../router';
import { theme, pageShell } from '../../theme';

const PAIRS = 6; // 6쌍 = 12타일
const MISMATCH_DELAY = 800; // 미스매치 후 다시 닫히기까지(ms)
const BEST_KEY = 'play:memory-best';

/** 최고 기록(최소 이동 횟수) 읽기 — localStorage 실패 시 무시. */
function readBest(): number | null {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    const n = raw == null ? NaN : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeBest(moves: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(moves));
  } catch {
    // 비공개 모드 등 — 조용히 무시.
  }
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 타일 커버 — 실제 이미지 또는 OKLCH 그라디언트 폴백(GameCover 패턴 동일). */
function TileFace({ tile }: { tile: Tile }) {
  const [broken, setBroken] = useState(false);
  const gradient = `linear-gradient(150deg, ${tile.cover[0]}, ${tile.cover[1]})`;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 10, background: gradient }}>
      {tile.coverImage && !broken && (
        <img
          src={tile.coverImage}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '2px 4px', fontSize: 9, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.55)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {tile.name}
      </div>
    </div>
  );
}

function MemoryTile({
  tile,
  faceUp,
  matched,
  disabled,
  onFlip,
}: {
  tile: Tile;
  faceUp: boolean;
  matched: boolean;
  disabled: boolean;
  onFlip: () => void;
}) {
  return (
    <button
      type="button"
      className="pressable"
      disabled={disabled || faceUp}
      onClick={onFlip}
      aria-pressed={faceUp}
      aria-label={faceUp ? tile.name : '뒤집힌 카드'}
      style={{
        position: 'relative',
        aspectRatio: '3 / 4',
        width: '100%',
        overflow: 'hidden',
        borderRadius: 10,
        padding: 0,
        cursor: !faceUp && !disabled ? 'pointer' : 'default',
        background: 'transparent',
        border: matched
          ? `2px solid ${theme.accent}`
          : faceUp
            ? `1px solid ${theme.accent}`
            : `1px solid ${theme.border}`,
        boxShadow: matched ? `0 0 0 3px ${theme.accentSoft}` : 'none',
      }}
    >
      {faceUp ? (
        <TileFace tile={tile} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', borderRadius: 10, background: theme.accentSoft, fontSize: 20 }}>
          <span aria-hidden>🃏</span>
        </div>
      )}
    </button>
  );
}

export function MemoryGame() {
  const { titles, loading } = useGameTitles();
  const [seed, setSeed] = useState(0);
  const [state, dispatch] = useReducer(flipReducer, [], () => initState([]));
  const [elapsed, setElapsed] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const startRef = useRef<number | null>(null);
  const recordedRef = useRef(false);

  const ready = titles.length >= PAIRS;
  const solved = isSolved(state);

  // 최초 best 로드(클라이언트에서만).
  useEffect(() => {
    setBest(readBest());
  }, []);

  // 데이터 준비되면(또는 재시작 시) 보드 구성.
  useEffect(() => {
    if (!ready) return;
    const tiles = buildBoard(titles, PAIRS, liveRng);
    dispatch({ type: 'reset', tiles });
    setElapsed(0);
    startRef.current = null;
    recordedRef.current = false;
  }, [ready, titles, seed]);

  // 미스매치(잠김) → 잠깐 뒤 자동 resolve로 닫기.
  useEffect(() => {
    if (!state.locked) return;
    const t = setTimeout(() => dispatch({ type: 'resolve' }), MISMATCH_DELAY);
    return () => clearTimeout(t);
  }, [state.locked]);

  // 타이머 — 첫 상호작용(뒤집힌 카드/이동 발생)부터 승리까지 1초 단위로.
  const started = state.flipped.length > 0 || state.moves > 0;
  useEffect(() => {
    if (!started || solved) return;
    if (startRef.current === null) startRef.current = Date.now();
    const start = startRef.current;
    setElapsed(Math.floor((Date.now() - start) / 1000));
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [started, solved]);

  // 승리 시 최고 기록 갱신(이동 횟수 기준, 1회만).
  useEffect(() => {
    if (!solved || recordedRef.current) return;
    recordedRef.current = true;
    setBest((cur) => {
      const next = cur === null ? state.moves : Math.min(cur, state.moves);
      writeBest(next);
      return next;
    });
  }, [solved, state.moves]);

  const onFlip = (id: string) => {
    dispatch({ type: 'flip', id });
  };

  const restart = () => setSeed((s) => s + 1);

  if (loading || !ready || state.tiles.length === 0) {
    return (
      <div style={{ ...pageShell, paddingTop: 80, textAlign: 'center', color: theme.textMuted }} aria-live="polite">
        {loading ? '웹툰 카드를 불러오는 중…' : '보드를 준비하는 중…'}
      </div>
    );
  }

  const matchedPairs = state.matched.length / 2;

  return (
    <div style={pageShell}>
      <button type="button" className="pressable" onClick={() => navigate('/play')} style={{ background: 'none', border: 'none', color: theme.textMuted, padding: '14px 0', cursor: 'pointer', fontSize: 14 }}>
        ← 놀이터
      </button>

      {/* 상단 상태바 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: theme.textMuted }}>
          <span>
            짝 <b style={{ color: theme.text }}>{matchedPairs}</b>/{PAIRS}
          </span>
          <span>
            이동 <b style={{ color: theme.text }}>{state.moves}</b>
          </span>
          <span>⏱ {fmtTime(elapsed)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {best !== null && (
            <span style={{ fontSize: 12, color: theme.accent, fontWeight: 700 }}>🏆 최고 {best}수</span>
          )}
          <GameHelp
            id="memory"
            title="웹툰 짝맞추기"
            steps={[
              {
                emoji: '🎯',
                title: '목표',
                desc: (
                  <>
                    뒤집힌 <b style={{ color: theme.text }}>12장의 카드</b>에서 같은 웹툰 표지{' '}
                    <b style={{ color: theme.text }}>6쌍</b>을 모두 찾으면 클리어예요.
                  </>
                ),
              },
              {
                emoji: '👆',
                title: '맞추기',
                desc: (
                  <>
                    카드를 눌러 한 번에 <b style={{ color: theme.text }}>두 장</b>을 뒤집고, 같은 웹툰이면
                    그대로 <span style={{ color: theme.accent }}>고정</span>돼요.
                  </>
                ),
              },
              {
                emoji: '🔄',
                title: '안 맞으면',
                desc: (
                  <>
                    다르면 잠깐 보여준 뒤 카드가 <b style={{ color: theme.text }}>다시 뒤집혀요</b>. 표지
                    위치를 기억해 두세요.
                  </>
                ),
              },
              {
                emoji: '🏆',
                title: '점수',
                desc: (
                  <>
                    <b style={{ color: theme.text }}>이동 횟수</b>와 <b style={{ color: theme.text }}>시간</b>이
                    기록되며, 가장 적은 이동 수가 <span style={{ color: theme.accent }}>최고 기록</span>으로
                    남아요.
                  </>
                ),
              },
            ]}
          />
        </div>
      </div>

      {/* 보드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {state.tiles.map((tile) => {
          const matched = state.matched.includes(tile.id);
          return (
            <MemoryTile
              key={tile.id}
              tile={tile}
              faceUp={isFaceUp(state, tile.id)}
              matched={matched}
              disabled={state.locked || solved}
              onFlip={() => onFlip(tile.id)}
            />
          );
        })}
      </div>

      {/* 상태 안내(스크린리더 라이브) */}
      <p style={{ textAlign: 'center', fontSize: 12, color: theme.textMuted, margin: '14px 0 0' }} aria-live="polite">
        {solved
          ? `🎉 클리어! ${state.moves}수 · ${fmtTime(elapsed)}${best !== null && state.moves <= best ? ' — 최고 기록!' : ''}`
          : state.locked
            ? '짝이 아니에요. 카드가 다시 뒤집힙니다…'
            : state.flipped.length === 1
              ? '같은 웹툰을 찾아 카드를 한 장 더 뒤집으세요.'
              : '카드 두 장을 뒤집어 같은 웹툰 표지를 맞추세요.'}
      </p>

      {/* 컨트롤 */}
      <div style={{ marginTop: 16 }}>
        <Button onClick={restart} style={{ width: '100%' }}>
          {solved ? '🎉 다시 도전' : '🔄 새 보드'}
        </Button>
        {solved && (
          <ShareResult message={`툰스펙트럼 웹툰 짝맞추기 클리어! 🃏 ${PAIRS}쌍을 ${state.moves}수 · ${fmtTime(elapsed)} 만에! 너의 기록은?`} />
        )}
      </div>
    </div>
  );
}
