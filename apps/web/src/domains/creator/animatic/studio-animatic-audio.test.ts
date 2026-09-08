import { describe, expect, it, vi } from "vitest";

import { planStudioAnimaticAudio, scheduleStudioAnimaticAudio, studioAnimaticWaveform } from "./studio-animatic-audio";

import type { StudioAnimaticAudioTrack } from "./studio-animatic-workspace";

const track = (id = "a", changes: Partial<StudioAnimaticAudioTrack> = {}): StudioAnimaticAudioTrack => ({
  id, name: id, asset: { hash: `sha256:${id.repeat(64)}`, bytes: 20, mime: "audio/wav" },
  startMs: 1000, durationMs: 5000, trimStartMs: 500, trimEndMs: 4500,
  volume: 0.7, muted: false, waveform: [], ...changes,
});
function harness() {
  const sources: Array<{ buffer: AudioBuffer | null; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended: (() => void) | null }> = [];
  const gains: Array<{ gain: { value: number }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  const context = {
    currentTime: 10,
    createBufferSource: vi.fn(() => {
      const source = { buffer: null, start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: null };
      sources.push(source); return source;
    }),
    createGain: vi.fn(() => { const gain = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }; gains.push(gain); return gain; }),
  };
  return { context: context as unknown as AudioContext, mocks: context, sources, gains, destination: {} as AudioNode };
}
const buffers = (...tracks: StudioAnimaticAudioTrack[]) => new Map(tracks.map((item) => [item.asset.hash, { duration: 5 } as AudioBuffer]));

describe("animatic audio scheduling", () => {
  it("starts inside trimmed media when seeking and clips playback to the timeline end", () => {
    expect(planStudioAnimaticAudio([track()], 2000, 4000)).toEqual([
      { trackId: "a", delaySec: 0, offsetSec: 1.5, durationSec: 2, volume: 0.7 },
    ]);
    expect(planStudioAnimaticAudio([track()], 0, 6000)[0]?.delaySec).toBe(1);
    expect(planStudioAnimaticAudio([track("a", { muted: true }), track("b", { volume: 0 })], 0, 6000)).toEqual([]);
  });
  it("rejects missing media before starting any other track", () => {
    const h = harness(), a = track(), b = track("b");
    expect(() => scheduleStudioAnimaticAudio(h.context, h.destination, [a, b], buffers(a), 0, 6000)).toThrow("b");
    expect(h.mocks.createBufferSource).not.toHaveBeenCalled();
  });
  it("releases sources and gains exactly once on cancellation or natural end", () => {
    const h = harness(), a = track();
    const stop = scheduleStudioAnimaticAudio(h.context, h.destination, [a], buffers(a), 0, 6000);
    expect(h.sources[0]?.start).toHaveBeenCalledWith(11, 0.5, 4);
    expect(h.gains[0]?.gain.value).toBe(0.7);
    h.sources[0]?.onended?.(); stop(); stop();
    expect(h.sources[0]?.disconnect).toHaveBeenCalledOnce();
    expect(h.gains[0]?.disconnect).toHaveBeenCalledOnce();
  });
  it("rolls back the already started batch if a later node cannot be created", () => {
    const h = harness(), a = track(), b = track("b");
    const createGain = h.mocks.createGain.getMockImplementation()!;
    h.mocks.createGain.mockImplementationOnce(createGain).mockImplementationOnce(() => { throw new Error("node capacity"); });
    expect(() => scheduleStudioAnimaticAudio(h.context, h.destination, [a, b], buffers(a, b), 0, 6000)).toThrow("node capacity");
    expect(h.sources).toHaveLength(2);
    for (const source of h.sources) expect(source.disconnect).toHaveBeenCalledOnce();
    expect(h.gains[0]?.disconnect).toHaveBeenCalledOnce();
  });
  it("bounds and combines multichannel waveform peaks", () => {
    expect(studioAnimaticWaveform([Float32Array.of(-0.2, 0.6, Number.NaN, 0.2), Float32Array.of(0.4, 0.1, 2, 0.3)], 2)).toEqual([expect.closeTo(0.6), 1]);
    expect(studioAnimaticWaveform([], 256)).toEqual([]);
  });
});
