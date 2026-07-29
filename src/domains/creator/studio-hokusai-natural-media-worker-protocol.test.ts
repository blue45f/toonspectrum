import { describe, expect, it } from "vitest";

import {
  planStudioHokusaiNaturalMediaRender,
} from "./studio-hokusai-natural-media-contract";
import {
  STUDIO_HOKUSAI_WORKER_PROTOCOL_VERSION,
  snapshotStudioHokusaiWorkerRenderMessage,
} from "./studio-hokusai-natural-media-worker-protocol";

import type { DrawEl } from "./studio-element-model";

function request() {
  const planned = planStudioHokusaiNaturalMediaRender(
    {
      id: "draw-1",
      type: "draw",
      points: [10, 10, 20, 20, 40, 15],
      pressures: [0.25, 0.5, 1],
      stroke: "#000000",
      strokeWidth: 6,
      brush: "gpen",
    } satisfies DrawEl,
    {
      presetId: "pencil",
      color: "#123456",
      sizeScale: 1,
      opacity: 1,
      seed: 7,
    },
    { width: 800, height: 1_200 },
  );
  if (!planned.ok) throw new Error(planned.message);
  return {
    type: "studio-hokusai/render",
    version: STUDIO_HOKUSAI_WORKER_PROTOCOL_VERSION,
    requestId: 1,
    engineEpoch: 1,
    plan: planned.plan,
  };
}

describe("Studio Hokusai Worker protocol", () => {
  it("copies a valid render message into frozen clone-safe data", () => {
    const input = request();
    const snapshot = snapshotStudioHokusaiWorkerRenderMessage(input);
    expect(snapshot).not.toBeNull();
    expect(snapshot).not.toBe(input);
    expect(snapshot?.plan.samples).not.toBe(input.plan.samples);
    expect(Object.isFrozen(snapshot?.plan.samples)).toBe(true);
  });

  it("rejects extra fields, wrong epochs and malformed sample order", () => {
    expect(snapshotStudioHokusaiWorkerRenderMessage({
      ...request(),
      extra: true,
    })).toBeNull();
    expect(snapshotStudioHokusaiWorkerRenderMessage({
      ...request(),
      engineEpoch: 0,
    })).toBeNull();
    const malformed = request();
    expect(snapshotStudioHokusaiWorkerRenderMessage({
      ...malformed,
      plan: {
        ...malformed.plan,
        samples: malformed.plan.samples.map((sample, index) => ({
          ...sample,
          timeMilliseconds: index === 2 ? -1 : sample.timeMilliseconds,
        })),
      },
    })).toBeNull();
  });
});
