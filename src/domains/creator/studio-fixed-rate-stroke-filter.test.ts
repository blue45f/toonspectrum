import { describe, expect, it } from "vitest";

import {
  FIXED_RATE_STROKE_FILTER_TICK_MS,
  FIXED_RATE_STROKE_PRESSURE_STEPS,
  FIXED_RATE_STROKE_RELEASE_POSITION_EPSILON,
  createFixedRateStrokeFilter,
  quantizeFixedRateStrokeSample,
  resolveFixedRateStrokeFilterParameters,
  transitionFixedRateStrokeFilter,
  type FixedRateStrokeFilteredSample,
  type FixedRateStrokeFilterState,
  type FixedRateStrokeRawSample,
} from "./studio-fixed-rate-stroke-filter";

function append(
  state: FixedRateStrokeFilterState,
  samples: readonly FixedRateStrokeRawSample[]
) {
  return transitionFixedRateStrokeFilter(state, { type: "append", samples });
}

function release(
  state: FixedRateStrokeFilterState,
  sample?: FixedRateStrokeRawSample
) {
  return transitionFixedRateStrokeFilter(state, { type: "release", sample });
}

function advance(state: FixedRateStrokeFilterState, timeStamp: number) {
  return transitionFixedRateStrokeFilter(state, { type: "advance", timeStamp });
}

function splitInto<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

