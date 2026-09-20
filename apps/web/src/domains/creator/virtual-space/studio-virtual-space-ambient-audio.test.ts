import { describe, expect, it, vi } from "vitest";
import { acquireStudioHuddleAudioFocus, studioHuddleAudioFocusSnapshot } from "../live/huddle/studio-p2p-huddle-audio-focus";
import { StudioVirtualAmbientAudioController, type StudioAmbientAudioDependencies } from "./studio-virtual-space-ambient-audio";

function fixture(options: { load?: StudioAmbientAudioDependencies["load"]; resume?: () => Promise<void>; decode?: () => Promise<{ duration: number; numberOfChannels: number }> } = {}) {
  const sources: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; loop: boolean }> = [];
  const gain = { gain: { value: 0, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
  const context = { currentTime: 1, destination: {}, resume: options.resume ?? vi.fn(async () => undefined), suspend: vi.fn(async () => undefined), close: vi.fn(async () => undefined),
    decodeAudioData: vi.fn(options.decode ?? (async () => ({ duration: 45, numberOfChannels: 2 }))), createGain: () => gain,
    createBufferSource: () => { const source = { start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), connect: vi.fn(), loop: false }; sources.push(source); return source; } };
  const deps = { createContext: vi.fn(() => context as unknown as AudioContext), load: vi.fn(options.load ?? (async () => new ArrayBuffer(1))) };
  const controller = new StudioVirtualAmbientAudioController(deps);
  return { controller, deps, context, sources, gain };
}
const settle = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };

describe("virtual ambient audio ownership", () => {
  it("creates no audio/network resources until explicit opt-in and keeps ducking separate from playback consent", async () => {
    const f = fixture(); f.controller.setEnvironment(null, true);
    expect(f.deps.createContext).not.toHaveBeenCalled(); expect(f.deps.load).not.toHaveBeenCalled();
    f.controller.setEnabled(true); await settle();
    expect(f.sources).toHaveLength(1); expect(f.sources[0].loop).toBe(true);
    expect(f.gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.09, 1, .04);
    f.controller.setEnvironment(null, false);
    expect(f.gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.6, 1, .18);
    f.controller.setEnabled(false);
    expect(f.sources[0].stop).toHaveBeenCalledOnce(); expect(f.context.close).toHaveBeenCalledOnce();
    expect(f.controller.snapshot().phase).toBe("off"); f.controller.dispose();
  });
  it.each(["focus", "away", "hidden", "blur", "world"] as const)("suspends %s locally and resumes only an existing opt-in", async (reason) => {
    const f = fixture(); f.controller.setEnabled(true); await settle();
    f.controller.setEnvironment(reason, false);
    expect(f.sources[0].stop).toHaveBeenCalledOnce(); expect(f.context.suspend).toHaveBeenCalledOnce();
    expect(f.controller.snapshot().phase).toBe("paused");
    f.controller.setEnvironment(null, false); await settle();
    expect(f.sources).toHaveLength(2); expect(f.deps.load).toHaveBeenCalledOnce();
    f.controller.setEnabled(false); f.controller.setEnvironment(reason, false); f.controller.setEnvironment(null, false);
    expect(f.sources).toHaveLength(2); f.controller.dispose();
  });
  it.each(["off", "dispose", "focus", "track"] as const)("discards delayed loads after %s without starting stale sound", async (action) => {
    let complete!: (bytes: ArrayBuffer) => void;
    const f = fixture({ load: () => new Promise((resolve) => { complete = resolve; }) });
    f.controller.setEnabled(true); await settle();
    const originalComplete = complete;
    if (action === "off") f.controller.setEnabled(false);
    else if (action === "dispose") f.controller.dispose();
    else if (action === "focus") f.controller.setEnvironment("focus", false);
    else f.controller.selectTrack("window-rain");
    originalComplete(new ArrayBuffer(1)); await settle();
    expect(f.sources).toHaveLength(0); expect(f.context.decodeAudioData).not.toHaveBeenCalled();
    f.controller.dispose();
  });
  it.each(["off", "dispose", "focus"] as const)("discards an already-decoding recording after %s", async (action) => {
    let complete!: (buffer: { duration: number; numberOfChannels: number }) => void;
    const f = fixture({ decode: () => new Promise((resolve) => { complete = resolve; }) });
    f.controller.setEnabled(true); await settle();
    expect(f.context.decodeAudioData).toHaveBeenCalledOnce();
    if (action === "off") f.controller.setEnabled(false);
    else if (action === "dispose") f.controller.dispose();
    else f.controller.setEnvironment("focus", false);
    complete({ duration: 45, numberOfChannels: 2 }); await settle();
    expect(f.sources).toHaveLength(0);
    f.controller.dispose();
  });
  it("keeps ducking while another joined Huddle owner remains", () => {
    const releaseFirst = acquireStudioHuddleAudioFocus();
    const releaseSecond = acquireStudioHuddleAudioFocus();
    expect(studioHuddleAudioFocusSnapshot()).toBe(true);
    releaseFirst(); releaseFirst();
    expect(studioHuddleAudioFocusSnapshot()).toBe(true);
    releaseSecond();
    expect(studioHuddleAudioFocusSnapshot()).toBe(false);
  });
  it("releases a rejected autoplay context and waits for a new explicit retry", async () => {
    const f = fixture({ resume: async () => { throw new Error("gesture required"); } });
    f.controller.setEnabled(true); await settle();
    expect(f.controller.snapshot()).toMatchObject({ enabled: false, phase: "error" });
    expect(f.context.close).toHaveBeenCalledOnce(); expect(f.deps.load).not.toHaveBeenCalled();
    f.controller.setEnvironment(null, false); await settle(); expect(f.deps.createContext).toHaveBeenCalledOnce();
  });
  it("ignores invalid volume and unknown recordings, bounds one selected buffer, and destroys on scope disposal", async () => {
    const f = fixture(); f.controller.selectTrack("unknown" as never); f.controller.setVolume(NaN);
    expect(f.controller.snapshot()).toMatchObject({ trackId: "gentle-rain", volume: .6 });
    f.controller.setVolume(2); expect(f.controller.snapshot().volume).toBe(1);
    f.controller.setEnabled(true); await settle(); f.controller.dispose(); f.controller.setEnabled(true);
    expect(f.context.close).toHaveBeenCalledOnce(); expect(f.sources[0].disconnect).toHaveBeenCalledOnce(); expect(f.sources).toHaveLength(1);
  });
});
