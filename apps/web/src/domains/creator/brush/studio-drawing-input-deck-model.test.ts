import { describe, expect, it } from "vitest";

import {
  captureStudioDrawingTelemetryFrame,
  formatStudioDrawingTelemetryReport,
  normalizeStudioDrawingInputSnapshot,
  planStudioDrawingInputProfile,
  recommendStudioDrawingInputProfile,
  studioDrawingInputProfileMatches,
  summarizeStudioDrawingTelemetry,
  type StudioDrawingInputSnapshot,
  type StudioDrawingPointerEventLike,
} from "./studio-drawing-input-deck-model";

const CURRENT: StudioDrawingInputSnapshot = {
  stabilizer: 1,
  stabilizerMode: "standard",
  postCorrection: 0,
  pressureCurveId: "soft",
  stampMinSize: 0.2,
};

describe("studio drawing input deck model", () => {
  it("clamps settings before profiles compare or apply", () => {
    expect(
      normalizeStudioDrawingInputSnapshot({
        stabilizer: 99,
        stabilizerMode: "adaptive",
        postCorrection: -4,
        pressureCurveId: "linear",
        stampMinSize: 2,
      })
    ).toEqual({
      stabilizer: 10,
      stabilizerMode: "adaptive",
      postCorrection: 0,
      pressureCurveId: "linear",
      stampMinSize: 1,
    });
  });

  it("applies one coherent feel profile and preserves unsupported stamp floors", () => {
    const plan = planStudioDrawingInputProfile(CURRENT, "precision");

    expect(plan.next).toEqual({
      stabilizer: 8,
      stabilizerMode: "precision",
      postCorrection: 4,
      pressureCurveId: "firm",
      stampMinSize: 0.12,
    });
    expect(plan.changed).toEqual([
      "stabilizer",
      "stabilizerMode",
      "postCorrection",
      "pressureCurveId",
      "stampMinSize",
    ]);

    expect(
      planStudioDrawingInputProfile(
        { ...CURRENT, stampMinSize: null },
        "precision"
      ).next.stampMinSize
    ).toBeNull();
  });

  it("recognizes an already-active profile without a false stamp mismatch", () => {
    expect(
      studioDrawingInputProfileMatches(
        {
          stabilizer: 5,
          stabilizerMode: "adaptive",
          postCorrection: 2,
          pressureCurveId: "linear",
          stampMinSize: null,
        },
        "ink"
      )
    ).toBe(true);
  });

  it("uses the latest coalesced sample and never lets predicted input become authority", () => {
    const event: StudioDrawingPointerEventLike = {
      pointerId: 7,
      pointerType: "pen",
      pressure: 0.2,
      tiltX: 2,
      tiltY: 3,
      timeStamp: 10,
      getCoalescedEvents: () => [
        { pointerId: 7, pointerType: "pen", pressure: 0.3, timeStamp: 11 },
        {
          pointerId: 7,
          pointerType: "pen",
          pressure: 0.7,
          tiltX: 20,
          tiltY: -10,
          twist: 370,
          altitudeAngle: Math.PI / 3,
          azimuthAngle: Math.PI * 1.5,
          timeStamp: 12,
        },
      ],
      getPredictedEvents: () => [
        { pointerId: 7, pointerType: "pen", pressure: 1, timeStamp: 13 },
      ],
    };

    expect(captureStudioDrawingTelemetryFrame(event, "pointermove", 9)).toMatchObject({
      pointerId: 7,
      pressure: 0.7,
      tiltX: 20,
      tiltY: -10,
      twist: 10,
      altitudeAngle: 60,
      azimuthAngle: 270,
      timeStamp: 12,
      sampleCount: 2,
      predictedCount: 1,
      coalescedSupported: true,
      predictedSupported: true,
    });
  });

  it("fails safely when browser sampling methods exist but throw", () => {
    const frame = captureStudioDrawingTelemetryFrame(
      {
        pointerType: "pen",
        pressure: 0.4,
        timeStamp: 20,
        getCoalescedEvents: () => {
          throw new Error("webview bug");
        },
        getPredictedEvents: () => {
          throw new Error("webview bug");
        },
      },
      "pointermove",
      0
    );

    expect(frame.sampleCount).toBe(1);
    expect(frame.predictedCount).toBe(0);
    expect(frame.coalescedSupported).toBe(false);
    expect(frame.predictedSupported).toBe(false);
    expect(frame.pressure).toBe(0.4);
  });

  it("summarizes the preferred raw channel, sensor range, and effective sample rate", () => {
    const frames = [0, 10, 20, 30].map((timeStamp, index) =>
      captureStudioDrawingTelemetryFrame(
        {
          pointerId: 1,
          pointerType: "pen",
          pressure: 0.15 + index * 0.2,
          tiltX: index === 3 ? 24 : 0,
          twist: index === 3 ? 45 : 0,
          buttons: 1,
          timeStamp,
          getCoalescedEvents: () => [
            {
              pointerId: 1,
              pointerType: "pen",
              pressure: 0.15 + index * 0.2,
              tiltX: index === 3 ? 24 : 0,
              twist: index === 3 ? 45 : 0,
              buttons: 1,
              timeStamp,
            },
            {
              pointerId: 1,
              pointerType: "pen",
              pressure: 0.15 + index * 0.2,
              tiltX: index === 3 ? 24 : 0,
              twist: index === 3 ? 45 : 0,
              buttons: 1,
              timeStamp,
            },
          ],
          getPredictedEvents: () => [],
        },
        "pointerrawupdate",
        timeStamp
      )
    );

    const summary = summarizeStudioDrawingTelemetry(frames);
    expect(summary).not.toBeNull();
    expect(summary?.preferredChannel).toBe("pointerrawupdate");
    expect(summary?.sampleRateHz).toBeCloseTo(233.3, 1);
    expect(summary?.pressureMinimum).toBe(0.15);
    expect(summary?.pressureMaximum).toBe(0.75);
    expect(summary?.pressureRange).toBe(0.6);
    expect(summary?.tiltObserved).toBe(true);
    expect(summary?.twistObserved).toBe(true);
    expect(summary?.quality).toBe("excellent");
    expect(recommendStudioDrawingInputProfile(summary)).toBe("direct");

    const report = formatStudioDrawingTelemetryReport(summary);
    expect(report).toContain("pointer=pen");
    expect(report).toContain("sample-rate-hz=233.3");
    expect(report).toContain(
      "privacy=coordinates-and-stroke-content-not-collected"
    );
    expect(report).not.toMatch(/clientX|clientY|coordinate=/);
  });

  it("keeps a recent pen as the diagnostic subject when a palm touch follows it", () => {
    const summary = summarizeStudioDrawingTelemetry([
      captureStudioDrawingTelemetryFrame(
        {
          pointerId: 9,
          pointerType: "pen",
          pressure: 0.55,
          buttons: 1,
          timeStamp: 100,
        },
        "pointermove",
        100
      ),
      captureStudioDrawingTelemetryFrame(
        {
          pointerId: 10,
          pointerType: "touch",
          pressure: 0.5,
          buttons: 1,
          width: 38,
          height: 32,
          timeStamp: 140,
        },
        "pointermove",
        140
      ),
    ]);

    expect(summary?.latest.pointerType).toBe("pen");
    expect(summary?.latest.pointerId).toBe(9);
    expect(summary?.quality).toBe("limited");
  });

  it("recommends the compatibility profile for fixed-pressure pointers", () => {
    const summary = summarizeStudioDrawingTelemetry([
      captureStudioDrawingTelemetryFrame(
        {
          pointerId: 2,
          pointerType: "mouse",
          pressure: 0.5,
          buttons: 1,
          timeStamp: 100,
        },
        "pointermove",
        100
      ),
      captureStudioDrawingTelemetryFrame(
        {
          pointerId: 2,
          pointerType: "mouse",
          pressure: 0.5,
          buttons: 1,
          timeStamp: 116,
        },
        "pointermove",
        116
      ),
    ]);

    expect(summary?.quality).toBe("compatibility");
    expect(recommendStudioDrawingInputProfile(summary)).toBe("mouse-touch");
  });
});
