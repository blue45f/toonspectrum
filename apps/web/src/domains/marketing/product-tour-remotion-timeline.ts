import { interpolate } from "remotion";

import { PRODUCT_TOUR_RUNTIME_AUDIO } from "./product-tour-audio.generated";
import type { ProductTourLocale } from "./product-tour-content";

const DUCKED_GAIN = 0.24;
const DUCK_ATTACK_SECONDS = 0.35;
const DUCK_RELEASE_SECONDS = 0.7;
const CAPTION_TAIL_SECONDS = 0.8;

function cueGainAtSecond(second: number, start: number, end: number): number {
  if (second < start - DUCK_ATTACK_SECONDS || second > end + DUCK_RELEASE_SECONDS) return 1;
  if (second < start) {
    return interpolate(second, [start - DUCK_ATTACK_SECONDS, start], [1, DUCKED_GAIN], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }
  if (second <= end) return DUCKED_GAIN;
  return interpolate(second, [end, end + DUCK_RELEASE_SECONDS], [DUCKED_GAIN, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

export function productTourBgmGainAtFrame(frame: number, fps: number): number {
  const second = frame / fps;
  return PRODUCT_TOUR_RUNTIME_AUDIO.cues.reduce((gain, cue) => {
    const cueEnd = cue.start + cue.duration;
    return Math.min(gain, cueGainAtSecond(second, cue.start, cueEnd));
  }, 1);
}

export function productTourCaptionAtFrame(
  frame: number,
  fps: number,
  locale: ProductTourLocale,
): string | null {
  const second = frame / fps;
  for (let index = 0; index < PRODUCT_TOUR_RUNTIME_AUDIO.cues.length; index += 1) {
    const cue = PRODUCT_TOUR_RUNTIME_AUDIO.cues[index];
    const nextStart = PRODUCT_TOUR_RUNTIME_AUDIO.cues[index + 1]?.start
      ?? PRODUCT_TOUR_RUNTIME_AUDIO.duration;
    const end = Math.min(
      nextStart - 0.25,
      cue.start + cue.duration + CAPTION_TAIL_SECONDS,
    );
    if (second >= cue.start && second <= end) return cue[locale];
  }
  return null;
}
