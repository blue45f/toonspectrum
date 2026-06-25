import { useEffect, useState } from 'react';

import { Button } from '../../tds-shim';
import { Badge } from '../../ui';
import { GameCover } from '../../games/GameCover';
import { GameHelp } from '../../games/GameHelp';
import { navigate } from '../../router';
import { theme, pageShell } from '../../theme';
import {
  answerOf,
  buildQuestion,
  isCorrect,
  ROUND_COUNT,
  type QuizQuestion,
} from '../../games/quiz-engine';
import { liveRng, useGameTitles } from '../../games/types';
import { ShareResult } from '../../games/ShareResult';

export function QuizGame() {
  const { titles, loading } = useGameTitles();
  const [q, setQ] = useState<QuizQuestion | null>(null);
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!loading && titles.length >= 2 && !q && !done) setQ(buildQuestion(titles, liveRng));
  }, [loading, titles, q, done]);

  function pick(id: string) {
    if (!q || picked) return;
    setPicked(id);
    const correct = isCorrect(q, id);
    if (correct) {
      setScore((s) => s + 1);
      setStreak((s) => {
        const n = s + 1;
        setBest((b) => Math.max(b, n));
        return n;
      });
    } else {
      setStreak(0);
    }
    setTimeout(() => {
      setPicked(null);
      if (round >= ROUND_COUNT) {
        setDone(true);
      } else {
        setRound((r) => r + 1);
        setQ(buildQuestion(titles, liveRng));
      }
    }, 1100);
  }

  function restart() {
    setRound(1);
    setScore(0);
    setStreak(0);
    setDone(false);
    setPicked(null);
    setQ(titles.length >= 2 ? buildQuestion(titles, liveRng) : null);
  }

  if (loading || (!q && !done)) {
    return <div style={{ ...pageShell, paddingTop: 80, textAlign: 'center', color: theme.textMuted }}>불러오는 중…</div>;
  }

  if (done) {
    return (
      <div style={{ ...pageShell, paddingTop: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 42 }}>🎉</div>
        <div style={{ fontSize: 22, fontWeight: 800, margin: '12px 0' }}>{ROUND_COUNT}문제 중 {score}개 정답!</div>
        <div style={{ color: theme.textMuted, marginBottom: 22 }}>최고 연속 정답 {best}</div>
        <Button onClick={restart}>다시 풀기</Button>
        <div style={{ maxWidth: 280, margin: '0 auto' }}>
          <ShareResult message={`툰스펙트럼 웹툰 퀴즈 ${ROUND_COUNT}문제 중 ${score}개 정답! 🧠 (최고 연속 ${best}) 너의 점수는?`} />
        </div>
      </div>
    );
  }

  const ans = q ? answerOf(q) : undefined;

  return (
    <div style={pageShell}>
      <button type="button" className="pressable" onClick={() => navigate('/play')} style={{ background: 'none', border: 'none', color: theme.textMuted, padding: '14px 0', cursor: 'pointer' }}>
        ← 놀이터
      </button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: theme.textMuted }}>
          {round} / {ROUND_COUNT}
          <GameHelp
            id="quiz"
            title="웹툰 퀴즈"
            steps={[
              {
                emoji: '🎯',
                title: '목표',
                desc: (
                  <>
                    흐릿하게 가려진 <b style={{ color: theme.text }}>표지</b>와 단서를 보고 그 웹툰의{' '}
                    <b style={{ color: theme.text }}>제목</b>을 맞혀요.
                  </>
                ),
              },
              {
                emoji: '🃏',
                title: '단서',
                desc: (
                  <>
                    표지 옆에 <b style={{ color: theme.text }}>작가</b>와{' '}
                    <b style={{ color: theme.text }}>장르</b>(최대 3개)가 힌트로 주어져요.
                  </>
                ),
              },
              {
                emoji: '🔘',
                title: '정답 고르기',
                desc: (
                  <>
                    <b style={{ color: theme.text }}>4개 보기</b> 중 하나를 누르면 바로 채점돼요. 정답은{' '}
                    <span style={{ color: '#4ade80', fontWeight: 700 }}>초록</span>, 틀린 선택은{' '}
                    <span style={{ color: theme.danger, fontWeight: 700 }}>빨강</span>으로 표시돼요.
                  </>
                ),
              },
              {
                emoji: '🔥',
                title: '점수와 연속',
                desc: (
                  <>
                    맞힐 때마다 <b style={{ color: theme.text }}>1점</b>, 연속으로 맞히면{' '}
                    <b style={{ color: theme.text }}>연속 기록</b>이 쌓여요(틀리면 0으로 초기화).
                  </>
                ),
              },
              {
                emoji: '🏁',
                title: '한 판',
                desc: (
                  <>
                    총 <b style={{ color: theme.text }}>{ROUND_COUNT}문제</b>를 풀면 최종 점수와 최고 연속 기록을 보여줘요.
                  </>
                ),
              },
            ]}
          />
        </span>
        <span style={{ color: theme.accent }}>점수 {score} · 연속 {streak}</span>
      </div>

      {/* 힌트 카드 — 표지를 블러 처리(시각적이되 제목 노출 방지) + 작가/장르 단서 */}
      {ans && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 14, borderRadius: 16, background: theme.surface, border: `1px solid ${theme.border}` }}>
          <div style={{ width: 84, flexShrink: 0 }}>
            <GameCover t={ans} mode="mystery" radius={12} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>이 작품의 제목은?</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>✍️ {ans.author}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {ans.genres.slice(0, 3).map((g) => (
                <Badge key={g}>{g}</Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        {q?.choices.map((c) => {
          const isAns = c.id === q.answerId;
          const show = picked !== null;
          const bg = show && isAns ? 'rgba(74,222,128,0.18)' : show && c.id === picked ? 'rgba(255,107,107,0.18)' : theme.surface;
          const bd = show && isAns ? '#4ade80' : show && c.id === picked ? theme.danger : theme.border;
          return (
            <button
              key={c.id}
              type="button"
              className="pressable"
              disabled={show}
              onClick={() => pick(c.id)}
              style={{ padding: '14px 16px', borderRadius: 14, border: `1px solid ${bd}`, background: bg, color: theme.text, fontSize: 15, fontWeight: 600, textAlign: 'left', cursor: show ? 'default' : 'pointer' }}
            >
              {c.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}
