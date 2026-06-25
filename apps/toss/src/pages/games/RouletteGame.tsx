import { useEffect, useRef, useState } from 'react';

import { Button } from '../../tds-shim';
import { Badge, Chips } from '../../ui';
import { GameCover } from '../../games/GameCover';
import { GameHelp, type HelpStep } from '../../games/GameHelp';
import { navigate } from '../../router';
import { theme, pageShell } from '../../theme';
import { genreChips, pickRandom, reasonFor, tierLabel } from '@toonspectrum/play-core';
import { formatCount, liveRng, useGameTitles, type GameTitle } from '../../games/types';
import { ShareResult } from '../../games/ShareResult';

const HELP_STEPS: HelpStep[] = [
  {
    emoji: '🎯',
    title: '목표',
    desc: (
      <>
        오늘 뭐 볼지 고민될 때, 룰렛이 인기 웹툰 중 <b style={{ color: theme.text }}>한 편</b>을 골라줘요.
      </>
    ),
  },
  {
    emoji: '🏷️',
    title: '장르 고르기',
    desc: (
      <>
        위쪽 <b style={{ color: theme.text }}>장르 칩</b>으로 범위를 좁혀요.{' '}
        <span style={{ color: theme.accent }}>전체</span>면 모든 인기작에서 뽑아요.
      </>
    ),
  },
  {
    emoji: '🎲',
    title: '돌리기',
    desc: (
      <>
        <b style={{ color: theme.text }}>돌리기</b> 버튼을 누르면 표지가 두구두구 돌다가 한 편에서 멈춰요.
      </>
    ),
  },
  {
    emoji: '✨',
    title: '결과 보기',
    desc: (
      <>
        제목·작가·장르와 <b style={{ color: theme.text }}>추천 이유</b>가 떠요. 마음에 안 들면{' '}
        <span style={{ color: theme.accent }}>다시 돌리기</span>로 또 뽑아요.
      </>
    ),
  },
];

export function RouletteGame() {
  const { titles, loading } = useGameTitles();
  const [genre, setGenre] = useState('전체');
  const [pick, setPick] = useState<GameTitle | null>(null);
  const [spinning, setSpinning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const chips = ['전체', ...genreChips(titles).slice(0, 10)];

  function spin() {
    if (spinning || titles.length === 0) return;
    setSpinning(true);
    const g = genre === '전체' ? undefined : genre;
    let ticks = 0;
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setPick(pickRandom(titles, liveRng, g));
      ticks += 1;
      if (ticks >= 12) {
        if (timer.current) clearInterval(timer.current);
        setPick(pickRandom(titles, liveRng, g));
        setSpinning(false);
      }
    }, 70);
  }

  if (loading) {
    return <div style={{ ...pageShell, paddingTop: 80, textAlign: 'center', color: theme.textMuted }}>불러오는 중…</div>;
  }

  return (
    <div style={pageShell}>
      <button type="button" className="pressable" onClick={() => navigate('/play')} style={{ background: 'none', border: 'none', color: theme.textMuted, padding: '14px 0', cursor: 'pointer' }}>
        ← 놀이터
      </button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: theme.textMuted }}>웹툰 룰렛</span>
        <GameHelp id="roulette" title="웹툰 룰렛" steps={HELP_STEPS} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <Chips items={chips} active={genre} onPick={setGenre} />
      </div>

      <div style={{ minHeight: 260, display: 'grid', placeItems: 'center', padding: '8px 0' }}>
        {pick ? (
          <div style={{ textAlign: 'center', opacity: spinning ? 0.6 : 1, transition: 'opacity .2s' }}>
            <div style={{ width: 170, margin: '0 auto' }}>
              <GameCover t={pick} big radius={18} />
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, marginTop: 14 }}>{pick.title}</div>
            <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>✍️ {pick.author} · 👁 {formatCount(pick.views)}</div>
            {!spinning && (
              <>
                <div style={{ marginTop: 10 }}>
                  <Badge accent>{tierLabel(pick)}</Badge>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: theme.text, margin: '12px auto 0', maxWidth: 320 }}>
                  {reasonFor(pick)}
                </p>
              </>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: theme.textMuted }}>
            <div style={{ fontSize: 52 }}>🎰</div>
            <div style={{ marginTop: 10 }}>버튼을 눌러 오늘의 웹툰을 뽑아보세요</div>
          </div>
        )}
      </div>

      <Button onClick={spin} loading={spinning} style={{ width: '100%' }}>
        {pick ? '다시 돌리기' : '돌리기'}
      </Button>
      {pick && !spinning && (
        <ShareResult message={`툰스펙트럼 룰렛이 오늘의 웹툰으로 「${pick.title}」를 골라줬어요! 🎰 (${pick.author}) 너의 추천은?`} />
      )}
    </div>
  );
}
