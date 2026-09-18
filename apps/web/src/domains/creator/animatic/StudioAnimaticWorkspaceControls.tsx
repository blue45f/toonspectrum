import { useId, useState } from "react";

import { StudioAnimaticCanvas } from "./StudioAnimaticCanvas";
import { ANIMATIC_WORKSPACE_LIMITS, compareStudioAnimaticSnapshots, moveStudioAnimaticShot, studioAnimaticWorkspaceSnapshot, type StudioAnimaticWorkspaceDocument } from "./studio-animatic-workspace";

import type { StudioAnimaticImages } from "./studio-animatic-renderer";

const CONTROL = "min-h-11 min-w-11 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
const FIELD = `${CONTROL} w-full`;

export function StudioAnimaticWorkspaceControls({ workspace, images, selectedShot, busy, progress, currentTime, totalDuration, onCommit, onSeek, onCapture, onAudioFile, onExportArchive, onImportArchive, onExportVideo, onCancel }: {
  workspace: StudioAnimaticWorkspaceDocument;
  images: StudioAnimaticImages;
  selectedShot: string;
  busy: boolean;
  progress: number | null;
  currentTime: () => number;
  totalDuration: number;
  onCommit: (workspace: StudioAnimaticWorkspaceDocument) => void;
  onSeek: (timeMs: number) => void;
  onCapture: () => void;
  onAudioFile: (file: File) => void;
  onExportArchive: () => void;
  onImportArchive: (file: File) => void;
  onExportVideo: () => void;
  onCancel: () => void;
}) {
  const inputId = useId();
  const [markerLabel, setMarkerLabel] = useState("");
  const [variantName, setVariantName] = useState("");
  const [comment, setComment] = useState("");
  const [comparisonId, setComparisonId] = useState("");
  const segment = workspace.timeline.segments.find((item) => item.id === selectedShot) ?? workspace.timeline.segments[0];
  const shot = workspace.shots.find((item) => item.segmentId === segment?.id);
  const variant = workspace.variants.find((item) => item.id === comparisonId);
  const comparison = variant ? compareStudioAnimaticSnapshots(workspace, variant.snapshot) : null;
  function shotNote(key: "sequence" | "camera" | "notes", value: string) {
    if (!segment) return;
    const next = { segmentId: segment.id, sequence: "", camera: "", notes: "", ...shot, [key]: value };
    onCommit({ ...workspace, shots: [...workspace.shots.filter((item) => item.segmentId !== segment.id), next] });
  }
  return <div className="space-y-3" data-studio-storyboard-workspace="true">
    <div className="flex flex-wrap gap-2" role="group" aria-label="스토리보드 미디어와 내보내기">
      <button className={CONTROL} disabled={busy} onClick={onCapture}>원고 미리보기 갱신</button>
      <label className={`${CONTROL} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-accent`} htmlFor={`${inputId}-audio`}>오디오 추가
        <input id={`${inputId}-audio`} aria-label="스토리보드 오디오 파일" className="sr-only" type="file" accept="audio/*" disabled={busy}
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onAudioFile(file); }} />
      </label>
      <button className={CONTROL} disabled={busy} onClick={onExportVideo}>오디오 포함 영상 내보내기</button>
      <button className={CONTROL} disabled={busy} onClick={onExportArchive}>미디어 포함 작업 ZIP 저장</button>
      <label className={`${CONTROL} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-accent`} htmlFor={`${inputId}-archive`}>작업 ZIP 열기
        <input id={`${inputId}-archive`} aria-label="스토리보드 작업 ZIP" className="sr-only" type="file" accept=".zip,application/zip" disabled={busy}
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onImportArchive(file); }} />
      </label>
      {progress !== null ? <><progress aria-label="스토리보드 작업 진행률" className="h-11 max-w-40" max={1} value={progress} /><button className={CONTROL} onClick={onCancel}>영상 내보내기 취소</button></> : null}
    </div>
    <p className="text-xs text-fg-3">원고를 갱신하면 실제 그림으로 컷과 카메라 움직임을 재생합니다. 오디오·버전·검토 의견도 작업 ZIP에 함께 보관됩니다.</p>
    {segment ? <details className="rounded-xl border border-line p-3">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">선택한 컷 · {segment.label}</summary>
      <div className="flex flex-wrap gap-2">
        <button className={CONTROL} disabled={busy || workspace.timeline.segments[0]?.id === segment.id} onClick={() => onCommit(moveStudioAnimaticShot(workspace, segment.id, -1))}>컷 앞으로 이동</button>
        <button className={CONTROL} disabled={busy || workspace.timeline.segments.at(-1)?.id === segment.id} onClick={() => onCommit(moveStudioAnimaticShot(workspace, segment.id, 1))}>컷 뒤로 이동</button>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-fg-2">시퀀스<input className={FIELD} maxLength={120} value={shot?.sequence ?? ""} disabled={busy} onChange={(event) => shotNote("sequence", event.target.value)} /></label>
        <label className="text-xs text-fg-2">카메라 메모<input className={FIELD} maxLength={300} value={shot?.camera ?? ""} disabled={busy} onChange={(event) => shotNote("camera", event.target.value)} /></label>
        <label className="text-xs text-fg-2 sm:col-span-2">연출 메모<textarea className={FIELD} maxLength={2000} value={shot?.notes ?? ""} disabled={busy} onChange={(event) => shotNote("notes", event.target.value)} /></label>
      </div>
    </details> : null}
    <details className="rounded-xl border border-line p-3">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">오디오와 마커 · {workspace.audio.length}트랙</summary>
      {workspace.audio.map((track) => <fieldset key={track.id} disabled={busy} className="mb-3 min-w-0 rounded-lg border border-line p-2">
        <legend className="max-w-full truncate px-1 text-sm">{track.name}</legend>
        <svg className="h-16 w-full bg-canvas" viewBox="0 0 256 64" preserveAspectRatio="none" role="img" aria-label={`${track.name} 오디오 파형`}>
          {track.waveform.map((peak, index) => <line key={index} x1={index * 256 / Math.max(1, track.waveform.length)} x2={index * 256 / Math.max(1, track.waveform.length)} y1={32 - peak * 30} y2={32 + peak * 30} stroke="currentColor" />)}
        </svg>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {([
            ["startMs", "시작 (초)", 0, 600], ["trimStartMs", "트림 시작 (초)", 0, (track.trimEndMs - 1) / 1000],
            ["trimEndMs", "트림 끝 (초)", (track.trimStartMs + 1) / 1000, track.durationMs / 1000],
          ] as const).map(([key, label, min, max]) => <label key={key} className="text-xs">{label}<input className={FIELD} type="number" step={0.01} min={min} max={max} value={Math.round(track[key]) / 1000}
            onChange={(event) => { const value = Number(event.target.value) * 1000; if (!Number.isFinite(value)) return; onCommit({ ...workspace, audio: workspace.audio.map((item) => item.id === track.id ? { ...item, [key]: Math.min(max * 1000, Math.max(min * 1000, value)) } : item) }); }} /></label>)}
          <label className="text-xs">볼륨<input className={FIELD} type="range" min={0} max={1} step={0.05} value={track.volume} onChange={(event) => onCommit({ ...workspace, audio: workspace.audio.map((item) => item.id === track.id ? { ...item, volume: Number(event.target.value) } : item) })} /></label>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className={CONTROL} onClick={() => onSeek(track.startMs)}>트랙 시작으로 이동</button>
          <button className={CONTROL} aria-pressed={track.muted} onClick={() => onCommit({ ...workspace, audio: workspace.audio.map((item) => item.id === track.id ? { ...item, muted: !item.muted } : item) })}>{track.muted ? "음소거 해제" : "음소거"}</button>
          <button className={CONTROL} onClick={() => onCommit({ ...workspace, audio: workspace.audio.filter((item) => item.id !== track.id) })}>트랙 삭제</button>
        </div>
      </fieldset>)}
      <div className="flex flex-wrap gap-2">
        <input className={`${CONTROL} min-w-0 flex-1`} aria-label="새 타임라인 마커 이름" maxLength={200} value={markerLabel} onChange={(event) => setMarkerLabel(event.target.value)} />
        <button className={CONTROL} disabled={busy || !markerLabel.trim() || workspace.markers.length >= ANIMATIC_WORKSPACE_LIMITS.markers} onClick={() => { onCommit({ ...workspace, markers: [...workspace.markers, { id: crypto.randomUUID(), label: markerLabel.trim(), timeMs: Math.min(totalDuration, currentTime()) }] }); setMarkerLabel(""); }}>현재 위치에 마커</button>
      </div>
      <ul className="mt-2 space-y-1">{workspace.markers.map((marker) => <li key={marker.id} className="flex items-center gap-2">
        <button className={`${CONTROL} min-w-0 flex-1 truncate text-left`} onClick={() => onSeek(marker.timeMs)}>{(marker.timeMs / 1000).toFixed(2)}초 · {marker.label}</button>
        <button className={CONTROL} aria-label={`${marker.label} 마커 삭제`} disabled={busy} onClick={() => onCommit({ ...workspace, markers: workspace.markers.filter((item) => item.id !== marker.id) })}>삭제</button>
      </li>)}</ul>
    </details>
    <details className="rounded-xl border border-line p-3">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">버전과 검토 의견 · {workspace.variants.length}개 버전</summary>
      <div className="flex flex-wrap gap-2">
        <input className={`${CONTROL} min-w-0 flex-1`} aria-label="스토리보드 버전 이름" maxLength={200} value={variantName} onChange={(event) => setVariantName(event.target.value)} />
        <button className={CONTROL} disabled={busy || !variantName.trim() || workspace.variants.length >= ANIMATIC_WORKSPACE_LIMITS.variants} onClick={() => { onCommit({ ...workspace, variants: [...workspace.variants, { id: crypto.randomUUID(), name: variantName.trim(), createdAt: Date.now(), snapshot: studioAnimaticWorkspaceSnapshot(workspace) }] }); setVariantName(""); }}>현재 버전 보관</button>
        <select className={CONTROL} aria-label="비교할 스토리보드 버전" value={comparisonId} onChange={(event) => setComparisonId(event.target.value)}>
          <option value="">비교할 버전 선택</option>{workspace.variants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      {variant && comparison ? <div className="mt-2 space-y-2">
        <p className="text-sm">{variant.name}과 비교 · 추가 {comparison.added}컷 · 삭제 {comparison.removed}컷 · 변경 {comparison.changed}컷{comparison.timingChanged ? " · 재생 시간·순서 변경" : ""}{comparison.audioChanged ? " · 오디오 변경" : ""}</p>
        <div className="grid grid-cols-2 gap-2">
          <figure className="min-w-0"><div className="h-56"><StudioAnimaticCanvas snapshot={variant.snapshot} images={images} timeMs={currentTime()} label="보관한 버전 그림" /></div><figcaption className="text-xs">{variant.name}</figcaption></figure>
          <figure className="min-w-0"><div className="h-56"><StudioAnimaticCanvas snapshot={workspace} images={images} timeMs={currentTime()} label="현재 버전 그림" /></div><figcaption className="text-xs">현재 작업</figcaption></figure>
        </div>
        <button className={CONTROL} disabled={busy} onClick={() => onCommit({ ...workspace, ...variant.snapshot })}>이 버전으로 복원</button>
        <button className={CONTROL} disabled={busy} onClick={() => { onCommit({ ...workspace, variants: workspace.variants.filter((item) => item.id !== variant.id), reviews: workspace.reviews.map((item) => item.variantId === variant.id ? { ...item, variantId: null } : item) }); setComparisonId(""); }}>보관 버전 삭제</button>
      </div> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <textarea className={`${CONTROL} min-w-0 flex-1`} aria-label="새 스토리보드 검토 의견" maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} />
        <button className={CONTROL} disabled={busy || !comment.trim() || workspace.reviews.length >= ANIMATIC_WORKSPACE_LIMITS.reviews} onClick={() => { onCommit({ ...workspace, reviews: [...workspace.reviews, { id: crypto.randomUUID(), variantId: variant?.id ?? null, timeMs: currentTime(), text: comment.trim(), resolved: false }] }); setComment(""); }}>현재 위치에 의견 남기기</button>
      </div>
      <ul className="mt-2 space-y-2">{workspace.reviews.map((review) => <li key={review.id} className="rounded-lg border border-line p-2">
        <p className={`whitespace-pre-wrap break-words text-sm ${review.resolved ? "text-fg-3 line-through" : "text-fg"}`}>{review.text}</p>
        <button className={CONTROL} onClick={() => onSeek(review.timeMs)}>{(review.timeMs / 1000).toFixed(2)}초로 이동</button>
        <button className={CONTROL} disabled={busy} aria-pressed={review.resolved} onClick={() => onCommit({ ...workspace, reviews: workspace.reviews.map((item) => item.id === review.id ? { ...item, resolved: !item.resolved } : item) })}>{review.resolved ? "다시 검토" : "검토 완료"}</button>
        <button className={CONTROL} disabled={busy} onClick={() => onCommit({ ...workspace, reviews: workspace.reviews.filter((item) => item.id !== review.id) })}>의견 삭제</button>
      </li>)}</ul>
    </details>
  </div>;
}
