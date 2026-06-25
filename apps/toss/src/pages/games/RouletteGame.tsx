import { useEffect, useRef, useState } from 'react';

import { Button } from '../../tds-shim';
import { Badge, Chips } from '../../ui';
import { GameCover } from '../../games/GameCover';
import { navigate } from '../../router';
import { theme, pageShell } from '../../theme';
import { genreChips, pickRandom, reasonFor, tierLabel } from '../../games/roulette-engine';
import { formatCount, liveRng, useGameTitles, type GameTitle } from '../../games/types';

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
    </div>
  );
}
