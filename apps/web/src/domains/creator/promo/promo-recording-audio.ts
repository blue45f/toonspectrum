import { PROMO_FPS, promoFrameCount, promoMusicGain, promoVoiceGain } from "./promo-model";

import type { PromoProject } from "./promo-model";

/** Schedule the whole envelope on the audio clock, not the UI/rendering thread.
 * Linear ramps preserve the frame-based mix while avoiding zipper noise or a
 * missed narration duck when canvas work temporarily delays animation frames.
 */
export function schedulePromoRecordingGains(project: PromoProject, music: AudioParam | null, voice: AudioParam | null, startAt: number): void {
  const tracks = [
    { param: music, gain: promoMusicGain },
    { param: voice, gain: promoVoiceGain },
  ];
  for (const { param, gain } of tracks) {
    if (!param) continue;
    param.cancelScheduledValues(startAt);
    param.setValueAtTime(gain(project, 0), startAt);
    for (let frame = 1; frame <= promoFrameCount(project); frame += 1) {
      param.linearRampToValueAtTime(gain(project, frame), startAt + frame / PROMO_FPS);
    }
  }
}
