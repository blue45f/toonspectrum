import { afterEach, describe, expect, it, vi } from "vitest";

import {
  smoothRawChannels,
  convertChannelsToVrmData,
  createChannelSmoother,
  disposePhotoPoseLandmarker,
  GAZE_PITCH_MAX_DEG,
  GAZE_YAW_MAX_DEG,
  initPhotoPoseLandmarker,
  NEUTRAL_CHANNELS,
  type TrackingChannels,
  type TrackingOptions,
} from "./studio-vrm-webcam-tracking";

const mockChannels: TrackingChannels = {
  headPitch: 0.1,
  headYaw: 0.2,
  headRoll: -0.1,
  blinkLeft: 0.3,
  blinkRight: 0.4,
  gazeX: 0.5,
  gazeY: -0.2,
  mouthOpen: 0.6,
  mouthSmile: 0.7,
  browInnerUp: 0.1,
  browOuterUpLeft: 0.2,
  browOuterUpRight: 0.3,
  browDown: 0.15,
  mouthFrown: 0.25,
  eyeWide: 0.35,
};

describe("studio-vrm-webcam-tracking", () => {
  describe("smoothRawChannels", () => {
    it("이전 채널 값이 null이면 새 채널 값을 그대로 반환한다", () => {
      const smoothed = smoothRawChannels(null, mockChannels, 0.35);
      expect(smoothed).toEqual(mockChannels);
    });

    it("EMA 가중치에 따라 두 채널 값을 보간한다", () => {
      const prev: TrackingChannels = {
        ...mockChannels,
        headYaw: 0.0,
        mouthOpen: 0.0,
      };
      const smoothed = smoothRawChannels(prev, mockChannels, 0.5);
      expect(smoothed.headYaw).toBeCloseTo(0.1);
      expect(smoothed.mouthOpen).toBeCloseTo(0.3);
      expect(smoothed.headPitch).toBeCloseTo(0.1);
    });
  });

  describe("convertChannelsToVrmData", () => {
    it("기본 옵션(미러링 활성)으로 적절하게 매핑한다", () => {
      const options: TrackingOptions = {
        gazeLock: false,
        mirrorMode: true,
        sensitivity: 1.0,
        smoothing: 0.35,
        fingerTracking: true,
      };

      const result = convertChannelsToVrmData(mockChannels, options);

      expect(result.bones.head[1]).toBeCloseTo(0.2 * -0.7);
      expect(result.bones.neck[1]).toBeCloseTo(0.2 * -0.3);
      expect(result.bones.head[2]).toBeCloseTo(-0.1 * -0.7);
      expect(result.expressions.blinkLeft).toBeCloseTo(0.4);
      expect(result.expressions.blinkRight).toBeCloseTo(0.3);
      expect(result.expressions.lookLeft).toBeCloseTo(0.5);
      expect(result.expressions.lookRight).toBeCloseTo(0);
      expect(result.expressions.aa).toBeCloseTo(0.6);
      expect(result.expressions.happy).toBeCloseTo(0.7);
    });

    it("감정 표현(surprised/angry/sad)을 블렌드셰이프에서 유도한다", () => {
      const options: TrackingOptions = {
        gazeLock: false,
        mirrorMode: false,
        sensitivity: 1.0,
        smoothing: 0.35,
        fingerTracking: true,
      };
      const result = convertChannelsToVrmData(mockChannels, options);
      // eyeWide 0.35, browInnerUp 0.1 → surprised ≈ 0.35*0.85 + 0.1*0.25
      expect(result.expressions.surprised).toBeCloseTo(0.35 * 0.85 + 0.1 * 0.25, 4);
      // browDown 0.15 → angry ≈ 0.15*0.95
      expect(result.expressions.angry).toBeCloseTo(0.15 * 0.95, 4);
      // mouthFrown 0.25, browInnerUp 0.1 → sad ≈ 0.25*0.7 + 0.1*0.3
      expect(result.expressions.sad).toBeCloseTo(0.25 * 0.7 + 0.1 * 0.3, 4);
    });

    it("미러링 비활성화 상태에서 부호 및 좌우 채널을 유지한다", () => {
      const options: TrackingOptions = {
        gazeLock: false,
        mirrorMode: false,
        sensitivity: 1.0,
        smoothing: 0.35,
        fingerTracking: true,
      };

      const result = convertChannelsToVrmData(mockChannels, options);

      expect(result.bones.head[1]).toBeCloseTo(0.2 * 0.7);
      expect(result.expressions.blinkLeft).toBeCloseTo(0.3);
      expect(result.expressions.blinkRight).toBeCloseTo(0.4);
      expect(result.expressions.lookLeft).toBe(0);
      expect(result.expressions.lookRight).toBeCloseTo(0.5);
    });

    it("시선 고정 옵션이 켜지면 시선 관련 표정 가중치를 0으로 만든다", () => {
      const options: TrackingOptions = {
        gazeLock: true,
        mirrorMode: true,
        sensitivity: 1.0,
        smoothing: 0.35,
        fingerTracking: true,
      };

      const result = convertChannelsToVrmData(mockChannels, options);
      expect(result.expressions.lookLeft).toBe(0);
      expect(result.expressions.lookRight).toBe(0);
      expect(result.expressions.lookUp).toBe(0);
      expect(result.expressions.lookDown).toBe(0);
    });

    it("감도 조절 값을 뼈 회전 및 표정 가중치에 곱한다", () => {
      const options: TrackingOptions = {
        gazeLock: false,
        mirrorMode: false,
        sensitivity: 1.5,
        smoothing: 0.35,
        fingerTracking: true,
      };

      const result = convertChannelsToVrmData(mockChannels, options);

      expect(result.bones.head[1]).toBeCloseTo(0.2 * 1.5 * 0.7);
      expect(result.expressions.browInnerUp).toBeCloseTo(0.1 * 1.5);
      expect(result.expressions.aa).toBeCloseTo(0.9);
      expect(result.expressions.happy).toBeCloseTo(1.0);
    });

    it("lookAt을 도 단위로 출력한다: gazeX=1 → yawDeg=상한, 미러 시 부호 반전", () => {
      const options: TrackingOptions = {
        gazeLock: false,
        mirrorMode: false,
        sensitivity: 1.0,
        smoothing: 0.35,
        fingerTracking: true,
      };
      const channels: TrackingChannels = { ...mockChannels, gazeX: 1, gazeY: 0.5 };

      const straight = convertChannelsToVrmData(channels, options);
      expect(straight.lookAt).toBeDefined();
      expect(straight.lookAt!.yawDeg).toBeCloseTo(GAZE_YAW_MAX_DEG);
      expect(straight.lookAt!.pitchDeg).toBeCloseTo(0.5 * GAZE_PITCH_MAX_DEG);

      const mirrored = convertChannelsToVrmData(channels, { ...options, mirrorMode: true });
      expect(mirrored.lookAt!.yawDeg).toBeCloseTo(-GAZE_YAW_MAX_DEG);
      expect(mirrored.lookAt!.pitchDeg).toBeCloseTo(0.5 * GAZE_PITCH_MAX_DEG); // 상하는 반전 없음
    });

    it("gazeLock이 켜지면 lookAt도 0으로 고정된다", () => {
      const options: TrackingOptions = {
        gazeLock: true,
        mirrorMode: true,
        sensitivity: 1.0,
        smoothing: 0.35,
        fingerTracking: true,
      };
      const result = convertChannelsToVrmData({ ...mockChannels, gazeX: 1, gazeY: -1 }, options);
      expect(result.lookAt!.yawDeg).toBe(0);
      expect(result.lookAt!.pitchDeg).toBe(0);
    });
  });

  describe("NEUTRAL_CHANNELS", () => {
    it("모든 트래킹 채널을 0으로 갖는다(제로 스냅 대신 감쇠 복귀의 목표값)", () => {
      expect(Object.keys(NEUTRAL_CHANNELS).sort()).toEqual(Object.keys(mockChannels).sort());
      for (const value of Object.values(NEUTRAL_CHANNELS)) expect(value).toBe(0);
    });
  });

  describe("createChannelSmoother", () => {
    it("One-Euro 뱅크에 위임하고 reset 후 첫 프레임은 입력 스냅이다", () => {
      const smoother = createChannelSmoother();
      const first = smoother.smooth(mockChannels, 0, 0.35);
      expect(first).toEqual(mockChannels);

      // 스텝 입력은 즉시 반영되지 않는다(필터링 동작 확인).
      const stepped = smoother.smooth({ ...mockChannels, headYaw: 1 }, 1 / 30, 0.35);
      expect(stepped.headYaw).toBeGreaterThan(mockChannels.headYaw);
      expect(stepped.headYaw).toBeLessThan(1);

      smoother.reset();
      const afterReset = smoother.smooth({ ...mockChannels, headYaw: 1 }, 1, 0.35);
      expect(afterReset.headYaw).toBe(1); // 리셋 후 스냅
    });
  });
});

