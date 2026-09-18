import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useState } from "react";

import { drawingSvg, freshSeed, LINE_GUIDES, pointPath, traceScore, validStrokes, type Stroke } from "../../lab/creative-core";
import { DraftNotice, ExportDrawing } from "../../lab/LabShared";
import { recordResult, usePlayDraft } from "../../lab/play-storage";
import { SketchPad } from "../../lab/SketchPad";

type Draft = { guide: number; strokes: Stroke[] };
const validDraft = (value: unknown): value is Draft => !!value && typeof value === "object" && Number.isInteger((value as Draft).guide) && (value as Draft).guide >= 0 && (value as Draft).guide < LINE_GUIDES.length && validStrokes((value as Draft).strokes);
export default function LineDojo() {
  const { value, setValue, saved } = usePlayDraft<Draft>("line-dojo", () => ({ guide: 0, strokes: [] }), validDraft);
  const [showGuide, setShowGuide] = useState(true); const [score, setScore] = useState<number | null>(null);
  const [message, setMessage] = useState(""); const [runId, setRunId] = useState(freshSeed);
  const guide = LINE_GUIDES[value.guide];
  return <div className="play-lab-content">
    <div className="play-exercise-heading"><div><span className="play-eyebrow">{translateCurrentStaticSourceText("domains.play.games.creative.LineDojo", "en", "LINE DOJO · HAND & EYE")}</span><h2>{translateCurrentStaticSourceText("domains.play.games.creative.LineDojo", "ko", "좋은 선은, 짧은 연습에서.")}</h2><p>{translateCurrentStaticSourceText("domains.play.games.creative.LineDojo", "ko", "가이드를 따라 그리며 선의 흐름과 형태를 익혀 보세요. 시간 제한은 없습니다.")}</p></div></div>
    <div className="play-actions" aria-label={translateCurrentStaticSourceText("domains.play.games.creative.LineDojo", "ko", "선 연습 선택")}>{LINE_GUIDES.map((item, index) => <button className="play-chip" type="button" key={item.name} aria-pressed={value.guide === index} onClick={() => {
      if (value.guide === index) return;
      if (value.strokes.length && !window.confirm("다른 가이드로 바꾸면 현재 연습 선이 지워집니다. 먼저 저장하셨나요?")) return;
      setValue({ guide: index, strokes: [] }); setScore(null); setMessage(""); setRunId(freshSeed());
    }}>{String(index + 1).padStart(2, "0")} {item.name}</button>)}</div>
    <label className="play-check"><input type="checkbox" checked={showGuide} onChange={(event) => setShowGuide(event.target.checked)} />{translateCurrentStaticSourceText("domains.play.games.creative.LineDojo", "ko", "가이드 표시")}</label>
    <SketchPad key={value.guide} label={translateCurrentStaticSourceText("domains.play.games.creative.LineDojo", "ko", "선 긋기 연습 캔버스")} strokes={value.strokes} onChange={(strokes) => { setValue({ ...value, strokes }); setScore(null); setRunId(freshSeed()); }} guide={showGuide ? <path d={pointPath(guide.points)} fill="none" stroke="#aa9f90" strokeWidth="7" strokeDasharray="12 10" strokeLinecap="round" /> : undefined} />
    <div className="play-tip"><strong>{guide.name}</strong><p>{guide.tip}</p></div>
    <div className="play-result-actions"><button type="button" className="play-button primary" disabled={!value.strokes.some((s) => !s.erase) || score !== null} onClick={() => {
      if (value.strokes.some((s) => s.erase)) { setMessage("정확한 비교를 위해 지우개 선은 실행 취소로 제거하거나 캔버스를 비운 뒤 다시 그려 주세요."); return; }
      const result = traceScore(value.strokes, guide.points); setScore(result);
      setMessage(recordResult({ id: runId, game: "line-dojo", label: guide.name, score: result }) ? "연습 결과를 내 기록에 저장했습니다." : "연습 결과를 저장할 수 없습니다. 파일로 보관해 주세요.");
    }}>{translateCurrentStaticSourceText("domains.play.games.creative.LineDojo", "ko", "선의 흐름 확인")}</button><ExportDrawing svg={drawingSvg(value.strokes, guide.name)} name="toonstudio-line-practice" disabled={!value.strokes.length} /></div>
    {score !== null && <section className="play-score-card" aria-label={translateCurrentStaticSourceText("domains.play.games.creative.LineDojo", "ko", "선 연습 결과")}><span className="play-score">{score}<small>/100</small></span><div><h3>{score >= 85 ? translateCurrentStaticSourceText("domains.play.games.creative.LineDojo", "ko", "형태와 흐름이 잘 이어졌어요.") : score >= 55 ? translateCurrentStaticSourceText("domains.play.games.creative.LineDojo", "ko", "큰 흐름이 보이기 시작했어요.") : translateCurrentStaticSourceText("domains.play.games.creative.LineDojo", "ko", "속도를 낮추고 큰 형태부터 잡아 보세요.")}</h3><p>{translateCurrentStaticSourceText("domains.play.games.creative.LineDojo", "ko", "기준선과의 거리·덮은 범위를 비교한 연습용 점수입니다. 그림의 미적 완성도를 평가하지 않습니다.")}</p></div></section>}
    <p className="play-note" role="status">{message}</p><DraftNotice saved={saved} />
  </div>;
}
