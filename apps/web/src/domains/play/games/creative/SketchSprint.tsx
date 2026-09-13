import { Pause, Play, Shuffle, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { drawingSvg, freshSeed, promptFor, safeSeed, validStrokes, type Stroke } from "../../lab/creative-core";
import { DraftNotice, ExportDrawing, StudioBridge } from "../../lab/LabShared";
import { recordResult, usePlayDraft } from "../../lab/play-storage";
import { SketchPad } from "../../lab/SketchPad";
import type { PlayGameProps } from "../../play-types";

type Draft = { strokes: Stroke[]; offset: number };
const validDraft = (v: unknown): v is Draft => !!v && typeof v === "object" && validStrokes((v as Draft).strokes) && Number.isInteger((v as Draft).offset) && (v as Draft).offset >= 0 && (v as Draft).offset < 100000;
export default function SketchSprint({ seed }: PlayGameProps) {
  const { value: draft, setValue, saved } = usePlayDraft<Draft>(`sprint-${safeSeed(seed)}`, () => ({ strokes: [], offset: 0 }), validDraft);
  const [duration, setDuration] = useState(60); const [remaining, setRemaining] = useState(60);
  const [running, setRunning] = useState(false); const [message, setMessage] = useState("");
  const [runId, setRunId] = useState(freshSeed); const [recorded, setRecorded] = useState(false);
  const deadline = useRef(0);
  const [title, constraint, tip] = promptFor(safeSeed(seed), draft.offset);
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) { setRunning(false); setMessage("시간이 끝났습니다. 그림은 유지되며 계속 다듬거나 연습을 완료할 수 있어요."); }
    };
    const interval = window.setInterval(tick, 200);
    const visibility = () => { if (document.hidden) { tick(); setRunning(false); setMessage("다른 화면으로 이동해 타이머를 일시 정지했습니다."); } };
    document.addEventListener("visibilitychange", visibility);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", visibility); };
  }, [running]);
  const changeDrawing = (strokes: Stroke[]) => {
    setValue({ ...draft, strokes });
    if (recorded) { setRecorded(false); setRunId(freshSeed()); }
  };
  return <div className="play-lab-content">
    <div className="play-exercise-heading">
      <div><span className="play-eyebrow">DRAWING SPRINT · ORIGINAL PROMPT</span><h2>{title}</h2><p>{constraint}</p></div>
      <button type="button" className="play-button" onClick={() => { setValue({ ...draft, offset: (draft.offset + 1) % 100000 }); setRunId(freshSeed()); setRecorded(false); setMessage("새 주제를 골랐습니다. 그리던 그림은 그대로 유지됩니다."); }}><Shuffle size={16} />다른 주제</button>
    </div>
    <div className="play-timer-strip">
      <div className="play-actions" aria-label="연습 시간 선택">{[30, 60, 120, 0].map((seconds) => <button className="play-chip" type="button" key={seconds} aria-pressed={duration === seconds} disabled={running} onClick={() => { setDuration(seconds); setRemaining(seconds); setMessage(""); }}>{seconds ? `${seconds}초` : "자유 연습"}</button>)}</div>
      <div className="play-actions">
        <span className="play-timer" role="timer" aria-label={`남은 시간 ${remaining}초`}>{duration ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}` : "∞"}</span>
        {duration > 0 && <button className="play-button primary" type="button" onClick={() => {
          if (running) { setRemaining(Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000))); setRunning(false); }
          else { const seconds = remaining || duration; setRemaining(seconds); deadline.current = performance.now() + seconds * 1000; setRunning(true); setMessage(""); }
        }}>{running ? <Pause size={16} /> : <Play size={16} />}{running ? "일시 정지" : remaining === 0 ? "타이머 다시 시작" : "타이머 시작"}</button>}
      </div>
    </div>
    <SketchPad strokes={draft.strokes} onChange={changeDrawing} />
    <div className="play-tip"><strong>오늘의 관찰 포인트</strong><p>{tip}</p></div>
    <div className="play-result-actions"><ExportDrawing svg={drawingSvg(draft.strokes, title)} name="toonstudio-sketch" disabled={!draft.strokes.length} />
      <button type="button" className="play-button" disabled={!draft.strokes.some((s) => !s.erase) || recorded} onClick={() => {
        setRunning(false); setRecorded(true);
        setMessage(recordResult({ id: runId, game: "sketch-sprint", label: title }) ? "연습 완료! 내 창작 기록에 남겼습니다." : "연습을 완료했습니다. 기록 저장은 차단되어 있으니 그림을 파일로 보관해 주세요.");
      }}><Trophy size={16} />{recorded ? "연습 완료됨" : "연습 완료"}</button>
    </div>
    <p className="play-feedback" role="status">{message}</p><DraftNotice saved={saved} /><StudioBridge />
  </div>;
}