describe("photo-pose landmarker lifecycle", () => {
  afterEach(() => {
    disposePhotoPoseLandmarker();
  });

  it("closes an initialization that resolves after disposal and never resurrects its cache", async () => {
    type PhotoPoseLandmarker = Awaited<ReturnType<typeof initPhotoPoseLandmarker>>;
    let resolveFactory!: (landmarker: PhotoPoseLandmarker) => void;
    const closeStale = vi.fn();
    const factory = vi.fn(() => new Promise<PhotoPoseLandmarker>((resolve) => {
      resolveFactory = resolve;
    }));
    const pending = initPhotoPoseLandmarker(factory);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());

    disposePhotoPoseLandmarker();
    resolveFactory({ close: closeStale } as unknown as PhotoPoseLandmarker);

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(closeStale).toHaveBeenCalledOnce();

    const closeFresh = vi.fn();
    const fresh = { close: closeFresh } as unknown as PhotoPoseLandmarker;
    const freshFactory = vi.fn(async () => fresh);
    await expect(initPhotoPoseLandmarker(freshFactory)).resolves.toBe(fresh);
    await expect(initPhotoPoseLandmarker()).resolves.toBe(fresh);
    expect(freshFactory).toHaveBeenCalledOnce();

    disposePhotoPoseLandmarker();
    expect(closeFresh).toHaveBeenCalledOnce();
  });
});
