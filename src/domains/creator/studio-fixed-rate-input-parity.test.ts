import { describe, expect, it } from "vitest";

import {
  resolveBrushPressureSample,
  resolveBrushReleasePressureSample,
} from "./studio-brush";
import {
  createCanonicalFixedRateStrokeFilter,
  createFixedRateStrokeFilter,
  transitionFixedRateStrokeFilter,
  type FixedRateStrokeFilteredSample,
  type FixedRateStrokeFilterState,
} from "./studio-fixed-rate-stroke-filter";
import {
  beginStudioStrokePointerSession,
  collectStudioStrokePointerBatch,
  type StudioPointerEventLike,
  type StudioStrokePointerSession,
} from "./studio-pointer-input";

type TestPointerType = "mouse" | "pen";
type TestFilterMode = "canonical-zero" | "filtered-3.4";

interface TestPointerSample extends StudioPointerEventLike {
  pointerId: number;
  pointerType: TestPointerType;
  clientX: number;
  clientY: number;
  pressure: number;
  timeStamp: number;
}

function pointerSample(
  pointerType: TestPointerType,
  timeStamp: number,
  overrides: Partial<TestPointerSample> = {}
): TestPointerSample {
  return {
    pointerId: 17,
    pointerType,
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: timeStamp * 0.75,
    clientY: Math.sin(timeStamp / 18) * 12,
    // A mouse's conventional 0.5 is not hardware pressure. A pen at 1 and the nominal
    // full-width mouse fallback both enter the versioned linear ink model as pressure 1.
    pressure: pointerType === "pen" ? 1 : 0.5,
    tiltX: 0,
    tiltY: 0,
    timeStamp,
    ...overrides,
  };
}

function resolvedPressure(sample: TestPointerSample): number {
  return resolveBrushPressureSample({
    pointerType: sample.pointerType,
    rawPressure: sample.pressure,
    velocityFallbackEnabled: false,
    pressureCurve: 1,
    fallbackPressure: 1,
  });
}

function startFilter(
  sample: TestPointerSample,
  mode: TestFilterMode
): FixedRateStrokeFilterState {
  const initial = {
    x: sample.clientX,
    y: sample.clientY,
    pressure: resolvedPressure(sample),
    timeStamp: sample.timeStamp,
  };
  return mode === "canonical-zero"
    ? createCanonicalFixedRateStrokeFilter(initial).state
    : createFixedRateStrokeFilter(initial, 3.4).state;
}

function appendBatch(
  state: FixedRateStrokeFilterState,
  samples: readonly TestPointerSample[]
) {
  return transitionFixedRateStrokeFilter(state, {
    type: "append",
    samples: samples.map((sample) => ({
      x: sample.clientX,
      y: sample.clientY,
      pressure: resolvedPressure(sample),
      timeStamp: sample.timeStamp,
    })),
  });
}

function finishFilter(state: FixedRateStrokeFilterState) {
  return transitionFixedRateStrokeFilter(state, { type: "release" });
}

function runMouseParentDeliveries(
  samples: readonly TestPointerSample[],
  mode: TestFilterMode
) {
  const down = pointerSample("mouse", 0);
  let session = beginStudioStrokePointerSession(down)!;
  let state = startFilter(down, mode);
  const emitted: FixedRateStrokeFilteredSample[] = [];

  for (const sample of samples) {
    const batch = collectStudioStrokePointerBatch(session, sample);
    session = batch.session;
    const transition = appendBatch(state, batch.authoritative as readonly TestPointerSample[]);
    state = transition.state;
    emitted.push(...transition.emitted);
  }

  const finished = finishFilter(state);
  emitted.push(...finished.emitted);
  return { emitted, state: finished.state };
}

function runPenCoalescedDeliveries(
  samples: readonly TestPointerSample[],
  batchSize: number,
  mode: TestFilterMode
) {
  const down = pointerSample("pen", 0);
  let session: StudioStrokePointerSession = beginStudioStrokePointerSession(down)!;
  let state = startFilter(down, mode);
  const emitted: FixedRateStrokeFilteredSample[] = [];

  for (let index = 0; index < samples.length; index += batchSize) {
    const coalesced = samples.slice(index, index + batchSize);
    const parent = pointerSample("pen", coalesced.at(-1)?.timeStamp ?? 0, {
      // The processed parent aggregates the coalesced hardware list and must not become an
      // additional input point.
      clientX: (coalesced.at(-1)?.clientX ?? 0) + 99,
      clientY: (coalesced.at(-1)?.clientY ?? 0) + 99,
      getCoalescedEvents: () => coalesced,
    });
    const batch = collectStudioStrokePointerBatch(session, parent);
    session = batch.session;
    const transition = appendBatch(state, batch.authoritative as readonly TestPointerSample[]);
    state = transition.state;
    emitted.push(...transition.emitted);
  }

  const finished = finishFilter(state);
  emitted.push(...finished.emitted);
  return { emitted, state: finished.state };
}

describe("fixed-rate mouse and pen input parity", () => {
  it.each<TestFilterMode>(["canonical-zero", "filtered-3.4"])(
    "%s produces one identical logical stream for parent events and arbitrarily coalesced pen input",
    (mode) => {
      const mouseSamples = Array.from({ length: 48 }, (_, index) => (
        pointerSample("mouse", (index + 1) * 4)
      ));
      const penSamples = mouseSamples.map((sample) => pointerSample("pen", sample.timeStamp, {
        clientX: sample.clientX,
        clientY: sample.clientY,
      }));

      const mouse = runMouseParentDeliveries(mouseSamples, mode);
      const penByTwo = runPenCoalescedDeliveries(penSamples, 2, mode);
      const penByEight = runPenCoalescedDeliveries(penSamples, 8, mode);

      expect(penByTwo.emitted).toEqual(mouse.emitted);
      expect(penByEight.emitted).toEqual(mouse.emitted);
      expect(penByTwo.state).toEqual(mouse.state);
      expect(penByEight.state).toEqual(mouse.state);
    }
  );

  it("keeps a non-contact pen release at the last contact pressure used by nominal mouse ink", () => {
    const mousePressure = resolveBrushReleasePressureSample({
      pointerType: "mouse",
      rawPressure: 0,
      fallbackPressure: 1,
      velocityFallbackEnabled: false,
    });
    const penPressure = resolveBrushReleasePressureSample({
      pointerType: "pen",
      rawPressure: 0,
      lastContactPressure: 1,
      fallbackPressure: 1,
      pressureCurve: 1,
    });

    expect(mousePressure).toBe(1);
    expect(penPressure).toBe(mousePressure);
  });
});