function runBatches(
  initial: FixedRateStrokeRawSample,
  batches: readonly (readonly FixedRateStrokeRawSample[])[],
  strength = 3.4
) {
  const started = createFixedRateStrokeFilter(initial, strength);
  let state = started.state;
  const emitted = [...started.emitted];
  for (const batch of batches) {
    const result = append(state, batch);
    state = result.state;
    emitted.push(...result.emitted);
  }
  const finished = release(state);
  emitted.push(...finished.emitted);
  return { state: finished.state, emitted, finished };
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function fixturePoint(sample: FixedRateStrokeFilteredSample) {
  return {
    tick: sample.logicalTick,
    x: round(sample.x),
    y: round(sample.y),
    pressure: round(sample.pressure),
    tiltX: round(sample.tiltX),
    tiltY: round(sample.tiltY),
  };
}

describe("fixed-rate stroke filter parameters", () => {
  it("maps strength 3.4 to the traced 40 response, 10 stages, and 0.6 alpha", () => {
    expect(resolveFixedRateStrokeFilterParameters(3.4)).toEqual({
      strength: 3.4,
      normalizedStrength: 0.33999999999999997,
      response: 40,
      stageCount: 10,
      alpha: 0.6,
    });
  });

  it("clamps strength and preserves the 20..80 response endpoints", () => {
    expect(resolveFixedRateStrokeFilterParameters(-10)).toMatchObject({
      strength: 0,
      normalizedStrength: 0,
      response: 20,
      stageCount: 5,
      alpha: 0.8,
    });
    expect(resolveFixedRateStrokeFilterParameters(Number.NaN)).toEqual(
      resolveFixedRateStrokeFilterParameters(0)
    );
    expect(resolveFixedRateStrokeFilterParameters(99)).toMatchObject({
      strength: 10,
      normalizedStrength: 1,
      response: 80,
      stageCount: 20,
      alpha: 0.19999999999999996,
    });
  });

  it("rounds the positive fractional stage count to nearest, with half-up ties", () => {
    const parameters = resolveFixedRateStrokeFilterParameters(0.43);
    expect(parameters.response).toBeCloseTo(22, 12);
    expect(parameters.response / 4).toBeCloseTo(5.5, 12);
    expect(parameters.stageCount).toBe(6);
  });
});

describe("fixed-rate stroke input quantization", () => {
  it("quantizes position and tilt to 1/16 and pressure to 1/1023", () => {
    const sample = quantizeFixedRateStrokeSample({
      x: 1.03,
      y: -1.04,
      pressure: 0.54321,
      tiltX: 12.34,
      tiltY: -7.78,
      timeStamp: 17.25,
    });
    expect(sample).toEqual({
      x: 1,
      y: -1.0625,
      pressure: Math.round(0.54321 * FIXED_RATE_STROKE_PRESSURE_STEPS)
        / FIXED_RATE_STROKE_PRESSURE_STEPS,
      tiltX: 12.3125,
      tiltY: -7.75,
      timeStamp: 17.25,
    });
  });

  it("clamps pressure and uses the previous finite channels for malformed samples", () => {
    const fallback = quantizeFixedRateStrokeSample({
      x: 7,
      y: 9,
      pressure: 0.75,
      tiltX: 3,
      tiltY: -4,
      timeStamp: 20,
    });
    expect(quantizeFixedRateStrokeSample({
      x: Number.NaN,
      y: Infinity,
      pressure: -5,
      tiltX: Number.NaN,
      tiltY: Infinity,
      timeStamp: Number.NaN,
    }, fallback)).toEqual({
      x: 7,
      y: 9,
      pressure: 0,
      tiltX: 3,
      tiltY: -4,
      timeStamp: 20,
    });
    expect(quantizeFixedRateStrokeSample({ x: 0, y: 0, pressure: 5 }).pressure).toBe(1);
  });
});

describe("fixed logical clock and zero-order hold", () => {
  it("evaluates a 5ms grid with the last raw sample eligible at each tick", () => {
    const started = createFixedRateStrokeFilter({ x: 0, y: 0, timeStamp: 0 }, 3.4);
    const first = append(started.state, [
      { x: 4, y: 0, timeStamp: 4 },
      { x: 7, y: 0, timeStamp: 7 },
      { x: 12, y: 0, timeStamp: 12 },
    ]);
    expect(first.emitted.map((sample) => ({
      tick: sample.logicalTick,
      timeStamp: sample.timeStamp,
      sourceTimeStamp: sample.sourceTimeStamp,
    }))).toEqual([
      { tick: 1, timeStamp: 5, sourceTimeStamp: 4 },
      { tick: 2, timeStamp: 10, sourceTimeStamp: 7 },
    ]);

    const second = append(first.state, [{ x: 16, y: 0, timeStamp: 16 }]);
    expect(second.emitted).toHaveLength(1);
    expect(second.emitted[0]).toMatchObject({
      logicalTick: 3,
      timeStamp: 15,
      sourceTimeStamp: 12,
    });
  });

  it("anchors the fixed grid and skips settled duplicate geometry without drift", () => {
    const started = createFixedRateStrokeFilter({ x: 0, y: 0, timeStamp: 10.25 }, 3.4);
    const result = append(started.state, [{ x: 20, y: 0, timeStamp: 36 }]);
    expect(result.emitted).toEqual([]);
    expect(result.state.nextLogicalTick).toBe(6);

    const evaluated = advance(result.state, 40.25);
    expect(evaluated.emitted.map(({ logicalTick, timeStamp }) => ({
      logicalTick,
      timeStamp,
    }))).toEqual([{ logicalTick: 6, timeStamp: 40.25 }]);
  });

  it("advances a stationary clock by holding the latest eligible raw sample", () => {
    const started = createFixedRateStrokeFilter({ x: 0, y: 0, timeStamp: 0 }, 3.4);
    const received = append(started.state, [{ x: 20, y: 5, timeStamp: 4 }]);
    expect(received.emitted).toEqual([]);

    const settled = advance(received.state, 15);
    expect(settled.emitted.map((sample) => ({
      tick: sample.logicalTick,
      timeStamp: sample.timeStamp,
      sourceTimeStamp: sample.sourceTimeStamp,
    }))).toEqual([
      { tick: 1, timeStamp: 5, sourceTimeStamp: 4 },
      { tick: 2, timeStamp: 10, sourceTimeStamp: 4 },
      { tick: 3, timeStamp: 15, sourceTimeStamp: 4 },
    ]);
    expect(advance(settled.state, 14).emitted).toEqual([]);
  });

  it("publishes sparse held motion frame-by-frame without changing the final logical stream", () => {
    const started = createFixedRateStrokeFilter({ x: 0, y: 0, timeStamp: 0 }, 3.4);
    const sparseMove = append(started.state, [{ x: 50, y: 0, timeStamp: 50 }]);
    expect(sparseMove.emitted).toEqual([]);

    const frame66 = advance(sparseMove.state, 66);
    const frame83 = advance(frame66.state, 83);
    const oneShot = advance(sparseMove.state, 83);

    expect(frame66.emitted.map(({ logicalTick }) => logicalTick)).toEqual([11, 12, 13]);
    expect(frame66.emitted.map(({ x }) => Number(x.toFixed(6)))).toEqual([
      0.302331,
      1.511654,
      4.172166,
    ]);
    expect([...frame66.emitted, ...frame83.emitted]).toEqual(oneShot.emitted);
    expect(frame83.state).toEqual(oneShot.state);
  });

  it("keeps an emitted prefix immutable when a late coalesced sample follows a frame watermark", () => {
    const started = createFixedRateStrokeFilter({ x: 0, y: 0, timeStamp: 0 }, 3.4);
    const early = append(started.state, [{ x: 10, y: 0, timeStamp: 4 }]);
    const presented = advance(early.state, 15);
    const prefix = structuredClone(presented.emitted);

    const late = append(presented.state, [{ x: 20, y: 5, timeStamp: 8 }]);
    const next = advance(late.state, 20);

    expect(presented.emitted).toEqual(prefix);
    expect(late.emitted).toEqual([]);
    expect(next.emitted).toHaveLength(1);
    expect(next.emitted[0]).toMatchObject({ logicalTick: 4, timeStamp: 20 });
    expect(new Set([...prefix, ...next.emitted].map(({ logicalTick }) => logicalTick)).size)
      .toBe(prefix.length + next.emitted.length);
  });

  it("bounds long background catch-up after the held cascade settles", () => {
    const started = createFixedRateStrokeFilter({ x: 0, y: 0, timeStamp: 0 }, 10);
    const moved = append(started.state, [{ x: 100, y: 20, timeStamp: 1 }]);
    const resumed = advance(moved.state, 10 * 60 * 1_000);

    expect(resumed.emitted.length).toBeLessThan(4_096);
    expect(resumed.state.nextLogicalTick).toBe(120_001);
    expect(resumed.endpoint.x).toBeCloseTo(100, 10);
    expect(resumed.endpoint.y).toBeCloseTo(20, 10);
  });

  it("cascades x, y, pressure, and both tilt channels through every stage", () => {
    const started = createFixedRateStrokeFilter({
      x: 0,
      y: 0,
      pressure: 0,
      tiltX: 0,
      tiltY: 0,
      timeStamp: 0,
    }, 3.4);
    const heldStep = append(started.state, [{
      x: 10,
      y: 20,
      pressure: 1,
      tiltX: 16,
      tiltY: -8,
      timeStamp: 6,
    }]);
    const evaluated = append(heldStep.state, [{
      x: 10,
      y: 20,
      pressure: 1,
      tiltX: 16,
      tiltY: -8,
      timeStamp: 11,
    }]);

    expect(evaluated.state.stages).toHaveLength(10);
    expect(evaluated.state.stages[0]).toMatchObject({
      x: 6,
      y: 12,
      pressure: 0.6,
      tiltX: 9.6,
      tiltY: -4.8,
    });
    expect(evaluated.state.stages[1]?.x).toBeCloseTo(3.6, 12);
    expect(evaluated.endpoint.x).toBeCloseTo(10 * 0.6 ** 10, 12);
    expect(evaluated.endpoint.y).toBeCloseTo(20 * 0.6 ** 10, 12);
    expect(evaluated.endpoint.pressure).toBeCloseTo(0.6 ** 10, 12);
    expect(evaluated.endpoint.tiltX).toBeCloseTo(16 * 0.6 ** 10, 12);
    expect(evaluated.endpoint.tiltY).toBeCloseTo(-8 * 0.6 ** 10, 12);
  });
});

describe("deterministic event batching", () => {
  const initial = { x: 2, y: -1, pressure: 0.4, timeStamp: 0 } as const;
  const samples = Array.from({ length: 35 }, (_, index) => {
    const timeStamp = (index + 1) * 3.75;
    return {
      x: index * 2.125,
      y: Math.sin(index / 4) * 9,
      pressure: 0.2 + (index % 7) / 10,
      tiltX: index / 3,
      tiltY: -index / 5,
      timeStamp,
    };
  });

  it("produces the same append-only output when a batch is split arbitrarily", () => {
    const oneBatch = runBatches(initial, [samples]);
    const split = runBatches(initial, [
      samples.slice(0, 2),
      samples.slice(2, 11),
      samples.slice(11, 12),
      samples.slice(12, 29),
      samples.slice(29),
    ]);
    expect(split.emitted).toEqual(oneBatch.emitted);
    expect(split.state).toEqual(oneBatch.state);
  });

  it("lets the last equal-timestamp sample win even when duplicates cross batches", () => {
    const duplicateSamples = [
      { x: 4, y: 0, timeStamp: 4 },
      { x: 8, y: 1, timeStamp: 10 },
      { x: 10, y: 3, timeStamp: 10 },
      { x: 11, y: 5, timeStamp: 11 },
      { x: 20, y: 8, timeStamp: 20 },
    ];
    const together = runBatches(initial, [duplicateSamples]);
    const split = runBatches(initial, [
      duplicateSamples.slice(0, 2),
      duplicateSamples.slice(2, 3),
      duplicateSamples.slice(3),
    ]);
    expect(split.emitted).toEqual(together.emitted);
    // Strict ZOH boundary: a raw sample at t=10 becomes eligible after, not at, the t=10 tick.
    expect(split.emitted.find((sample) => sample.timeStamp === 10)?.sourceTimeStamp).toBe(4);
  });

  it("uses the previous hold on an exact tick and the last equal-time sample on the next tick", () => {
    const started = createFixedRateStrokeFilter({ x: 0, y: 0, timeStamp: 0 }, 3.4);
    const atFour = append(started.state, [{ x: 4, y: 0, timeStamp: 4 }]);
    const atBoundary = append(atFour.state, [
      { x: 8, y: 0, timeStamp: 10 },
      { x: 10, y: 0, timeStamp: 10 },
    ]);
    const nextTick = advance(atBoundary.state, 15);

    expect(atBoundary.emitted.find(({ timeStamp }) => timeStamp === 10)?.sourceTimeStamp).toBe(4);
    expect(nextTick.emitted.find(({ timeStamp }) => timeStamp === 15)?.sourceTimeStamp).toBe(10);
    expect(nextTick.state.heldSample.x).toBe(10);
  });

  it("does not mutate a previously emitted prefix or prior state", () => {
    const started = createFixedRateStrokeFilter(initial, 3.4);
    const first = append(started.state, samples.slice(0, 12));
    const prefix = [...started.emitted, ...first.emitted];
    const prefixSnapshot = structuredClone(prefix);
    const stateSnapshot = structuredClone(first.state);

    const second = append(first.state, samples.slice(12));
    release(second.state);
    expect(prefix).toEqual(prefixSnapshot);
    expect(first.state).toEqual(stateSnapshot);

    const oneBatch = runBatches(initial, [samples]);
    const finished = release(second.state);
    expect([...prefix, ...second.emitted, ...finished.emitted]).toEqual(oneBatch.emitted);
  });

  it("is invariant to 60, 120, and 240Hz delivery batches of one 240Hz raw stream", () => {
    const raw240Hz = Array.from({ length: 72 }, (_, index) => {
      const timeStamp = ((index + 1) * 1_000) / 240;
      return {
        x: timeStamp * 0.8,
        y: Math.sin(timeStamp / 21) * 15,
        pressure: 0.55 + Math.sin(timeStamp / 37) * 0.25,
        tiltX: Math.sin(timeStamp / 43) * 35,
        tiltY: Math.cos(timeStamp / 51) * 20,
        timeStamp,
      };
    });
    const at60Hz = runBatches(initial, splitInto(raw240Hz, 4));
    const at120Hz = runBatches(initial, splitInto(raw240Hz, 2));
    const at240Hz = runBatches(initial, splitInto(raw240Hz, 1));
    expect(at60Hz.emitted).toEqual(at120Hz.emitted);
    expect(at60Hz.emitted).toEqual(at240Hz.emitted);
    expect(at60Hz.state).toEqual(at240Hz.state);
  });
});

describe("representative stroke fixtures", () => {
  it("locks the causal sine response across position, pressure, and tilt", () => {
    const initial = {
      x: 0,
      y: 0,
      pressure: 0.4,
      tiltX: 0,
      tiltY: -10,
      timeStamp: 0,
    };
    const sineSamples = Array.from({ length: 20 }, (_, index) => {
      const timeStamp = (index + 1) * 4;
      return {
        x: timeStamp * 1.25,
        y: Math.sin(timeStamp / 16) * 12,
        pressure: 0.4 + Math.sin(timeStamp / 20) * 0.2,
        tiltX: Math.sin(timeStamp / 30) * 20,
        tiltY: -Math.cos(timeStamp / 24) * 10,
        timeStamp,
      };
    });
    const result = runBatches(initial, [sineSamples]);
    const selectedTicks = new Set([0, 4, 8, 12, 16]);
    expect(result.emitted.filter((sample) => selectedTicks.has(sample.logicalTick)).map(fixturePoint))
      .toEqual([
        { tick: 0, x: 0, y: 0, pressure: 0.399804, tiltX: 0, tiltY: -10 },
        {
          tick: 4,
          x: 1.441514,
          y: 0.820617,
          pressure: 0.410989,
          tiltX: 0.758714,
          tiltY: -9.916345,
        },
        {
          tick: 8,
          x: 11.535184,
          y: 5.159312,
          pressure: 0.476425,
          tiltX: 5.665724,
          tiltY: -8.568895,
        },
        {
          tick: 12,
          x: 31.42924,
          y: 7.702838,
          pressure: 0.544587,
          tiltX: 13.205966,
          tiltY: -4.099059,
        },
        {
          tick: 16,
          x: 55.38034,
          y: 1.911754,
          pressure: 0.510308,
          tiltX: 17.202255,
          tiltY: 2.381086,
        },
      ]);
    expect(fixturePoint(result.finished.endpoint)).toEqual({
      tick: 30,
      x: 99.53274,
      y: -11.445738,
      pressure: 0.251397,
      tiltX: 9.297953,
      tiltY: 9.788029,
    });
    expect(result.finished.releaseDrainTicks).toBe(14);
    expect(round(result.state.lastStagePositionDelta)).toBe(0.782284);
  });

  it("locks a sharp-turn response without allowing future samples to rewrite its prefix", () => {
    const initial = { x: 0, y: 0, pressure: 0.5, timeStamp: 0 };
    const turnSamples = Array.from({ length: 20 }, (_, index) => {
      const timeStamp = (index + 1) * 4;
      return timeStamp <= 40
        ? { x: timeStamp * 2, y: 0, pressure: 0.5, timeStamp }
        : { x: 80, y: (timeStamp - 40) * 2, pressure: 0.5, timeStamp };
    });
    const beforeTurn = append(
      createFixedRateStrokeFilter(initial, 3.4).state,
      turnSamples.slice(0, 10)
    );
    const beforeSnapshot = structuredClone(beforeTurn.emitted);
    const afterTurn = append(beforeTurn.state, turnSamples.slice(10));
    expect(beforeTurn.emitted).toEqual(beforeSnapshot);
    expect(beforeTurn.emitted.every((sample) => sample.y === 0)).toBe(true);

    const finished = release(afterTurn.state);
    const all = [
      createFixedRateStrokeFilter(initial, 3.4).emitted[0]!,
      ...beforeTurn.emitted,
      ...afterTurn.emitted,
      ...finished.emitted,
    ];
    const selectedTicks = new Set([8, 9, 12, 16]);
    expect(all.filter((sample) => selectedTicks.has(sample.logicalTick)).map(fixturePoint))
      .toEqual([
        {
          tick: 8,
          x: 18.456294,
          y: 0,
          pressure: 0.500489,
          tiltX: 0,
          tiltY: 0,
        },
        {
          tick: 9,
          x: 25.236442,
          y: 0.048373,
          pressure: 0.500489,
          tiltX: 0,
          tiltY: 0,
        },
        {
          tick: 12,
          x: 47.980362,
          y: 2.306422,
          pressure: 0.500489,
          tiltX: 0,
          tiltY: 0,
        },
        {
          tick: 16,
          x: 70.15225,
          y: 18.456294,
          pressure: 0.500489,
          tiltX: 0,
          tiltY: 0,
        },
      ]);
    expect(fixturePoint(finished.endpoint)).toEqual({
      tick: 31,
      x: 79.995314,
      y: 79.553883,
      pressure: 0.500489,
      tiltX: 0,
      tiltY: 0,
    });
    expect(finished.releaseDrainTicks).toBe(15);
    expect(round(finished.state.lastStagePositionDelta)).toBe(0.676204);
  });

  it("drains one held release endpoint until total stage |dx| + |dy| is at most one", () => {
    const started = createFixedRateStrokeFilter({
      x: 0,
      y: 0,
      pressure: 0.2,
      tiltX: 0,
      tiltY: 0,
      timeStamp: 0,
    }, 3.4);
    const moved = append(started.state, [{
      x: 100,
      y: 40,
      pressure: 0.8,
      tiltX: 20,
      tiltY: -12,
      timeStamp: 1,
    }]);
    const finished = release(moved.state, {
      x: 100,
      y: 40,
      pressure: 0.8,
      tiltX: 20,
      tiltY: -12,
      timeStamp: 6,
    });

    expect(finished.releaseDrainTicks).toBeGreaterThan(0);
    expect(finished.state.lastStagePositionDelta)
      .toBeLessThanOrEqual(FIXED_RATE_STROKE_RELEASE_POSITION_EPSILON);
    expect(finished.endpoint.x).toBeLessThan(100);
    expect(finished.endpoint.y).toBeLessThan(40);
    expect(finished.emitted.slice(-finished.releaseDrainTicks).every((sample) => (
      sample.sourceTimeStamp === 6
    ))).toBe(true);
    expect({
      releaseDrainTicks: finished.releaseDrainTicks,
      lastStagePositionDelta: round(finished.state.lastStagePositionDelta),
      endpoint: fixturePoint(finished.endpoint),
    }).toEqual({
      releaseDrainTicks: 17,
      lastStagePositionDelta: 0.969712,
      endpoint: {
        tick: 18,
        x: 99.538232,
        y: 39.815293,
        pressure: 0.796842,
        tiltX: 19.907646,
        tiltY: -11.944588,
      },
    });
  });

  it("closes an already settled tap without manufacturing extra ticks", () => {
    const started = createFixedRateStrokeFilter({ x: 3, y: 5, timeStamp: 12 }, 10);
    const finished = release(started.state);
    expect(finished.releaseDrainTicks).toBe(0);
    expect(finished.emitted).toEqual([]);
    expect(finished.endpoint).toBe(started.endpoint);
    expect(finished.state.closed).toBe(true);
  });

  it("makes every transition after release an idempotent no-op", () => {
    const started = createFixedRateStrokeFilter({ x: 0, y: 0, timeStamp: 0 }, 3.4);
    const finished = release(started.state);
    const afterClose = append(finished.state, [{ x: 100, y: 100, timeStamp: 100 }]);
    expect(afterClose.state).toBe(finished.state);
    expect(afterClose.emitted).toEqual([]);
    expect(afterClose.endpoint).toBe(finished.endpoint);
  });

  it("emits only fixed-grid timestamps, including synthetic release drain ticks", () => {
    const started = createFixedRateStrokeFilter({ x: 0, y: 0, timeStamp: 2.5 }, 3.4);
    const finished = release(append(started.state, [{
      x: 50,
      y: 25,
      timeStamp: 9,
    }]).state);
    expect(finished.emitted.every((sample) => (
      sample.timeStamp === 2.5 + sample.logicalTick * FIXED_RATE_STROKE_FILTER_TICK_MS
    ))).toBe(true);
  });
});
