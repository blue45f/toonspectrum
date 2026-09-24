import {
  creatorIntelligenceClient,
  type CreatorIntelligenceVoiceProvider,
  type VoiceSynthesizeResponse,
} from "../creator-intelligence/studio-creator-intelligence-client";

export interface PromoCloudVoiceClipInput {
  readonly id: string;
  readonly text: string;
  readonly startSec: number;
  readonly durationSec: number;
  readonly style?: string;
  readonly voice?: string;
  readonly language?: string;
}

export interface PromoCloudVoiceRenderRequest {
  readonly provider: CreatorIntelligenceVoiceProvider;
  readonly clips: readonly PromoCloudVoiceClipInput[];
  readonly durationSec: number;
}

export interface PromoCloudVoiceRenderResult {
  readonly blob: Blob;
  readonly provider: CreatorIntelligenceVoiceProvider;
  readonly generatedClipCount: number;
  readonly overrunClipIds: readonly string[];
}

type VoiceSynthesizer = (
  input: {
    readonly provider: CreatorIntelligenceVoiceProvider;
    readonly text: string;
    readonly style?: string;
    readonly voice?: string;
    readonly language?: string;
  },
  signal?: AbortSignal,
) => Promise<VoiceSynthesizeResponse>;

const OUTPUT_SAMPLE_RATE = 24_000;
const MAX_TIMELINE_SECONDS = 60;

function ensureActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("취소했어요.", "AbortError");
}

export function decodeBase64Audio(value: string): ArrayBuffer {
  const clean = value.replace(/\s+/gu, "");
  if (!clean) throw new Error("음성 제공처가 빈 오디오를 반환했어요.");
  let binary: string;
  try {
    binary = atob(clean);
  } catch {
    throw new Error("음성 제공처의 오디오 형식을 해석하지 못했어요.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

/** Encodes a mono Float32 signal as a standard 16-bit little-endian PCM WAV. */
export function encodeMonoPcm16Wave(samples: Float32Array, sampleRate: number): Blob {
  if (!Number.isFinite(sampleRate) || sampleRate < 8_000 || sampleRate > 192_000) {
    throw new Error("오디오 샘플 레이트가 올바르지 않아요.");
  }
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    const pcm = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
    view.setInt16(44 + index * 2, pcm, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function validateRequest(request: PromoCloudVoiceRenderRequest): void {
  if (
    !Number.isFinite(request.durationSec)
    || request.durationSec <= 0
    || request.durationSec > MAX_TIMELINE_SECONDS
  ) {
    throw new Error("클라우드 음성 타임라인은 60초 이하로 준비해 주세요.");
  }
  if (request.clips.length === 0 || request.clips.length > 48) {
    throw new Error("생성할 대사 클립 수가 올바르지 않아요.");
  }
  for (const clip of request.clips) {
    if (!clip.text.trim() || clip.text.length > 1_500) {
      throw new Error("각 대사는 1,500자 이하로 입력해 주세요.");
    }
    if (
      !Number.isFinite(clip.startSec)
      || !Number.isFinite(clip.durationSec)
      || clip.startSec < 0
      || clip.durationSec <= 0
      || clip.startSec + clip.durationSec > request.durationSec + 0.001
    ) {
      throw new Error("대사 타임라인이 영상 길이를 벗어났어요.");
    }
  }
}

export async function renderPromoCloudVoiceTimeline(
  request: PromoCloudVoiceRenderRequest,
  options: {
    readonly signal?: AbortSignal;
    readonly onProgress?: (completed: number, total: number) => void;
    readonly synthesize?: VoiceSynthesizer;
  } = {},
): Promise<PromoCloudVoiceRenderResult> {
  validateRequest(request);
  ensureActive(options.signal);
  if (typeof AudioContext === "undefined" || typeof OfflineAudioContext === "undefined") {
    throw new Error("이 브라우저는 클라우드 음성 합성을 위한 오디오 렌더링을 지원하지 않아요.");
  }
  const synthesize = options.synthesize ?? creatorIntelligenceClient.voiceSynthesize;
  const decoder = new AudioContext();
  const decoded: Array<{
    readonly clip: PromoCloudVoiceClipInput;
    readonly buffer: AudioBuffer;
  }> = [];
  const overrunClipIds: string[] = [];
  try {
    for (let index = 0; index < request.clips.length; index += 1) {
      ensureActive(options.signal);
      const clip = request.clips[index]!;
      const response = await synthesize({
        provider: request.provider,
        text: clip.text,
        ...(clip.style ? { style: clip.style } : {}),
        ...(clip.voice ? { voice: clip.voice } : {}),
        ...(clip.language ? { language: clip.language } : {}),
      }, options.signal);
      if (response.status !== "ready" || !response.audioBase64 || !response.mimeType) {
        throw new Error(
          response.status === "not_configured"
            ? "선택한 클라우드 음성 제공처가 아직 연결되지 않았어요."
            : "선택한 클라우드 음성 제공처를 지금 사용할 수 없어요.",
        );
      }
      const audio = decodeBase64Audio(response.audioBase64);
      const buffer = await decoder.decodeAudioData(audio.slice(0));
      if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) {
        throw new Error("생성된 음성의 길이를 확인하지 못했어요.");
      }
      if (buffer.duration > clip.durationSec + 0.08) overrunClipIds.push(clip.id);
      decoded.push({ clip, buffer });
      options.onProgress?.(index + 1, request.clips.length);
    }
  } finally {
    await decoder.close().catch(() => undefined);
  }

  ensureActive(options.signal);
  const frameCount = Math.max(1, Math.ceil(request.durationSec * OUTPUT_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frameCount, OUTPUT_SAMPLE_RATE);
  for (const { clip, buffer } of decoded) {
    const source = offline.createBufferSource();
    const gain = offline.createGain();
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(offline.destination);
    const playable = Math.min(
      buffer.duration,
      clip.durationSec,
      Math.max(0, request.durationSec - clip.startSec),
    );
    if (playable > 0) {
      const start = clip.startSec;
      const end = start + playable;
      const fade = Math.min(0.02, playable / 4);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.96, start + fade);
      gain.gain.setValueAtTime(0.96, Math.max(start + fade, end - fade));
      gain.gain.linearRampToValueAtTime(0, end);
      source.start(start, 0, playable);
    }
  }
  const rendered = await offline.startRendering();
  ensureActive(options.signal);
  const blob = encodeMonoPcm16Wave(rendered.getChannelData(0), rendered.sampleRate);
  return {
    blob,
    provider: request.provider,
    generatedClipCount: decoded.length,
    overrunClipIds,
  };
}
