import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { Eraser, Grid3x3, Pencil, Redo2, Trash2, Undo2 } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { clamp, INK, MAX_POINTS, MAX_STROKES, PAPER, pointPath, type Point, type Stroke } from "./creative-core";

const COLORS = [
  ["잉크", INK], ["테라코타", "#ba6048"], ["머스터드", "#c29539"],
  ["포레스트", "#457b63"], ["오션", "#4a7d9b"], ["라벤더", "#876893"],
] as const;
export function StrokePaths({ strokes }: { strokes: Stroke[] }) {
  return <>{strokes.map((stroke, index) => stroke.points.length === 1
    ? <circle key={index} cx={stroke.points[0].x * 960} cy={stroke.points[0].y * 600} r={stroke.size / 2} fill={stroke.erase ? PAPER : stroke.color} />
    : <path key={index} d={pointPath(stroke.points)} fill="none" stroke={stroke.erase ? PAPER : stroke.color} strokeWidth={stroke.size} strokeLinecap="round" strokeLinejoin="round" />)}</>;
}
export function SketchPad({ strokes, onChange, guide, label = "드로잉 캔버스", disabled = false }: {
  strokes: Stroke[]; onChange: (strokes: Stroke[]) => void; guide?: ReactNode; label?: string; disabled?: boolean;
}) {
  const gridId = useId(); const helpId = useId();
  const [color, setColor] = useState<string>(INK); const [size, setSize] = useState(6);
  const [erase, setErase] = useState(false); const [grid, setGrid] = useState(false);
  const [undone, setUndone] = useState<Stroke[]>([]); const [live, setLive] = useState<Stroke | null>(null);
  const [cursor, setCursor] = useState<Point>({ x: .5, y: .5 }); const [keyboard, setKeyboard] = useState(false);
  const [hint, setHint] = useState("");
  const active = useRef<{ pointer: number; stroke: Stroke } | null>(null);
  const pointCount = strokes.reduce((total, stroke) => total + stroke.points.length, 0);
  const available = !disabled && strokes.length < MAX_STROKES && pointCount < MAX_POINTS;
  const position = (event: PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  };
  const begin = (point: Point, pointer: number) => {
    if (!available || active.current) { if (!available) setHint("캔버스 한도에 도달했습니다. 결과를 저장한 뒤 새로 시작해 주세요."); return; }
    const stroke = { points: [point], color, size, erase };
    active.current = { pointer, stroke }; setLive(stroke); setHint("");
  };
  const append = (point: Point) => {
    const current = active.current;
    if (!current) return;
    if (pointCount + current.stroke.points.length >= MAX_POINTS) { setHint("점 개수 한도에 도달했습니다. 선을 확정한 뒤 파일로 저장해 주세요."); return; }
    const last = current.stroke.points[current.stroke.points.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) < .001) return;
    current.stroke = { ...current.stroke, points: [...current.stroke.points, point] };
    setLive(current.stroke);
  };
  const finish = () => {
    const current = active.current;
    if (!current) return;
    active.current = null; setLive(null); setUndone([]);
    onChange([...strokes, current.stroke]);
  };
  const cancel = () => { active.current = null; setLive(null); };
  const key = (event: KeyboardEvent<SVGSVGElement>) => {
    if (disabled) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Enter", "Escape"].includes(event.key)) event.preventDefault();
    setKeyboard(true);
    if (event.key.startsWith("Arrow")) {
      const step = event.shiftKey ? .005 : .02;
      const next = { x: clamp(cursor.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), 0, 1), y: clamp(cursor.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0), 0, 1) };
      setCursor(next); if (active.current?.pointer === -1) append(next);
    } else if (event.key === " " && !event.repeat) {
      if (active.current?.pointer === -1) finish(); else begin(cursor, -1);
    } else if (event.key === "Enter") finish();
    else if (event.key === "Escape") cancel();
  };
  return <div className="play-sketch-pad">
    <div className="play-sketch-toolbar" aria-label={translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "드로잉 도구")}>
      <div className="play-actions">
        <button type="button" className="play-icon-button" aria-label={translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "펜")} title={translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "펜")} aria-pressed={!erase} onClick={() => setErase(false)}><Pencil size={17} /></button>
        <button type="button" className="play-icon-button" aria-label={translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "지우개")} title={translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "지우개")} aria-pressed={erase} onClick={() => setErase(true)}><Eraser size={17} /></button>
        <span className="play-toolbar-separator" />
        {COLORS.map(([name, hex]) => <button key={hex} className="play-swatch-button" type="button" style={{ background: hex }} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "{v0} 색상"), { v0: String(name) })} title={name} aria-pressed={color === hex && !erase} onClick={() => { setColor(hex); setErase(false); }} />)}
      </div>
      <div className="play-actions">
        <label className="play-size">{translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "굵기 ")}<input type="range" min="2" max="24" step="1" value={size} onChange={(event) => setSize(Number(event.target.value))} /><output>{size}</output></label>
        <button type="button" className="play-icon-button" aria-label={translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "실행 취소")} title={translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "실행 취소")} disabled={!strokes.length || disabled} onClick={() => { setUndone([...undone, strokes[strokes.length - 1]]); onChange(strokes.slice(0, -1)); }}><Undo2 size={17} /></button>
        <button type="button" className="play-icon-button" aria-label={translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "다시 실행")} title={translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "다시 실행")} disabled={!undone.length || disabled} onClick={() => { onChange([...strokes, undone[undone.length - 1]]); setUndone(undone.slice(0, -1)); }}><Redo2 size={17} /></button>
        <button type="button" className="play-icon-button" aria-label={translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "격자 표시")} title={translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "격자 표시")} aria-pressed={grid} onClick={() => setGrid(!grid)}><Grid3x3 size={17} /></button>
        <button type="button" className="play-icon-button" aria-label={translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "캔버스 비우기")} title={translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "캔버스 비우기")} disabled={!strokes.length || disabled} onClick={() => { if (window.confirm("현재 캔버스의 그림을 지울까요? 중요한 그림은 먼저 파일로 저장해 주세요.")) { setUndone([]); onChange([]); } }}><Trash2 size={17} /></button>
      </div>
    </div>
    <svg className="play-sketch-surface" viewBox="0 0 960 600" role="application" aria-roledescription={translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "키보드 지원 드로잉 캔버스")} aria-label={label} aria-describedby={helpId} aria-disabled={disabled} tabIndex={0}
      onKeyDown={key} onBlur={() => { if (active.current?.pointer === -1) finish(); setKeyboard(false); }}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0 || disabled) return;
        event.preventDefault(); event.currentTarget.focus(); setKeyboard(false);
        begin(position(event), event.pointerId);
        if (active.current?.pointer === event.pointerId) event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => { if (active.current?.pointer === event.pointerId) append(position(event)); }}
      onPointerUp={(event) => { if (active.current?.pointer !== event.pointerId) return; append(position(event)); finish(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={cancel} onLostPointerCapture={() => { if (active.current && active.current.pointer !== -1) cancel(); }}>
      <defs><pattern id={gridId} width="48" height="48" patternUnits="userSpaceOnUse"><path d="M 48 0 L 0 0 0 48" fill="none" stroke="#b1a89a" strokeWidth="1" /></pattern></defs>
      <rect width="960" height="600" fill={PAPER} />
      {grid && <rect width="960" height="600" fill={formatI18nTemplate(translateCurrentStaticSourceText("domains.play.lab.SketchPad", "en", "url(#{v0})"), { v0: String(gridId) })} opacity=".4" />}
      {guide}
      <StrokePaths strokes={strokes} />
      {live && <StrokePaths strokes={[live]} />}
      {keyboard && <g stroke={INK} strokeWidth="1.5" fill="none"><circle cx={cursor.x * 960} cy={cursor.y * 600} r="9" /><path d={`M ${cursor.x * 960 - 15} ${cursor.y * 600} h 30 M ${cursor.x * 960} ${cursor.y * 600 - 15} v 30`} /></g>}
    </svg>
    <p id={helpId} className="play-note">{translateCurrentStaticSourceText("domains.play.lab.SketchPad", "ko", "마우스·펜·터치 지원. 키보드: 방향키 이동 · Space 펜 내리기/들기 · Enter 선 확정 · Esc 취소. 격자·가이드는 결과 파일에 포함되지 않습니다.")}</p>
    <p className="play-note" role="status">{hint}</p>
  </div>;
}
