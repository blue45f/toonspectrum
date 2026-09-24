import {
  PROMO_FPS,
  promoFrameCount,
  promoMusicGain,
  promoVoiceGain,
} from "./promo-model";

import type { PromoProject } from "./promo-model";

const PREVIEW_START_LOOKAHEAD_SEC = 0.01;
const PREVIEW_SEEK_FADE_SEC = 0.02;

type PromoGainReader = (project: PromoProject, frame: number) => number;

export type PromoAudioPreviewScope = {
  AudioContext: typeof AudioContext;
  fetch: typeof fetch;
};

export type PromoAudioPreview = {
  start: (frame: number) => void;
  stop: () => void;
};

function browserAudioScope(): PromoAudioPreviewScope | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  return { AudioContext, fetch: window.fetch.bind(window) };
}
function clampFrame(project: PromoProject, frame: number): number {
  return Math.max(0, Math.min(promoFrameCount(project) - 1, Math.floor(frame)));
}

function scheduleTrackGain(
  project: PromoProject,
  param: AudioParam,
  gainAt: PromoGainReader,
  startFrame: number,
  startAt: number,
): void {
  const total = promoFrameCount(project);
  const remainingSec = Math.max(0, (total - startFrame) / PROMO_FPS);
  const fadeSec = Math.min(PREVIEW_SEEK_FADE_SEC, remainingSec / 2);
  const initialGain = gainAt(project, startFrame);

  param.cancelScheduledValues(startAt);
  param.setValueAtTime(0, startAt);
  if (fadeSec > 0) param.linearRampToValueAtTime(initialGain, startAt + fadeSec);
  else param.setValueAtTime(initialGain, startAt);

  for (let frame = startFrame + 1; frame <= total; frame += 1) {
    const at = startAt + (frame - startFrame) / PROMO_FPS;
    if (at <= startAt + fadeSec) continue;
    param.linearRampToValueAtTime(gainAt(project, frame), at);
  }
}
export function schedulePromoPreviewGains(
  project: PromoProject,
  music: AudioParam | null,
  voice: AudioParam | null,
  startFrame: number,
  startAt: number,
): void {
  const frame = clampFrame(project, startFrame);
  if (music) scheduleTrackGain(project, music, promoMusicGain, frame, startAt);
  if (voice) scheduleTrackGain(project, voice, promoVoiceGain, frame, startAt);
}

async function decodePromoAudio(
  context: AudioContext,
  src: string,
  signal: AbortSignal,
  scope: PromoAudioPreviewScope,
): Promise<AudioBuffer> {
  const response = await scope.fetch(src, { signal });
  if (!response.ok) throw new Error("오디오 파일을 읽지 못했어요.");
  const buffer = await context.decodeAudioData(await response.arrayBuffer());
  if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > 180) {
    throw new Error("음원은 3분 이하의 정상적인 오디오 파일이어야 해요.");
  }
  return buffer;
}
/**
 * Decodes both preview tracks into one Web Audio clock. Starting from a seeked
 * frame therefore uses one exact timeline and a short anti-click fade instead
 * of racing an HTMLAudioElement seek against narration playback.
 */
export async function preparePromoAudioPreview(
  project: PromoProject,
  signal: AbortSignal,
  injectedScope: PromoAudioPreviewScope | null = browserAudioScope(),
): Promise<PromoAudioPreview | null> {
  if (!project.audio && !project.voiceover) return null;
  if (!injectedScope) throw new Error("이 브라우저는 오디오 미리보기를 지원하지 않아요.");

  const context = new injectedScope.AudioContext();
  let musicBuffer: AudioBuffer | null = null;
  let voiceBuffer: AudioBuffer | null = null;
  let musicSource: AudioBufferSourceNode | null = null;
  let voiceSource: AudioBufferSourceNode | null = null;
  let musicGain: GainNode | null = null;
  let voiceGain: GainNode | null = null;
  let started = false;
  let stopped = false;

  const stopSource = (source: AudioBufferSourceNode | null) => {
    if (!source) return;
    try { source.stop(); } catch { /* Not started or already stopped. */ }
    source.disconnect();
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    signal.removeEventListener("abort", stop);
    stopSource(musicSource);
    stopSource(voiceSource);
    musicGain?.disconnect();
    voiceGain?.disconnect();
    if (context.state !== "closed") void context.close().catch(() => undefined);
  };

  signal.addEventListener("abort", stop, { once: true });
  try {
    await context.resume();
    if (signal.aborted) throw new DOMException("취소했어요.", "AbortError");

    [musicBuffer, voiceBuffer] = await Promise.all([
      project.audio
        ? decodePromoAudio(context, project.audio.src, signal, injectedScope)
        : Promise.resolve(null),
      project.voiceover
        ? decodePromoAudio(context, project.voiceover.src, signal, injectedScope)
        : Promise.resolve(null),
    ]);
    if (signal.aborted) throw new DOMException("취소했어요.", "AbortError");
    if (project.voiceover && voiceBuffer
      && Math.abs(voiceBuffer.duration - project.voiceover.durationSec) > 0.1) {
      throw new Error("내레이션 길이가 맞지 않아요. 음원을 다시 추가해 주세요.");
    }
    return {
      stop,
      start(requestedFrame) {
        if (started || stopped) return;
        started = true;
        const frame = clampFrame(project, requestedFrame);
        const timelineSec = frame / PROMO_FPS;
        const remainingSec = Math.max(0, project.seconds - timelineSec);
        const startAt = context.currentTime + PREVIEW_START_LOOKAHEAD_SEC;

        if (musicBuffer) {
          musicSource = context.createBufferSource();
          musicSource.buffer = musicBuffer;
          musicSource.loop = true;
          musicSource.loopStart = 0;
          musicSource.loopEnd = musicBuffer.duration;
          musicGain = context.createGain();
          musicGain.gain.value = 0;
          musicSource.connect(musicGain);
          musicGain.connect(context.destination);
          const offset = timelineSec % musicBuffer.duration;
          musicSource.start(startAt, offset);
          musicSource.stop(startAt + remainingSec);
        }

        const voice = project.voiceover;
        const voiceEnd = voice && voiceBuffer
          ? Math.min(project.seconds, voice.startSec + voiceBuffer.duration)
          : 0;
        if (voice && voiceBuffer && timelineSec < voiceEnd) {
          const voiceTimelineStart = Math.max(timelineSec, voice.startSec);
          const delaySec = voiceTimelineStart - timelineSec;
          const offsetSec = Math.max(0, voiceTimelineStart - voice.startSec);
          voiceSource = context.createBufferSource();
          voiceSource.buffer = voiceBuffer;
          voiceGain = context.createGain();
          voiceGain.gain.value = 0;
          voiceSource.connect(voiceGain);
          voiceGain.connect(context.destination);
          voiceSource.start(startAt + delaySec, offsetSec);
          voiceSource.stop(startAt + (voiceEnd - timelineSec));
        }

        schedulePromoPreviewGains(
          project,
          musicGain?.gain ?? null,
          voiceGain?.gain ?? null,
          frame,
          startAt,
        );
      },
    };
  } catch (error) {
    stop();
    throw error;
  }
}
