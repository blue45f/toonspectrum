import { ANIMATIC_WORKSPACE_LIMITS, type StudioAnimaticAudioTrack } from "./studio-animatic-workspace";

export function studioAnimaticWaveform(channels: readonly Float32Array[], bins: number = ANIMATIC_WORKSPACE_LIMITS.waveformBins): number[] {
  const length = channels[0]?.length ?? 0;
  if (length === 0) return [];
  const count = Math.max(1, Math.min(bins, ANIMATIC_WORKSPACE_LIMITS.waveformBins, length));
  return Array.from({ length: count }, (_, bin) => {
    const start = Math.floor(bin * length / count);
    const end = Math.max(start + 1, Math.floor((bin + 1) * length / count));
    let peak = 0;
    for (const channel of channels) {
      for (let index = start; index < end; index += Math.max(1, Math.floor((end - start) / 256))) {
        const value = Math.abs(channel[index] ?? 0);
        if (Number.isFinite(value)) peak = Math.max(peak, Math.min(1, value));
      }
    }
    return peak;
  });
}

export interface StudioAnimaticAudioSchedule {
  readonly trackId: string;
  readonly delaySec: number;
  readonly offsetSec: number;
  readonly durationSec: number;
  readonly volume: number;
}

export function planStudioAnimaticAudio(tracks: readonly StudioAnimaticAudioTrack[], playheadMs: number, endMs: number): StudioAnimaticAudioSchedule[] {
  return tracks.flatMap((track) => {
    if (track.muted || track.volume <= 0) return [];
    const clipEnd = track.startMs + track.trimEndMs - track.trimStartMs;
    const from = Math.max(playheadMs, track.startMs);
    const until = Math.min(endMs, clipEnd);
    if (until <= from) return [];
    return [{ trackId: track.id, delaySec: (from - playheadMs) / 1000, offsetSec: (track.trimStartMs + from - track.startMs) / 1000, durationSec: (until - from) / 1000, volume: track.volume }];
  });
}

export function scheduleStudioAnimaticAudio(
  context: AudioContext,
  destination: AudioNode,
  tracks: readonly StudioAnimaticAudioTrack[],
  buffers: ReadonlyMap<string, AudioBuffer>,
  playheadMs: number,
  endMs: number,
  origin = context.currentTime,
): () => void {
  const scheduled = planStudioAnimaticAudio(tracks, playheadMs, endMs).map((item) => {
    const track = tracks.find((value) => value.id === item.trackId)!;
    const buffer = buffers.get(track.asset.hash);
    if (!buffer) throw new Error(`오디오를 불러오지 못했습니다: ${track.name}`);
    return { item, buffer };
  });
  const release = new Set<() => void>();
  const stop = () => { for (const dispose of [...release]) dispose(); };
  try {
    for (const { item, buffer } of scheduled) {
      const duration = Math.min(item.durationSec, Math.max(0, buffer.duration - item.offsetSec));
      if (duration <= 0) continue;
      const source = context.createBufferSource();
      let gain: GainNode | null = null;
      let released = false;
      const dispose = () => {
        if (released) return;
        released = true;
        release.delete(dispose);
        source.onended = null;
        try { source.stop(); } catch { /* Not started or already ended. */ }
        source.disconnect();
        gain?.disconnect();
      };
      release.add(dispose);
      gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = item.volume;
      source.connect(gain);
      gain.connect(destination);
      source.onended = dispose;
      source.start(origin + item.delaySec, item.offsetSec, duration);
    }
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}
