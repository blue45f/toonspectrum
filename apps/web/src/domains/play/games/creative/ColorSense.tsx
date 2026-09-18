import { useState } from "react";

import { colorScore, colorTarget, freshSeed, hslHex, safeSeed, type Hsl } from "../../lab/creative-core";
import { recordResult } from "../../lab/play-storage";
import type { PlayGameProps } from "../../play-types";

const INITIAL: Hsl = { h: 180, s: 50, l: 50 };
export default function ColorSense({ seed }: PlayGameProps) {
  const [round, setRound] = useState(0); const [session, setSession] = useState(safeSeed(seed));
  const [guess, setGuess] = useState<Hsl>(INITIAL); const [scores, setScores] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false); const [message, setMessage] = useState("");
  const [runId, setRunId] = useState(freshSeed);
  const target = colorTarget(`${session}-${round}`); const done = scores.length === 5;
  const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const grade = () => {
    if (revealed || done) return;
    const score = colorScore(target, guess); const next = [...scores, score];
    setScores(next); setRevealed(true);
    if (next.length === 5) {
      const result = Math.round(next.reduce((a, b) => a + b, 0) / next.length);
      setMessage(recordResult({ id: runId, game: "color-sense", label: "색감 훈련 5라운드", score: result }) ? "5라운드를 마쳤습니다. 결과를 내 창작 기록에 남겼어요." : "훈련은 완료했지만 브라우저 기록 저장이 차단되었습니다.");
    }
  };
  return <div className="play-lab-content">
    <div className="play-exercise-heading"><div><span className="play-eyebrow">COLOR SENSE · LOOK CLOSER</span><h2>눈으로 보고, 색으로 답하기.</h2><p>왼쪽 색을 관찰한 뒤 색상·채도·명도로 가까운 색을 만들어 보세요.</p></div><span className="play-round">{Math.min(round + 1, 5)}<small> / 5 ROUND</small></span></div>
    <div className="play-color-comparison">
      <div className="play-color-sample" style={{ background: hslHex(target) }} role="img" aria-label={revealed ? `목표 색 ${hslHex(target)}` : "맞혀 볼 목표 색"}><span>목표 색 {revealed && <code>{hslHex(target)}</code>}</span></div>
      <div className="play-color-sample" style={{ background: hslHex(guess) }} role="img" aria-label={`내가 만든 색 ${hslHex(guess)}`}><span>내가 만든 색 <code>{hslHex(guess)}</code></span></div>
    </div>
    <div className="play-color-controls">{([{ key: "h", name: "색상", max: 359, unit: "°" }, { key: "s", name: "채도", max: 100, unit: "%" }, { key: "l", name: "명도", max: 100, unit: "%" }] as const).map(({ key, name, max, unit }) => <label className="play-color-slider" key={key}><span>{name}</span><input type="range" min="0" max={max} value={guess[key]} disabled={revealed} onChange={(event) => setGuess({ ...guess, [key]: Number(event.target.value) })} /><output>{guess[key]}{unit}</output></label>)}</div>
    <div className="play-result-actions"><button type="button" className="play-button primary" disabled={revealed} onClick={grade}>색 비교하기</button>
      {revealed && !done && <button type="button" className="play-button" onClick={() => { setRound(round + 1); setGuess(INITIAL); setRevealed(false); }}>다음 색 도전 →</button>}
      {done && <button type="button" className="play-button" onClick={() => { setRound(0); setScores([]); setGuess(INITIAL); setRevealed(false); setSession(freshSeed()); setRunId(freshSeed()); setMessage(""); }}>새로운 5라운드</button>}
    </div>
    {revealed && <section className="play-score-card" aria-label="색감 연습 결과"><span className="play-score">{done ? average : scores[scores.length - 1]}<small>/100</small></span><div><h3>{done ? "다섯 가지 색을 관찰했어요." : "작은 차이를 발견하는 연습"}</h3><p>목표: 색상 {target.h}° · 채도 {target.s}% · 명도 {target.l}%</p><p>{done ? `평균 ${average}점 · ` : ""}각 라운드 {scores.join(" · ")}</p></div></section>}
    <p className="play-note">sRGB 색상 거리로 계산하는 참고용 연습 점수입니다. 디스플레이·주변 조명에 따라 색이 달라 보일 수 있습니다. 시간 제한 없이 슬라이더의 방향키 조작으로도 참여할 수 있습니다.</p>
    <p className="play-feedback" role="status">{message}</p>
  </div>;
}
