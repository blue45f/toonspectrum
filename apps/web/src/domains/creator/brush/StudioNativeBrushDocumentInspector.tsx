import { useEffect, useMemo, useRef, useState } from "react";

import { planStudioNativeBrushDocument } from "./studio-native-brush-document-contract";
import { renderStudioNativeBrushDocument } from "./studio-native-brush-document-product";
import { StudioNativeBrushDocumentSession } from "./studio-native-brush-document-session";

import type { El } from "../studio-element-model";
import type { StudioNativeBrushDocumentResult } from "./studio-native-brush-document-contract";
import type { StudioNativeBrushDocumentCommit, StudioNativeBrushDocumentPrepare } from "./studio-native-brush-document-commit";
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
  const session = useRef<StudioNativeBrushDocumentSession | null>(null);
  const previewRef = useRef<{ result: StudioNativeBrushDocumentResult; commit: StudioNativeBrushDocumentCommit } | null>(null);
  const [preview, setPreview] = useState<StudioNativeBrushDocumentResult | null>(null);
  const [reuseEnabled, setReuseEnabled] = useState(true);
  const clearPreview = () => { previewRef.current = null; setPreview(null); };
  const releaseSession = () => { session.current?.dispose(); session.current = null; };
  const prepared = useMemo(() => {
    try { return { plan: planStudioNativeBrushDocument(selected, { engine, style, documentWidth, documentHeight }), error: null }; }
    catch (error) { return { plan: null, error: error instanceof Error ? error.message : String(error) }; }
  }, [selected, engine, style, documentWidth, documentHeight]);
  useEffect(() => {
    active.current?.abort(); active.current = null; setBusy(false); setStatus("");
    previewRef.current = null; setPreview(null);
    return () => { active.current?.abort(); active.current = null; };
  }, [selected, pageId, masterEditMode, disabled, engine, style, documentWidth, documentHeight]);
  useEffect(() => {
    session.current?.dispose(); session.current = null;
    return () => { session.current?.dispose(); session.current = null; };
  }, [pageId, masterEditMode, disabled, engine, documentWidth, documentHeight, reuseEnabled]);
  useEffect(() => {
    const leave = () => {
      active.current?.abort(); active.current = null;
      session.current?.dispose(); session.current = null;
      previewRef.current = null; setPreview(null); setBusy(false);
      setStatus("화면을 벗어나 엔진 자원을 해제했습니다. 원본은 유지됩니다.");
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") leave(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
    };
  }, []);
  function cancel() {
    active.current?.abort(); active.current = null; setBusy(false);
    releaseSession(); clearPreview();
    setStatus("변환을 취소했습니다. 원본은 변경되지 않았습니다.");
  }
  async function convert(previewOnly = false) {
    const plan = prepared.plan;
    if (!plan || disabled || masterEditMode || busy || !onPrepare || active.current) return;
    const commit = onPrepare({ pageId, masterEditMode, sourceElementId: plan.sourceElementId, sourceRevision: plan.sourceRevision });
    if (!commit) { setStatus("현재 문서 상태에서는 변환을 시작할 수 없습니다."); return; }
    clearPreview();
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setStatus(`${engine} 엔진으로 선택 획을 변환하고 있습니다.`);
    try {
      const result = reuseEnabled
        ? await (session.current ??= new StudioNativeBrushDocumentSession()).render(plan, controller.signal)
        : await renderStudioNativeBrushDocument(plan, controller.signal);
      if (controller.signal.aborted || active.current !== controller) return;
      if (previewOnly) {
        previewRef.current = { result, commit }; setPreview(result);
        setStatus(`${engine} 미리보기 완료. 원본은 아직 변경되지 않았습니다.`);
        return;
      }
      if (!commit(result)) throw new Error("문서·원본·실행 취소 이력이 변경되어 결과를 적용하지 않았습니다.");
      setStatus(`${engine} 변환 완료. 원본은 숨김 보존되며 실행 취소로 되돌릴 수 있습니다.`);
    } catch (error) {
      if (!controller.signal.aborted && active.current === controller) {
        releaseSession(); setStatus(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }
  function applyPreview() {
    if (busy || disabled || masterEditMode) return;
    const pending = previewRef.current;
    if (!pending) return;
    clearPreview(); // One click owns the receipt; double clicks cannot add a second image.
    try {
      if (!pending.commit(pending.result)) throw new Error("문서·원본·실행 취소 이력이 변경되어 미리보기를 적용하지 않았습니다.");
      setStatus("확인한 미리보기를 적용했습니다. 원본 숨김 보존 · 실행 취소 가능");
    } catch (error) {
      releaseSession(); setStatus(error instanceof Error ? error.message : String(error));
    }
  }
  if (!onPrepare) return null;
  return <details className="rounded-lg border border-line p-3" onToggle={(event) => {
    if (!event.currentTarget.open) {
      if (active.current) cancel();
      else { releaseSession(); clearPreview(); }
    }
  }}>
    <summary className="min-h-11 cursor-pointer text-sm font-semibold text-fg">선택 획 · 네이티브 엔진 변환</summary>
    <section aria-label="선택 획 네이티브 엔진 변환" className="space-y-3 pt-2">
      <p className="text-xs leading-relaxed text-fg-3">완성된 획의 중심선·필압을 선택한 엔진으로 다시 그립니다. 기존 브러시 질감을 복제하는 기능은 아니며, 성공한 PNG만 문서에 추가하고 원본은 숨김 보존합니다.</p>
      <div className="flex flex-wrap gap-2">
        <select aria-label="문서 변환 엔진" className={CONTROL} value={engine} disabled={busy} onChange={(event) => {
          const next = event.target.value as NativeBrushProbeEngine;
          setEngine(next);
          if (next !== "libmypaint") setStyle("ink");
        }}>
          <option value="libmypaint">libmypaint · 자연매체</option><option value="canvaskit">CanvasKit · WebGL2</option><option value="vello">Vello · WebGPU</option>
        </select>
        <select aria-label="문서 변환 재질" className={CONTROL} value={style} disabled={busy || engine !== "libmypaint"} onChange={(event) => setStyle(event.target.value as NativeBrushProbeStyle)}>
          <option value="ink">잉크</option><option value="wash">워시</option><option value="chalk">초크</option>
        </select>
      </div>
      {engine !== "libmypaint" && <p className="text-xs text-fg-3">CanvasKit·Vello는 같은 필압 윤곽선을 잉크로 렌더링합니다. 워시·초크는 libmypaint에서 선택하세요.</p>}
      <p className="text-xs text-fg-3">원본 크기 그대로 변환합니다. 굵기 1–128px, 입력 8,192점, 획 영역 2048×2048 이내를 지원하며 초과하면 축소하지 않고 중단합니다.</p>
      {prepared.error && <p className="text-xs text-warn">{prepared.error}</p>}
      {prepared.plan?.warnings.map((message) => <p key={message} className="text-xs text-warn">{message}</p>)}
      {(disabled || masterEditMode) && <p className="text-xs text-warn">일반 페이지에서 문서·선택 레이어 잠금을 해제한 뒤 변환하세요.</p>}
      <label className="flex min-h-11 items-center gap-2 text-xs text-fg-2">
        <input type="checkbox" checked={reuseEnabled} disabled={busy}
          onChange={(event) => setReuseEnabled(event.target.checked)} />
        연속 미리보기 가속
      </label>
      <p className="text-xs text-fg-3">같은 엔진을 잠시 재사용합니다. 첫 실행에서만 로드하며, 15초 동안 사용하지 않거나 패널·페이지를 벗어나면 자원을 해제합니다.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={CONTROL} disabled={!prepared.plan || disabled || masterEditMode || busy}
          onClick={() => { void convert(true); }}>결과 미리보기</button>
        <button type="button" className={CONTROL} disabled={!prepared.plan || disabled || masterEditMode || busy} onClick={() => { void convert(); }}>선택 획 변환</button>
        {busy && <button type="button" className={CONTROL} onClick={cancel}>변환 취소</button>}
      </div>
      {preview && <figure className="space-y-2 rounded-lg border border-line p-2">
        <img alt={`${preview.engine} 선택 획 미리보기`} src={preview.src}
          width={preview.bounds.width} height={preview.bounds.height}
          style={{ maxWidth: "100%", maxHeight: 240, objectFit: "contain", opacity: selected?.opacity ?? 1 }} />
        <figcaption className="text-xs text-fg-3">{preview.engine} · {preview.style} · {preview.bounds.width}×{preview.bounds.height}px · 문서 적용 전</figcaption>
        <button type="button" className={CONTROL} disabled={busy || disabled || masterEditMode} onClick={applyPreview}>미리보기 적용</button>
      </figure>}
      <p role="status" className="text-xs leading-relaxed text-fg-2">{status}</p>
    </section>
  </details>;
}
