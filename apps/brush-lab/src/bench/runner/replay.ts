import type { RawSample } from "../../engine/core/types";

/**
 * 리플레이 프레임 분할. 레인의 `addSamples`는 프레임당 1회 호출 계약이므로 fixture 샘플을
 * tMs 경계로 프레임 배치로 나눈다. 규칙은 engine `splitFrames`와 같다:
 * 프레임 k의 창은 [t0 + k·frameMs·speed, t0 + (k+1)·frameMs·speed)이며 빈 프레임은 내보내지 않는다.
 * 총 샘플 수와 순서는 보존된다(tMs가 역행하면 현재 프레임에 머문다).
 */

export const DEFAULT_FRAME_MS = 1000 / 60;

export function* replayFrames(
  samples: readonly RawSample[],
  frameMs: number = DEFAULT_FRAME_MS,
  speed = 1,
): Generator<RawSample[], void, undefined> {
  if (!(frameMs > 0)) throw new RangeError(`replayFrames: frameMs must be > 0, got ${frameMs}`);
  if (!(speed > 0)) throw new RangeError(`replayFrames: speed must be > 0, got ${speed}`);
  if (samples.length === 0) return;
  const window = frameMs * speed;
  const t0 = samples[0]?.tMs ?? 0;
  let frameIndex = 0;
  let current: RawSample[] = [];
  for (const s of samples) {
    const k = Math.max(frameIndex, Math.floor((s.tMs - t0) / window));
    if (k > frameIndex && current.length > 0) {
      yield current;
      current = [];
    }
    frameIndex = k;
    current.push(s);
  }
  if (current.length > 0) yield current;
}

/** 배열 형태(테스트·동기 러너용). */
export function replayFrameList(
  samples: readonly RawSample[],
  frameMs: number = DEFAULT_FRAME_MS,
  speed = 1,
): RawSample[][] {
  return Array.from(replayFrames(samples, frameMs, speed));
}

/** 프레임 분할이 샘플을 보존했는지(개수·순서) 검사한다. */
export function framesPreserveSamples(frames: readonly (readonly RawSample[])[], samples: readonly RawSample[]): boolean {
  let i = 0;
  for (const frame of frames) {
    for (const s of frame) {
      if (samples[i] !== s) return false;
      i += 1;
    }
  }
  return i === samples.length;
}
