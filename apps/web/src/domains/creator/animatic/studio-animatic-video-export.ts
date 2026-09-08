import { createDefaultMotionExportDeps, pickMotionVideoMime, recommendVideoBitsPerSecond, type MotionExportDeps, type MotionStreamLike } from "../export/studio-motion-export";
import { planStudioAnimaticPreview, sampleStudioAnimaticPreview } from "../studio-animatic-timeline";
import { scheduleStudioAnimaticAudio } from "./studio-animatic-audio";
import { drawStudioAnimaticFrame, type StudioAnimaticImages } from "./studio-animatic-renderer";
import { finalizeStudioAnimaticRecordedWebm } from "./studio-animatic-recorded-webm";

import type { StudioAnimaticWorkspaceSnapshot } from "./studio-animatic-workspace";

export interface StudioAnimaticVideoRequest {
  snapshot: StudioAnimaticWorkspaceSnapshot;
  images: StudioAnimaticImages;
  audioBuffers: ReadonlyMap<string, AudioBuffer>;
  width?: number;
  height?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
  deps?: Partial<MotionExportDeps>;
}

/** Uses the existing recorder adapters, with the same frame renderer as the visible preview. */
export async function exportStudioAnimaticVideo(request: StudioAnimaticVideoRequest): Promise<Blob> {
  const planned = planStudioAnimaticPreview(request.snapshot.timeline, false);
  if (!planned.ok) throw new Error(planned.error);
  const { plan } = planned;
  if (plan.totalDurationMs <= 0) throw new Error("내보낼 컷이 없습니다.");
  for (const segment of request.snapshot.timeline.segments) {
    const artwork = request.snapshot.artwork.find((item) => item.pageId === segment.pageId);
    if (!artwork || !request.images.has(artwork.asset.hash)) throw new Error("모든 컷의 원고를 캡처한 뒤 영상을 내보내세요.");
  }
  if (request.signal?.aborted) throw new DOMException("내보내기를 취소했습니다.", "AbortError");
  const deps = { ...createDefaultMotionExportDeps(), ...request.deps };
  const mimeType = pickMotionVideoMime(deps.isMimeSupported);
  if (!mimeType) throw new Error("이 브라우저는 WebM 영상 내보내기를 지원하지 않습니다. 미디어를 포함한 작업 ZIP을 저장할 수 있습니다.");
  if ((request.width !== undefined && !Number.isFinite(request.width)) || (request.height !== undefined && !Number.isFinite(request.height))) throw new Error("영상의 가로·세로 크기가 올바르지 않습니다.");
  const width = Math.max(160, Math.min(1920, Math.round(request.width ?? 720)));
  const height = Math.max(160, Math.min(1920, Math.round(request.height ?? 1280)));
  const canvas = deps.createCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) { canvas.width = 1; canvas.height = 1; throw new Error("영상 캔버스를 만들지 못했습니다."); }
  const draw = (timeMs: number) => {
    const sample = sampleStudioAnimaticPreview(request.snapshot.timeline, plan, Math.min(timeMs, plan.totalDurationMs - 1), false);
    if (sample) drawStudioAnimaticFrame(context, width, height, request.snapshot, sample, request.images);
  };
  let stream: MotionStreamLike | null = null;
  let audioContext: AudioContext | null = null;
  let stopAudio: (() => void) | null = null;
  let frame: number | null = null;
  let recorder: ReturnType<MotionExportDeps["createRecorder"]> | null = null;
  let interrupt: ((reason: Error) => void) | null = null;
  let interruption: Error | null = null;
  const stopExport = (reason: Error) => {
    interruption ??= reason;
    interrupt?.(interruption);
  };
  const aborted = () => stopExport(new DOMException("내보내기를 취소했습니다.", "AbortError"));
  request.signal?.addEventListener("abort", aborted, { once: true });
  const hidden = () => {
    if (document.visibilityState === "hidden") stopExport(new Error("화면이 숨겨져 영상 기록을 중단했습니다. 스토리보드 화면을 열고 다시 내보내세요."));
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", hidden);
  try {
    draw(0);
    stream = canvas.captureStream(plan.fps);
    const audible = request.snapshot.audio.filter((track) => !track.muted && track.volume > 0);
    let audioOrigin = 0;
    let audioDestination: MediaStreamAudioDestinationNode | null = null;
    if (audible.length) {
      audioContext = new AudioContext();
      const preparingAudio = audioContext;
      // Autoplay restrictions can leave resume pending. Cancellation must release the captured
      // video stream now; a late resume result must never start an abandoned recording.
      await new Promise<void>((resolve, reject) => {
        interrupt = reject;
        preparingAudio.resume().then(resolve, reject);
        if (request.signal?.aborted) aborted();
        if (typeof document !== "undefined") hidden();
        if (interruption) reject(interruption);
      });
      interrupt = null;
      // An abort may land between resume's resolution and this continuation.
      if (interruption) throw interruption;
      audioDestination = audioContext.createMediaStreamDestination();
      for (const track of audioDestination.stream.getAudioTracks()) stream.addTrack(track);
    }
    recorder = deps.createRecorder(stream, { mimeType, videoBitsPerSecond: recommendVideoBitsPerSecond(width, height, plan.fps) });
    const chunks: Blob[] = [];
    let encodedBytes = 0;
    let encoderError: Error | null = null;
    let stoppedResolve: () => void = () => undefined;
    const stopped = new Promise<void>((resolve) => { stoppedResolve = resolve; });
    recorder.ondataavailable = (event) => {
      encodedBytes += event.data.size;
      if (encodedBytes > 256 * 1024 * 1024) {
        encoderError = new Error("영상이 256MB 한도를 넘었습니다. 컷 길이를 줄여 나누어 내보내세요.");
        interrupt?.(encoderError);
        return;
      }
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => stoppedResolve();
    recorder.onerror = () => {
      encoderError = new Error("영상 인코딩 중 오류가 발생했습니다.");
      interrupt?.(encoderError);
      stoppedResolve();
    };
    recorder.start(250);
    // Schedule only after recording starts; encoder setup must not consume the first sound.
    if (audioContext && audioDestination) {
      audioOrigin = audioContext.currentTime + 0.025;
      stopAudio = scheduleStudioAnimaticAudio(audioContext, audioDestination, audible, request.audioBuffers, 0, plan.totalDurationMs, audioOrigin);
    }
    const start = deps.now();
    await new Promise<void>((resolve, reject) => {
      interrupt = reject;
      if (request.signal?.aborted) { aborted(); return; }
      if (encoderError) { reject(encoderError); return; }
      if (typeof document !== "undefined" && document.visibilityState === "hidden") { hidden(); return; }
      const tick = () => {
        frame = null;
        try {
          const elapsed = audioContext ? Math.max(0, (audioContext.currentTime - audioOrigin) * 1000) : deps.now() - start;
          draw(elapsed);
          request.onProgress?.(Math.min(1, elapsed / plan.totalDurationMs));
          if (elapsed >= plan.totalDurationMs) { resolve(); return; }
          frame = deps.requestFrame(tick);
        } catch (error) { reject(error); }
      };
      tick();
    });
    recorder.stop();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("영상 인코더가 기록 종료에 응답하지 않았습니다.")), 5000);
      interrupt = reject;
      void stopped.then(() => { clearTimeout(timeout); resolve(); });
    });
    if (request.signal?.aborted) throw new DOMException("내보내기를 취소했습니다.", "AbortError");
    if (encoderError) throw encoderError;
    if (!chunks.length) throw new Error("영상 데이터가 생성되지 않았습니다.");
    request.onProgress?.(1);
    const finalized = await finalizeStudioAnimaticRecordedWebm(new Blob(chunks, { type: recorder.mimeType || mimeType }), plan.totalDurationMs);
    if (request.signal?.aborted) throw new DOMException("내보내기를 취소했습니다.", "AbortError");
    return finalized;
  } finally {
    interrupt = null;
    request.signal?.removeEventListener("abort", aborted);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", hidden);
    if (frame !== null) deps.cancelFrame(frame);
    stopAudio?.();
    try { recorder?.stop(); } catch { /* Already stopped. */ }
    for (const track of stream?.getTracks() ?? []) track.stop();
    canvas.width = 1;
    canvas.height = 1;
    if (audioContext) await audioContext.close().catch(() => undefined);
  }
}
