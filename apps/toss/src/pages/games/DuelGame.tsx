import { useEffect, useState } from 'react';

import { Button } from '../../tds-shim';
import { navigate } from '../../router';
import { theme, pageShell } from '../../theme';
import {
  guessNext,
  hasEnoughTitles,
  judge,
  startDuel,
  type DuelState,
  type Guess,
} from '@toonspectrum/play-core';
import { GameCover } from '../../games/GameCover';
import { GameHelp } from '../../games/GameHelp';
import { formatCount, liveRng, useGameTitles, type GameTitle } from '../../games/types';
import { ShareResult } from '../../games/ShareResult';

function Poster({ t, reveal }: { t: GameTitle; reveal: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <GameCover t={t} />
      <div
        style={{
          marginTop: 8,
          textAlign: 'center',
          fontSize: 13,
          fontWeight: 700,
          color: theme.text,
          lineHeight: 1.3,
          height: 34,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {t.title}
      </div>
      <div
        style={{
          marginTop: 4,
          textAlign: 'center',
          fontSize: 19,
          fontWeight: 900,
          color: reveal ? theme.accent : theme.textMuted,
          letterSpacing: reveal ? 0 : 4,
          transition: 'color .3s',
        }}
      >
        {reveal ? `👁 ${formatCount(t.views)}` : '👁 ???'}
      </div>
    </div>
  );
}

export function DuelGame() {
  const { titles, loading } = useGameTitles();
  const [state, setState] = useState<DuelState<GameTitle> | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading && hasEnoughTitles(titles) && !state) setState(startDuel(titles, liveRng));
  }, [loading, titles, state]);

  function guess(g: Guess) {
    if (!state || state.over || revealed) return;
    setRevealed(true);
    setResult(judge(state.anchor.views, state.challenger.views, g));
    const next = guessNext(state, g, titles, liveRng);
    setTimeout(() => {
      setState(next);
      setRevealed(false);
      setResult(null);
    }, 1100);
  }

  function restart() {
    setState(startDuel(titles, liveRng));
    setRevealed(false);
    setResult(null);
  }

  if (loading || !state) {
    return <div style={{ ...pageShell, paddingTop: 80, textAlign: 'center', color: theme.textMuted }}>불러오는 중…</div>;
  }

  return (
    <div style={pageShell}>
      <button type="button" className="pressable" onClick={() => navigate('/play')} style={{ background: 'none', border: 'none', color: theme.textMuted, padding: '14px 0', cursor: 'pointer', fontSize: 14 }}>
        ← 놀이터
      </button>

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span style={{ padding: '6px 14px', borderRadius: 999, background: theme.accentSoft, color: theme.accent, fontWeight: 800, fontSize: 14 }}>
          🔥 {state.score}연승
        </span>
        <span style={{ padding: '6px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: theme.textMuted, fontWeight: 700, fontSize: 14 }}>
          최고 {state.best}
        </span>
        <GameHelp
          id="popularity-duel"
          title="웹툰 인기 대결"
          steps={[
            {
              emoji: '🎯',
              title: '목표',
              desc: (
                <>
                  두 웹툰 중 <b style={{ color: theme.text }}>조회수가 더 많은 작품</b>을 맞히며 연승을 쌓아요.
                </>
              ),
            },
            {
              emoji: '👀',
              title: '비교 기준',
              desc: (
                <>
                  왼쪽 <b style={{ color: theme.text }}>기준 작품</b>의 조회수는 공개되고, 오른쪽{' '}
                  <b style={{ color: theme.text }}>도전 작품</b>의 조회수는 <span style={{ color: theme.textMuted }}>???</span>로 가려져요.
                </>
              ),
            },
            {
              emoji: '🔼',
              title: '선택',
              desc: (
                <>
                  도전 작품의 조회수가 기준보다 <b style={{ color: theme.text }}>더 높다 / 더 낮다</b>를 골라요.
                </>
              ),
            },
            {
              emoji: '🔥',
              title: '연승',
              desc: (
                <>
                  맞히면 <b style={{ color: theme.text }}>점수 +1</b>, 직전 도전 작품이 다음 기준이 돼요. 한 번이라도 틀리면{' '}
                  <b style={{ color: theme.text }}>게임 종료</b>—최고 점수는 계속 이어집니다.
                </>
              ),
            },
          ]}
        />
      </div>

      <div style={{ position: 'relative', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <Poster t={state.anchor} reveal />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '38%',
            transform: 'translate(-50%,-50%)',
            zIndex: 2,
            width: 40,
            height: 40,
            borderRadius: 999,
            display: 'grid',
            placeItems: 'center',
            background: theme.bg,
            border: `2px solid ${theme.accent}`,
            color: theme.accent,
            fontWeight: 900,
            fontSize: 14,
          }}
        >
          VS
        </div>
        <Poster t={state.challenger} reveal={revealed || state.over} />
      </div>

      <p style={{ textAlign: 'center', fontSize: 14, color: theme.textMuted, margin: '18px 0 16px' }}>
        오른쪽이 <b style={{ color: theme.text }}>{state.anchor.title}</b>보다 조회수가?
      </p>

      {state.over ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: theme.danger, marginBottom: 16 }}>💀 게임 오버 · {state.score}연승</div>
          <Button onClick={restart} style={{ width: '100%' }}>다시 도전</Button>
          <ShareResult message={`툰스펙트럼 인기 대결 ${state.score}연승! 🔥 (최고 ${state.best}연승) 너도 도전해봐`} />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12 }}>
          <Button onClick={() => guess('higher')} style={{ flex: 1, fontSize: 18 }} disabled={revealed}>▲ 더 높다</Button>
          <Button onClick={() => guess('lower')} variant="weak" style={{ flex: 1, fontSize: 18 }} disabled={revealed}>▼ 더 낮다</Button>
        </div>
      )}

      {revealed && (
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 22, fontWeight: 900, color: result ? '#4ade80' : theme.danger }} aria-live="polite">
          {result ? '🎉 정답!' : '❌ 땡!'}
        </div>
      )}
    </div>
  );
}
