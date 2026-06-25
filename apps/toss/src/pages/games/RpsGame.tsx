// 웹툰 가위바위보 / 묵찌빠 — 버튼 모드 전용(웹캠 제스처 X).
// 라운드 판정·점수·결정적 AI·묵찌빠 전이는 @toonspectrum/play-core(rps-engine, 순수)를 그대로 공유한다.
// 이 파일은 토스 렌더 레이어만 담당(인라인 스타일 + tds-shim). 로직 중복 금지.

import { useState } from 'react';

import { Button } from '../../tds-shim';
import { navigate } from '../../router';
import { theme, pageShell } from '../../theme';
import {
  EMPTY_SCORE,
  HAND_EMOJI,
  HAND_LABEL,
  MUK_LABEL,
  matchOver,
  mukjjippaStep,
  pickAiHand,
  resolveRound,
  scoreReducer,
  type Hand,
  type Initiative,
  type Outcome,
  type Score,
} from '@toonspectrum/play-core';
import { GameHelp } from '../../games/GameHelp';
import { liveRng } from '../../games/types';
import { ShareResult } from '../../games/ShareResult';

type Mode = 'rps' | 'mukjjippa';
const HANDS: Hand[] = ['rock', 'scissors', 'paper'];
const OUTCOME_LABEL: Record<Outcome, string> = { win: '이겼어요!', lose: '졌어요…', draw: '비겼어요' };
const OUTCOME_COLOR: Record<Outcome, string> = { win: '#4ade80', lose: theme.danger, draw: theme.textMuted };

interface RoundView {
  player: Hand;
  ai: Hand;
  outcome: Outcome;
}

