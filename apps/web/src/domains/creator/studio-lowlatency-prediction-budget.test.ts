import { describe, expect, it } from "vitest";

import {
  createStudioLowLatencyPointerIngest,
  STUDIO_LOW_LATENCY_NATIVE_PREDICTION_SAMPLE_LIMIT,
  type StudioLowLatencyPointerEventLike,
} from "./studio-lowlatency-ingest-adapter";

interface FakePointerEvent extends StudioLowLatencyPointerEventLike {
  pointerId: number;
  timeStamp: number;
  clientX: number;
  clientY: number;
  pressure: number;
  getCoalescedEvents?: unknown;
  getPredictedEvents?: unknown;
}

function sample(timeStamp: number, clientX: number): FakePointerEvent {
  return { pointerId: 7, timeStamp, clientX, clientY: 0, pressure: 0.5 };
}

describe("studio native prediction transient budget", () => {
  it("keeps the nearest bounded prediction horizon while preserving every hardware sample", () => {
    let now = 0;
    const ingest = createStudioLowLatencyPointerIngest<FakePointerEvent>({
      pointerId: 7,
      now: () => ++now,
    });
    const move = sample(3, 30);
    move.getCoalescedEvents = () => [sample(1, 10), sample(2, 20), move];
    move.getPredictedEvents = () => Array.from(
      { length: STUDIO_LOW_LATENCY_NATIVE_PREDICTION_SAMPLE_LIMIT + 100 },
      (_, index) => sample(4 + index, 40 + index),
    );

    const result = ingest.ingest(move, "pointermove");
    const confirmed = result.samples.filter((entry) => entry.role === "confirmed");
    const predicted = result.samples.filter((entry) => entry.role === "predicted");

    expect(confirmed.map((entry) => entry.x)).toEqual([10, 20, 30]);
    expect(predicted).toHaveLength(STUDIO_LOW_LATENCY_NATIVE_PREDICTION_SAMPLE_LIMIT);
    expect(predicted[0]?.x).toBe(40);
    expect(predicted.at(-1)?.x).toBe(40 + STUDIO_LOW_LATENCY_NATIVE_PREDICTION_SAMPLE_LIMIT - 1);
  });

  it("does not impose the prediction budget on coalesced authoritative history", () => {
    const ingest = createStudioLowLatencyPointerIngest<FakePointerEvent>({
      pointerId: 7,
      acceptPredicted: false,
      now: () => 1,
    });
    const count = STUDIO_LOW_LATENCY_NATIVE_PREDICTION_SAMPLE_LIMIT + 30;
    const move = sample(count, count);
    move.getCoalescedEvents = () => Array.from(
      { length: count },
      (_, index) => sample(index + 1, index + 1),
    );

    const result = ingest.ingest(move, "pointermove");
    expect(result.samples.filter((entry) => entry.role === "confirmed")).toHaveLength(count);
    expect(result.samples.some((entry) => entry.role === "predicted")).toBe(false);
  });
});
