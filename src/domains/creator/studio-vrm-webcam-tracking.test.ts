import { describe, expect, it } from "vitest";

import {
  smoothRawChannels,
  convertChannelsToVrmData,
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
  });
});
