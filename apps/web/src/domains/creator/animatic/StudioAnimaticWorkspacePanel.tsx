import { useEffect, useRef, useState } from "react";

import { downloadBlob } from "../export/studio-export";
import { createStudioAnimaticSqlitePersistence } from "../studio-animatic-sqlite-persistence";
import { planStudioAnimaticPreview, type StudioAnimaticPageLike, type StudioAnimaticPreviewSample } from "../studio-animatic-timeline";
import { StudioAnimaticTimelinePanel } from "../StudioAnimaticTimelinePanel";
import { scheduleStudioAnimaticAudio, studioAnimaticWaveform } from "./studio-animatic-audio";
import { exportStudioAnimaticVideo } from "./studio-animatic-video-export";
import { ANIMATIC_WORKSPACE_LIMITS, createStudioAnimaticWorkspace, validateStudioAnimaticWorkspace, type StudioAnimaticWorkspaceDocument } from "./studio-animatic-workspace";
import { createStudioAnimaticWorkspaceRepository } from "./studio-animatic-workspace-persistence";
import { StudioAnimaticCanvas } from "./StudioAnimaticCanvas";
import { StudioAnimaticWorkspaceControls } from "./StudioAnimaticWorkspaceControls";
import { decodeStudioAnimaticAudio, useStudioAnimaticMedia } from "./use-studio-animatic-media";

export interface StudioAnimaticWorkspacePanelProps {
  workScope: string;
  pages: readonly StudioAnimaticPageLike[];
  workspace: StudioAnimaticWorkspaceDocument | null;
  persistenceStatus: { busy: boolean; error: string | null };
  onHydrate: (workspace: StudioAnimaticWorkspaceDocument) => void;
  onCommit: (before: StudioAnimaticWorkspaceDocument, after: StudioAnimaticWorkspaceDocument) => boolean;
  capturePages: (indices: number[]) => Promise<HTMLCanvasElement[]>;
  reducedMotion?: boolean;
  onClose?: () => void;
  className?: string;
}

