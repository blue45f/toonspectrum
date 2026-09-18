import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { decimateStrokeHandles } from "./studio-node-edit";
import {
  commitStudioSmartShapeEdit,
  createStudioSmartShapePath,
  initialStudioSmartShapeKind,
  moveStudioSmartShapePoint,
  readStudioSmartShapeSnapshot,
  restoreStudioSmartShapeOriginal,
  STUDIO_SMART_SHAPE_EDIT_KINDS,
  studioSmartShapeBounds,
  transformStudioSmartShapePath,
  type StudioSmartShapeEditKind,
} from "./studio-smart-shape-edit";
import { useStudioModalSheet } from "./useStudioModalSheet";

import type { DrawEl } from "./studio-element-model";

const LABELS: Record<StudioSmartShapeEditKind, string> = {
  line: "직선", curve: "곡선", polyline: "꺾은선", rect: "사각형", ellipse: "타원", polygon: "다각형",
};
const CONTROL = "min-h-11 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

/** Draft-only review: opening, changing kind, moving points and cancelling never alter the document. */
export function StudioSmartShapeEditDialog({ source, onConfirm, onCancel }: {
  source: DrawEl;
  onConfirm: (stroke: DrawEl) => boolean;
  onCancel: () => void;
}) {
  const initialKind = initialStudioSmartShapeKind(source);
  const [kind, setKind] = useState(initialKind);
  const [points, setPoints] = useState(() => readStudioSmartShapeSnapshot(source)
    ? [...source.points] : createStudioSmartShapePath(source, initialKind));
  const [scale, setScale] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [showOriginal, setShowOriginal] = useState(false);
  const [snap, setSnap] = useState(false);
  const [activePoint, setActivePoint] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const rootRef = useRef<HTMLElement | null>(typeof document === "undefined" ? null : document.body);
  const titleId = useId();
  useStudioModalSheet({ activeKey: `smart-shape:${source.id}`, dialogRef, rootRef, onDismiss: onCancel });

  const original = readStudioSmartShapeSnapshot(source)?.original ?? source;
  const transformed = transformStudioSmartShapePath(points, scale / 100, rotation);
  const displayed = showOriginal ? original.points : transformed;
  const bounds = studioSmartShapeBounds([...original.points, ...displayed]);
  const margin = Math.max(16, source.strokeWidth * 2, Math.max(bounds.width, bounds.height) * 0.1);
  const handles = decimateStrokeHandles(points, { maxHandles: 16, minSpacingPx: 0.001 });
  const safeIndex = activePoint * 2 + 1 < points.length ? activePoint : 0;
  const submit = () => {
    const result = commitStudioSmartShapeEdit(source, kind, transformed);
    if (!result || !onConfirm(result)) setError("원고나 레이어가 바뀌어 적용하지 못했어요. 취소한 뒤 현재 스트로크를 다시 선택해 주세요.");
  };
  const changeKind = (next: StudioSmartShapeEditKind) => {
    setKind(next); setPoints(createStudioSmartShapePath(source, next));
    setScale(100); setRotation(0); setActivePoint(0); setShowOriginal(false);
  };
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/45 p-2 sm:p-4" data-studio-smart-shape-edit="true">
      <form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        data-studio-shortcut-boundary="true"
        className="max-h-[calc(100dvh-1rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-card p-4 shadow-2xl"
        onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="flex items-center justify-between gap-2">
          <h2 id={titleId} className="text-lg font-bold text-fg">현재 스트로크 교정</h2>
          <button type="button" aria-label="도형 편집 취소" className={CONTROL} onClick={onCancel}>닫기</button>
        </div>
        <p className="mt-2 text-sm text-fg-2">도형과 점을 다듬어 확정하세요. 확정한 뒤에도 캔버스의 점을 끌어 편집할 수 있어요.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="교정 도형 종류">
          {STUDIO_SMART_SHAPE_EDIT_KINDS.map((value) => <button key={value} type="button" className={CONTROL}
            aria-pressed={kind === value} onClick={() => changeKind(value)}>{LABELS[value]}</button>)}
        </div>
        <svg role="img" aria-label={showOriginal ? "원래 자유선 경로" : "교정 도형 경로"}
          className="mt-3 h-56 w-full rounded-xl border border-line bg-white"
          viewBox={`${bounds.left - margin} ${bounds.top - margin} ${bounds.width + margin * 2} ${bounds.height + margin * 2}`}>
          <polyline points={displayed.reduce((values: string[], point, index) => {
            if (index % 2 === 0) values.push(`${point},${displayed[index + 1]}`); return values;
          }, []).join(" ")} fill="none" stroke={source.stroke} strokeWidth={Math.max(1, source.strokeWidth)} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="mt-1 text-xs text-fg-3">경로 미리보기 · 브러시의 색상·필압·효과는 확정 후 원래 캔버스에서 유지됩니다.</p>
        <button type="button" className={`${CONTROL} mt-2 w-full`} aria-pressed={showOriginal} onClick={() => setShowOriginal(!showOriginal)}>
          {showOriginal ? "교정 결과 보기" : "원래 자유선과 비교"}
        </button>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs text-fg-2">크기 (%)<input className={`${CONTROL} mt-1 w-full`} type="number" min={5} max={1000} value={scale}
            onChange={(event) => setScale(Math.min(1000, Math.max(5, Number(event.target.value) || 100)))} /></label>
          <label className="text-xs text-fg-2">회전 (°)<input className={`${CONTROL} mt-1 w-full`} type="number" min={-360} max={360} step={snap ? 15 : 1} value={rotation}
            onChange={(event) => { const value = Number(event.target.value); setRotation(snap ? Math.round(value / 15) * 15 : value); }} /></label>
        </div>
        <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-fg"><input type="checkbox" checked={snap} onChange={(event) => setSnap(event.target.checked)} />15° 고정 각도로 점 이동·회전</label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <label className="text-xs text-fg-2">편집할 점<select className={`${CONTROL} mt-1 w-full`} value={safeIndex} onChange={(event) => setActivePoint(Number(event.target.value))}>
            {handles.map((handle, index) => <option key={handle.pointIndex} value={handle.pointIndex}>{index + 1}</option>)}
          </select></label>
          <label className="text-xs text-fg-2">점 X<input className={`${CONTROL} mt-1 w-full`} type="number" value={Math.round(points[safeIndex * 2]! * 100) / 100}
            onChange={(event) => setPoints(moveStudioSmartShapePoint(points, safeIndex, Number(event.target.value), points[safeIndex * 2 + 1]!, snap))} /></label>
          <label className="text-xs text-fg-2">점 Y<input className={`${CONTROL} mt-1 w-full`} type="number" value={Math.round(points[safeIndex * 2 + 1]! * 100) / 100}
            onChange={(event) => setPoints(moveStudioSmartShapePoint(points, safeIndex, points[safeIndex * 2]!, Number(event.target.value), snap))} /></label>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-bad">{error}</p> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {readStudioSmartShapeSnapshot(source) ? <button type="button" className={CONTROL} onClick={() => {
            const restored = restoreStudioSmartShapeOriginal(source);
            if (restored && !onConfirm(restored)) setError("원고가 바뀌어 원본을 복원하지 못했어요.");
          }}>원래 자유선 복원</button> : null}
          <button type="button" className={CONTROL} onClick={onCancel}>취소</button>
          <button type="submit" className={`${CONTROL} border-accent bg-accent text-on-accent`}>도형 확정</button>
        </div>
      </form>
    </div>, document.body,
  );
}
