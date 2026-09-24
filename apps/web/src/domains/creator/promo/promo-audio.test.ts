import { describe, expect, it, vi } from "vitest";

import {
  preparePromoAudioPreview,
  schedulePromoPreviewGains,
  type PromoAudioPreviewScope,
} from "./promo-audio";
import {
  emptyPromoProject,
  PROMO_FPS,
  promoMusicGain,
  promoVoiceGain,
  type PromoProject,
} from "./promo-model";

function parameter() {
  const calls = {
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
  return { calls, param: { value: 0, ...calls } as unknown as AudioParam };
}

function project(overrides: Partial<PromoProject> = {}): PromoProject {
  return {
    ...emptyPromoProject(),
    audio: { src: "music", volume: 0.5 },
    voiceover: { src: "voice", volume: 0.8, startSec: 2, durationSec: 8 },
    ...overrides,
  };
}

class FakeSource {
  buffer: AudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly start = vi.fn();
  readonly stop = vi.fn();
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

class FakeGain {
  readonly gain = parameter().param;
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

class FakeAudioContext {
  static latest: FakeAudioContext | null = null;
  readonly currentTime = 4;
  readonly destination = {} as AudioDestinationNode;
  readonly sources: FakeSource[] = [];
  readonly gains: FakeGain[] = [];
  state: AudioContextState = "running";
  private decodeIndex = 0;

  constructor() { FakeAudioContext.latest = this; }
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => { this.state = "closed"; });
  decodeAudioData = vi.fn(async () => {
    this.decodeIndex += 1;
    return { duration: this.decodeIndex === 1 ? 3 : 8 } as AudioBuffer;
  });
  createBufferSource = vi.fn(() => {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  });
  createGain = vi.fn(() => {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  });
}

function scope(): PromoAudioPreviewScope {
  return {
    AudioContext: FakeAudioContext as unknown as typeof AudioContext,
    fetch: vi.fn(async () => new Response(new Uint8Array([1]))) as typeof fetch,
  };
}

describe("promo seeked audio preview", () => {
  it("ramps both tracks in from silence and keeps a continuous frame envelope", () => {
    const value = project();
    const music = parameter();
    const voice = parameter();
    const startFrame = 5 * PROMO_FPS;

    schedulePromoPreviewGains(value, music.param, voice.param, startFrame, 10);

    for (const track of [music, voice]) {
      expect(track.calls.cancelScheduledValues).toHaveBeenCalledWith(10);
      expect(track.calls.setValueAtTime).toHaveBeenCalledWith(0, 10);
      expect(track.calls.linearRampToValueAtTime).toHaveBeenCalled();
      expect(track.calls.linearRampToValueAtTime.mock.calls[0]?.[1]).toBeCloseTo(10.02);
    }
    expect(music.calls.linearRampToValueAtTime.mock.calls[0]?.[0]).toBeCloseTo(
      promoMusicGain(value, startFrame),
    );
    expect(voice.calls.linearRampToValueAtTime.mock.calls[0]?.[0]).toBeCloseTo(
      promoVoiceGain(value, startFrame),
    );
    expect(voice.calls.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 20);
  });

  it("starts BGM and narration on one audio clock at exact middle offsets", async () => {
    const controller = new AbortController();
    const handle = await preparePromoAudioPreview(project(), controller.signal, scope());
    handle?.start(5 * PROMO_FPS);

    const context = FakeAudioContext.latest!;
    expect(context.sources).toHaveLength(2);
    expect(context.sources[0]!.start).toHaveBeenCalledWith(4.01, 2);
    expect(context.sources[0]!.stop).toHaveBeenCalledWith(14.01);
    expect(context.sources[1]!.start).toHaveBeenCalledWith(4.01, 3);
    expect(context.sources[1]!.stop).toHaveBeenCalledWith(9.01);
    expect(context.gains).toHaveLength(2);
  });

  it("delays narration when seeking before its start and omits it after its end", async () => {
    const before = await preparePromoAudioPreview(project(), new AbortController().signal, scope());
    before?.start(PROMO_FPS);
    let context = FakeAudioContext.latest!;
    expect(context.sources[1]!.start).toHaveBeenCalledWith(5.01, 0);

    const after = await preparePromoAudioPreview(project(), new AbortController().signal, scope());
    after?.start(12 * PROMO_FPS);
    context = FakeAudioContext.latest!;
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]!.start).toHaveBeenCalledWith(4.01, 0);
  });

  it("stops every source and closes the shared context exactly once", async () => {
    const controller = new AbortController();
    const handle = await preparePromoAudioPreview(project(), controller.signal, scope());
    handle?.start(3 * PROMO_FPS);
    const context = FakeAudioContext.latest!;

    handle?.stop();
    handle?.stop();

    expect(context.sources.every((source) => source.stop.mock.calls.length >= 1)).toBe(true);
    expect(context.close).toHaveBeenCalledOnce();
  });
});