export function StudioAnimaticWorkspacePanel({ workScope, pages, workspace, persistenceStatus, onHydrate, onCommit, capturePages, reducedMotion, onClose, className }: StudioAnimaticWorkspacePanelProps) {
  const [repository] = useState(createStudioAnimaticWorkspaceRepository);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [selectedShot, setSelectedShot] = useState("");
  const [seekRequest, setSeekRequest] = useState<{ timeMs: number; token: number }>();
  const [playback, setPlayback] = useState({ playing: false, timeMs: 0 });
  const playhead = useRef(0);
  const exportAbort = useRef<AbortController | null>(null);
  const current = workspace?.workScope === workScope ? workspace : null;
  const media = useStudioAnimaticMedia(current, repository);
  const plan = current ? planStudioAnimaticPreview(current.timeline, false) : null;
  const totalDuration = plan?.ok ? plan.plan.totalDurationMs : 0;
  const audioTracks = current?.audio;

  useEffect(() => {
    if (current) return;
    let active = true;
    void (async () => {
      const saved = await repository.load(workScope);
      if (!active) return;
      if (saved) { onHydrate(saved); return; }
      const previous = await createStudioAnimaticSqlitePersistence().load(workScope);
      if (!active) return;
      if (previous.status === "invalid" || previous.status === "unavailable") throw new Error(previous.error);
      onHydrate(createStudioAnimaticWorkspace(pages, workScope, previous.document ?? undefined));
    })().catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [current, onHydrate, pages, repository, workScope]);
  useEffect(() => () => { exportAbort.current?.abort(); }, []);
  useEffect(() => {
    if (!playback.playing || !audioTracks?.length || media.busy || media.error) return;
    let active = true;
    let stop: (() => void) | null = null;
    const context = new AudioContext();
    void context.resume().then(() => {
      if (!active) return;
      stop = scheduleStudioAnimaticAudio(context, context.destination, audioTracks, media.audio, playhead.current, totalDuration);
    }).catch((reason: unknown) => {
      if (active) { setPlayback((value) => ({ ...value, playing: false })); setError(reason instanceof Error ? reason.message : String(reason)); }
    });
    return () => { active = false; stop?.(); void context.close().catch(() => undefined); };
  }, [audioTracks, media.audio, media.busy, media.error, playback, totalDuration]);

  function commit(next: StudioAnimaticWorkspaceDocument): void {
    if (!current) return;
    validateStudioAnimaticWorkspace(next);
    // Product edits already create immutable paths. Retain their structural sharing in the
    // document Undo journal; the importer alone needs the validator's canonical cloned result.
    if (!onCommit(current, next)) throw new Error("원고가 바뀌어 적용하지 못했습니다. 현재 스토리보드에서 다시 시도하세요.");
  }
  function applyEdit(next: StudioAnimaticWorkspaceDocument): void {
    // Synchronous text/slider edits must preserve focus and pointer capture. The
    // asynchronous busy state is reserved for capturing, decoding and exporting media.
    setError(null);
    try { commit(next); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  async function run(operation: () => Promise<void> | void) {
    if (busy) return;
    setBusy(true); setError(null);
    try { await operation(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); setProgress(null); }
  }
  function observe(sample: StudioAnimaticPreviewSample) {
    if (playback.playing && sample.timeMs < playhead.current) setPlayback({ playing: true, timeMs: sample.timeMs });
    playhead.current = sample.timeMs;
  }
  async function captureArtwork() {
    if (!current) return;
    const artwork = [...current.artwork];
    const pageIds = [...new Set(current.timeline.segments.map((segment) => segment.pageId))];
    for (const [position, pageId] of pageIds.entries()) {
      const index = pages.findIndex((page) => page.id === pageId);
      if (index < 0) throw new Error("원고에서 삭제된 페이지입니다. 타임라인의 컷을 먼저 정리하세요.");
      const canvases = await capturePages([index]);
      const canvas = canvases[0];
      if (!canvas) throw new Error("원고 캡처를 완료하지 못했습니다.");
      try {
        if (canvas.width * canvas.height * 4 > ANIMATIC_WORKSPACE_LIMITS.assetBytes) throw new Error("캡처한 원고가 미리보기 메모리 한도를 넘었습니다.");
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("원고 PNG를 만들지 못했습니다.")), "image/png"));
        const asset = await repository.putAsset(new Uint8Array(await blob.arrayBuffer()), "image/png");
        const entry = { pageId, asset, width: canvas.width, height: canvas.height, documentWidth: 720, documentHeight: pages[index]!.canvasH ?? 1280 };
        const previous = artwork.findIndex((item) => item.pageId === pageId);
        if (previous < 0) artwork.push(entry); else artwork[previous] = entry;
      } finally { for (const surface of canvases) { surface.width = 1; surface.height = 1; } }
      setProgress((position + 1) / pageIds.length);
    }
    commit({ ...current, artwork });
  }
  async function importAudio(file: File) {
    if (!current) return;
    if (current.audio.length >= ANIMATIC_WORKSPACE_LIMITS.audioTracks) throw new Error("오디오는 최대 8트랙까지 추가할 수 있습니다.");
    if (file.size === 0 || file.size > ANIMATIC_WORKSPACE_LIMITS.audioFileBytes) throw new Error("오디오 파일은 32MB 이하여야 합니다.");
    const buffer = await decodeStudioAnimaticAudio(file);
    const asset = await repository.putAsset(new Uint8Array(await file.arrayBuffer()), file.type.startsWith("audio/") ? file.type : "application/octet-stream");
    const waveform = studioAnimaticWaveform(Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index)));
    commit({ ...current, audio: [...current.audio, { id: crypto.randomUUID(), name: file.name.slice(0, 200), asset, durationMs: buffer.duration * 1000, startMs: playhead.current, trimStartMs: 0, trimEndMs: buffer.duration * 1000, volume: 1, muted: false, waveform }] });
  }
  if (!current) return <section className="p-4" role={error ? "alert" : "status"}>{error ?? "스토리보드 작업을 불러오는 중…"}</section>;
  return <StudioAnimaticTimelinePanel workScope={workScope} pages={pages} persistence={null}
    externalDocument={current.timeline} reducedMotion={reducedMotion} onClose={onClose} className={className}
    workspaceStatus={{ busy: busy || persistenceStatus.busy || media.busy, error: error ?? media.error ?? persistenceStatus.error }}
    onDocumentChange={(timeline) => applyEdit({ ...current, timeline })}
    onSelectedSegmentChange={setSelectedShot} onPreviewSample={observe} seekRequest={seekRequest}
    onPlaybackChange={(playing, timeMs) => setPlayback((previous) => previous.playing === playing ? previous : { playing, timeMs })}
    previewOwnsTransform
    renderPreview={(sample) => <StudioAnimaticCanvas snapshot={current} images={media.images} sample={sample} />}
    renderShotThumbnail={(segment) => <StudioAnimaticCanvas snapshot={current} images={media.images} thumbnail label={`${segment.label} 원고 미리보기`} timeMs={plan?.ok ? plan.plan.segments.find((item) => item.segmentId === segment.id)?.transitionEndMs ?? 0 : 0} />}
    workspaceControls={<StudioAnimaticWorkspaceControls workspace={current} images={media.images} selectedShot={selectedShot}
      busy={busy || media.busy} progress={progress} currentTime={() => playhead.current} totalDuration={totalDuration}
      onCommit={applyEdit} onSeek={(timeMs) => setSeekRequest({ timeMs, token: Date.now() })}
      onCapture={() => { void run(captureArtwork); }} onAudioFile={(file) => { void run(() => importAudio(file)); }}
      onExportArchive={() => { void run(async () => downloadBlob(await repository.exportArchive(current), "storyboard-workspace.zip")); }}
      onImportArchive={(file) => { void run(async () => {
        if (file.size > ANIMATIC_WORKSPACE_LIMITS.archiveBytes) throw new Error("작업 ZIP 파일이 크기 한도를 넘었습니다.");
        commit(await repository.importArchive(new Uint8Array(await file.arrayBuffer()), workScope));
      }); }}
      onExportVideo={() => { void run(async () => {
        const controller = new AbortController(); exportAbort.current = controller;
        try { const blob = await exportStudioAnimaticVideo({ snapshot: current, images: media.images, audioBuffers: media.audio, signal: controller.signal, onProgress: setProgress }); downloadBlob(blob, "storyboard-animatic.webm"); }
        finally { if (exportAbort.current === controller) exportAbort.current = null; }
      }); }} onCancel={() => exportAbort.current?.abort()} />}
  />;
}
