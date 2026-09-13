import { describe, expect, it, vi } from "vitest";

import { emptyPromoProject, PROMO_FPS, promoMusicGain, promoVoiceGain } from "./promo-model";
import { schedulePromoRecordingGains } from "./promo-recording-audio";

function parameter() {
  const calls = { cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
  return { calls, param: calls as unknown as AudioParam };
}
describe("recording audio clock", () => {
  it("schedules both envelopes to the selected timeline boundary without UI ticks", () => {
    const project = { ...emptyPromoProject(), audio: { src: "", volume: 0.5 },
      voiceover: { src: "", volume: 0.8, startSec: 2, durationSec: 1 } };
    const music = parameter(); const voice = parameter();
    schedulePromoRecordingGains(project, music.param, voice.param, 10);
    for (const track of [music, voice]) {
      expect(track.calls.cancelScheduledValues).toHaveBeenCalledWith(10);
      expect(track.calls.setValueAtTime).toHaveBeenCalledWith(0, 10);
      expect(track.calls.linearRampToValueAtTime).toHaveBeenCalledTimes(450);
      expect(track.calls.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 25);
    }
    for (let frame = 1; frame <= 450; frame += 1) {
      expect(music.calls.linearRampToValueAtTime.mock.calls[frame - 1]).toEqual([promoMusicGain(project, frame), 10 + frame / PROMO_FPS]);
      expect(voice.calls.linearRampToValueAtTime.mock.calls[frame - 1]).toEqual([promoVoiceGain(project, frame), 10 + frame / PROMO_FPS]);
    }
    expect(music.calls.linearRampToValueAtTime.mock.calls[74]?.[0]).toBeCloseTo(0.14);
    expect(voice.calls.linearRampToValueAtTime.mock.calls[74]?.[0]).toBe(0.8);
  });
  it("allows silent, music-only and voice-only exports", () => {
    const project = emptyPromoProject(); const music = parameter(); const voice = parameter();
    expect(() => schedulePromoRecordingGains(project, null, null, 0)).not.toThrow();
    schedulePromoRecordingGains(project, music.param, null, 0);
    schedulePromoRecordingGains(project, null, voice.param, 0);
    expect(music.calls.linearRampToValueAtTime).toHaveBeenCalledTimes(450);
    expect(voice.calls.linearRampToValueAtTime).toHaveBeenCalledTimes(450);
  });
  it("clips narration at the selected duration and leaves muted narration unducked", () => {
    const project = { ...emptyPromoProject(), seconds: 60 as const, audio: { src: "", volume: 0.5 },
      voiceover: { src: "", volume: 0, startSec: 59, durationSec: 10 } };
    const music = parameter(); const voice = parameter();
    schedulePromoRecordingGains(project, music.param, voice.param, 5);
    expect(voice.calls.linearRampToValueAtTime).toHaveBeenCalledTimes(1800);
    expect(voice.calls.linearRampToValueAtTime.mock.calls.every(([gain]) => gain === 0)).toBe(true);
    expect(music.calls.linearRampToValueAtTime.mock.calls[1739]?.[0]).toBe(0.5);
    expect(music.calls.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 65);
  });
});
