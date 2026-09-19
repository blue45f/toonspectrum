import { useEffect, useMemo, useRef, useState } from "react";

import { planStudioNativeBrushDocument } from "./studio-native-brush-document-contract";
import { renderStudioNativeBrushDocument } from "./studio-native-brush-document-product";

import type { El } from "../studio-element-model";
import type { StudioNativeBrushDocumentPrepare } from "./studio-native-brush-document-commit";
import type { NativeBrushProbeEngine, NativeBrushProbeStyle } from "./studio-native-brush-probe-contract";

export interface StudioNativeBrushDocumentInspectorProps {
  readonly selected: El | null;
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly pageId: string;
  readonly masterEditMode: boolean;
  readonly disabled: boolean;
  readonly onPrepare?: StudioNativeBrushDocumentPrepare;
}
const CONTROL = "min-h-11 rounded-lg border border-line bg-card px-3 text-sm text-fg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
export default function StudioNativeBrushDocumentInspector(props: StudioNativeBrushDocumentInspectorProps) {
  const { selected, documentWidth, documentHeight, pageId, masterEditMode, disabled, onPrepare } = props;
  const [engine, setEngine] = useState<NativeBrushProbeEngine>("libmypaint");
  const [style, setStyle] = useState<NativeBrushProbeStyle>("ink");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const active = useRef<AbortController | null>(null);
  const prepared = useMemo(() => {
    try { return { plan: planStudioNativeBrushDocument(selected, { engine, style, documentWidth, documentHeight }), error: null }; }
    catch (error) { return { plan: null, error: error instanceof Error ? error.message : String(error) }; }
  }, [selected, engine, style, documentWidth, documentHeight]);
  useEffect(() => {
    active.current?.abort(); active.current = null; setBusy(false); setStatus("");
    return () => { active.current?.abort(); active.current = null; };
  }, [selected, pageId, masterEditMode, disabled, engine, style, documentWidth, documentHeight]);
  function cancel() {
    active.current?.abort(); active.current = null; setBusy(false);
    setStatus("변환을 취소했습니다. 원본은 변경되지 않았습니다.");
  }
  async function convert() {
    const plan = prepared.plan;
    if (!plan || disabled || masterEditMode || busy || !onPrepare || active.current) return;
    const commit = onPrepare({ pageId, masterEditMode, sourceElementId: plan.sourceElementId, sourceRevision: plan.sourceRevision });
    if (!commit) { setStatus("현재 문서 상태에서는 변환을 시작할 수 없습니다."); return; }
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setStatus(`${engine} 엔진으로 선택 획을 변환하고 있습니다.`);
    try {
      const result = await renderStudioNativeBrushDocument(plan, controller.signal);
      if (controller.signal.aborted || active.current !== controller) return;
      if (!commit(result)) throw new Error("문서·원본·실행 취소 이력이 변경되어 결과를 적용하지 않았습니다.");
      setStatus(`${engine} 변환 완료. 원본은 숨김 보존되며 실행 취소로 되돌릴 수 있습니다.`);
    } catch (error) {
      if (!controller.signal.aborted && active.current === controller) setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }
  if (!onPrepare) return null;
  return <details className="rounded-lg border border-line p-3" onToggle={(event) => { if (!event.currentTarget.open && active.current) cancel(); }}>
    <summary className="min-h-11 cursor-pointer text-sm font-semibold text-fg">선택 획 · 네이티브 엔진 변환</summary>
    <section aria-label="선택 획 네이티브 엔진 변환" className="space-y-3 pt-2">
      <p className="text-xs leading-relaxed text-fg-3">완성된 획의 중심선·필압을 선택한 엔진으로 다시 그립니다. 기존 브러시 질감을 복제하는 기능은 아니며, 성공한 PNG만 문서에 추가하고 원본은 숨김 보존합니다.</p>
      <div className="flex flex-wrap gap-2">
        <select aria-label="문서 변환 엔진" className={CONTROL} value={engine} disabled={busy} onChange={(event) => setEngine(event.target.value as NativeBrushProbeEngine)}>
          <option value="libmypaint">libmypaint · 자연매체</option><option value="canvaskit">CanvasKit · WebGL2</option><option value="vello">Vello · WebGPU</option>
        </select>
        <select aria-label="문서 변환 재질" className={CONTROL} value={style} disabled={busy || engine !== "libmypaint"} onChange={(event) => setStyle(event.target.value as NativeBrushProbeStyle)}>
          <option value="ink">잉크</option><option value="wash">워시</option><option value="chalk">초크</option>
        </select>
      </div>
      <p className="text-xs text-fg-3">원본 크기 그대로 변환합니다. 굵기 1–128px, 입력 8,192점, 획 영역 2048×2048 이내를 지원하며 초과하면 축소하지 않고 중단합니다.</p>
      {prepared.error && <p className="text-xs text-warn">{prepared.error}</p>}
      {prepared.plan?.warnings.map((message) => <p key={message} className="text-xs text-warn">{message}</p>)}
      {(disabled || masterEditMode) && <p className="text-xs text-warn">일반 페이지에서 문서·선택 레이어 잠금을 해제한 뒤 변환하세요.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={CONTROL} disabled={!prepared.plan || disabled || masterEditMode || busy} onClick={() => { void convert(); }}>선택 획 변환</button>
        {busy && <button type="button" className={CONTROL} onClick={cancel}>변환 취소</button>}
      </div>
      <p role="status" className="text-xs leading-relaxed text-fg-2">{status}</p>
    </section>
  </details>;
}