export function RpsGame() {
  const [mode, setMode] = useState<Mode>('rps');
  const [score, setScore] = useState<Score>(EMPTY_SCORE);
  const [history, setHistory] = useState<Hand[]>([]);
  const [last, setLast] = useState<RoundView | null>(null);
  // 묵찌빠 — 선(공격권) 보유자. null이면 가위바위보로 선 정하는 단계.
  const [initiative, setInitiative] = useState<Initiative>(null);
  const [matchWinner, setMatchWinner] = useState<'player' | 'ai' | null>(null);

  function reset(next: Mode = mode) {
    setMode(next);
    setScore(EMPTY_SCORE);
    setHistory([]);
    setLast(null);
    setInitiative(null);
    setMatchWinner(null);
  }

  function play(player: Hand) {
    if (matchWinner) return;
    const ai = pickAiHand(liveRng, history, true);
    const outcome = resolveRound(player, ai);
    setLast({ player, ai, outcome });
    setHistory((h) => [...h, player].slice(-12));

    if (mode === 'rps') {
      const nextScore = scoreReducer(score, outcome);
      setScore(nextScore);
      const winner = matchOver(nextScore, 3);
      if (winner) setMatchWinner(winner);
      return;
    }

    // 묵찌빠 — 순수 전이로 선/매치 승자 갱신.
    const step = mukjjippaStep(initiative, player, ai);
    setInitiative(step.initiative);
    if (step.matchWinner) setMatchWinner(step.matchWinner);
  }

  const winnerLabel =
    matchWinner === 'player' ? '🎉 최종 승리!' : matchWinner === 'ai' ? '💀 최종 패배' : null;
  const decideStage = mode === 'mukjjippa' && initiative === null;
  const phaseHint = decideStage
    ? '먼저 가위바위보로 선(공격권)을 정해요'
    : initiative === 'player'
      ? '내가 선 — 같은 걸 내게 하면 승리!'
      : initiative === 'ai'
        ? '상대가 선 — 같은 걸 내면 위험해요'
        : '3선승 — 먼저 3번 이기면 승리';

  return (
    <div style={pageShell}>
      <button
        type="button"
        className="pressable"
        onClick={() => navigate('/play')}
        style={{ background: 'none', border: 'none', color: theme.textMuted, padding: '14px 0', cursor: 'pointer', fontSize: 14 }}
      >
        ← 놀이터
      </button>

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ padding: '6px 14px', borderRadius: 999, background: theme.accentSoft, color: theme.accent, fontWeight: 800, fontSize: 14 }}>
          {mode === 'rps' ? `${score.win} : ${score.lose}` : initiative === 'player' ? '내가 선' : initiative === 'ai' ? '상대 선' : '선 정하기'}
        </span>
        <GameHelp
          id="rps"
          title="웹툰 가위바위보"
          steps={[
            { emoji: '✊', title: '버튼 모드', desc: <>가위·바위·보 버튼을 눌러 웹툰봇과 대결해요. 카메라 없이 즐길 수 있어요.</> },
            { emoji: '🏆', title: '가위바위보', desc: <>먼저 <b style={{ color: theme.text }}>3번 이기면</b> 승리예요.</> },
            { emoji: '🔁', title: '묵찌빠', desc: <>먼저 선을 정한 뒤, <b style={{ color: theme.text }}>선 보유자와 같은 손</b>이 나오면 그 사람이 이겨요.</> },
          ]}
        />
      </div>

      {/* 모드 토글 */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
        {(['rps', 'mukjjippa'] as Mode[]).map((m) => {
          const on = mode === m;
          return (
            <button
              key={m}
              type="button"
              className="pressable"
              onClick={() => reset(m)}
              aria-pressed={on}
              style={{
                height: 34,
                padding: '0 16px',
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                border: on ? 'none' : `1px solid ${theme.border}`,
                background: on ? theme.accent : 'transparent',
                color: on ? theme.accentInk : theme.textMuted,
              }}
            >
              {m === 'rps' ? '가위바위보' : '묵찌빠'}
            </button>
          );
        })}
      </div>

      <p style={{ textAlign: 'center', fontSize: 13, color: theme.textMuted, margin: '0 0 16px' }}>{phaseHint}</p>

      {/* 대결 결과 표시 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, minHeight: 120 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 52 }}>{last ? HAND_EMOJI[last.player] : '🙋'}</div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>나</div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, color: theme.accent }}>VS</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 52 }}>{last ? HAND_EMOJI[last.ai] : '🤖'}</div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>웹툰봇</div>
        </div>
      </div>

      {last && !winnerLabel && (
        <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, color: OUTCOME_COLOR[last.outcome], margin: '4px 0 18px' }} aria-live="polite">
          {OUTCOME_LABEL[last.outcome]}
          {mode === 'mukjjippa' && last.outcome === 'draw' && initiative && ' · 같은 손!'}
        </div>
      )}

      {winnerLabel ? (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: matchWinner === 'player' ? '#4ade80' : theme.danger, marginBottom: 16 }}>
            {winnerLabel}
          </div>
          <Button onClick={() => reset()} style={{ width: '100%' }}>
            다시 도전
          </Button>
          <ShareResult
            message={`툰스펙트럼 웹툰 ${mode === 'rps' ? '가위바위보' : '묵찌빠'}에서 웹툰봇을 ${matchWinner === 'player' ? '이겼어요' : '아쉽게 졌어요'}! 너도 도전해봐`}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12 }}>
          {HANDS.map((hand) => (
            <Button key={hand} onClick={() => play(hand)} variant={hand === 'rock' ? undefined : 'weak'} style={{ flex: 1, flexDirection: 'column', height: 76, fontSize: 13 }}>
              <span style={{ fontSize: 26 }}>{HAND_EMOJI[hand]}</span>
              {mode === 'mukjjippa' ? MUK_LABEL[hand] : HAND_LABEL[hand]}
            </Button>
          ))}
        </div>
      )}

      <p style={{ fontSize: 11, lineHeight: 1.6, color: theme.textMuted, marginTop: 22 }}>
        버튼 모드 전용이에요. 손 인식(웹캠) 모드는 웹 버전에서 제공됩니다.
      </p>
    </div>
  );
}

export default RpsGame;
