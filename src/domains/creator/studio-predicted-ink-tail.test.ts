import { describe, expect, it } from "vitest";

import {
  STUDIO_PREDICTED_INK_DEFAULT_PRESSURE,
  appendStudioAuthoritativeInk,
  clearStudioPredictedInkTail,
  createStudioPredictedInkTailState,
  endStudioPredictedInkTail,
  replaceStudioPredictedInkTail,
  type StudioPredictedInkSample,
} from "./studio-predicted-ink-tail";

describe("studio predicted ink tail", () => {
  it("exposes authoritative pixels only as append-only suffixes with a non-painted bridge anchor", () => {
    const first = appendStudioAuthoritativeInk(createStudioPredictedInkTailState(), {
      points: [0, 1, 10, 11],
      pressures: [0.2, 0.4],
    });

    expect(first.authoritativeSpan).toEqual({
      anchor: null,
      samples: [
        { x: 0, y: 1, pressure: 0.2 },
        { x: 10, y: 11, pressure: 0.4 },
      ],
    });
    expect(first.predictionSurface).toEqual({ kind: "clear" });

    const painted: StudioPredictedInkSample[] = [...first.authoritativeSpan.samples];
    const prefix = painted.map((sample) => ({ ...sample }));
    const second = appendStudioAuthoritativeInk(first.state, {
      points: [20, 21, 30, 31],
      pressures: [0.6, 0.8],
    });

    expect(second.authoritativeSpan.anchor).toEqual({ x: 10, y: 11, pressure: 0.4 });
    expect(second.authoritativeSpan.samples).toEqual([
      { x: 20, y: 21, pressure: 0.6 },
      { x: 30, y: 31, pressure: 0.8 },
    ]);
    painted.push(...second.authoritativeSpan.samples);
    expect(painted.slice(0, prefix.length)).toEqual(prefix);
    expect(second.state).toMatchObject({
      phase: "active",
      authoritativeSampleCount: 4,
      authoritativeEndpoint: { x: 30, y: 31, pressure: 0.8 },
    });
  });

  it("replaces the latest prediction suffix without emitting any authoritative mutation", () => {
    const authoritative = appendStudioAuthoritativeInk(createStudioPredictedInkTailState(), {
      points: [0, 0, 4, 0],
      pressures: [0.25, 0.5],
    }).state;
    const first = replaceStudioPredictedInkTail(authoritative, {
      points: [8, 0, 12, 0],
      pressures: [0.7, 0.9],
    });
    const authoritySnapshot = {
      count: first.state.authoritativeSampleCount,
      endpoint: first.state.authoritativeEndpoint,
    };

    expect(first.authoritativeSpan).toEqual({ anchor: null, samples: [] });
    expect(first.predictionSurface).toEqual({
      kind: "replace",
      anchor: { x: 4, y: 0, pressure: 0.5 },
      samples: [
        { x: 8, y: 0, pressure: 0.7 },
        { x: 12, y: 0, pressure: 0.9 },
      ],
    });

    const second = replaceStudioPredictedInkTail(first.state, {
      points: [7, 2, 10, 4],
      pressures: [0.6, 0.75],
    });
    expect(second.authoritativeSpan.samples).toEqual([]);
    expect(second.predictionSurface).toEqual({
      kind: "replace",
      anchor: { x: 4, y: 0, pressure: 0.5 },
      samples: [
        { x: 7, y: 2, pressure: 0.6 },
        { x: 10, y: 4, pressure: 0.75 },
      ],
    });
    expect(second.state.predictedSamples).not.toContainEqual({ x: 12, y: 0, pressure: 0.9 });
    expect({
      count: second.state.authoritativeSampleCount,
      endpoint: second.state.authoritativeEndpoint,
    }).toEqual(authoritySnapshot);
  });

  it("clears stale predictions when actual hardware samples catch up, even on a different route", () => {
    const started = appendStudioAuthoritativeInk(createStudioPredictedInkTailState(), {
      points: [0, 0, 5, 0],
      pressures: [0.2, 0.4],
    }).state;
    const predicted = replaceStudioPredictedInkTail(started, {
      points: [10, 0, 15, 0],
      pressures: [0.6, 0.8],
    }).state;

    const caughtUp = appendStudioAuthoritativeInk(predicted, {
      points: [9, 1, 14, 3],
      pressures: [0.55, 0.7],
    });
    expect(caughtUp.predictionSurface).toEqual({ kind: "clear" });
    expect(caughtUp.state.predictedSamples).toEqual([]);
    expect(caughtUp.authoritativeSpan).toEqual({
      anchor: { x: 5, y: 0, pressure: 0.4 },
      samples: [
        { x: 9, y: 1, pressure: 0.55 },
        { x: 14, y: 3, pressure: 0.7 },
      ],
    });

    const nextPrediction = replaceStudioPredictedInkTail(caughtUp.state, {
      points: [18, 5],
      pressures: [0.9],
    });
    expect(nextPrediction.predictionSurface).toMatchObject({
      kind: "replace",
      anchor: { x: 14, y: 3, pressure: 0.7 },
    });
  });

  it("invalidates an old tail for an empty, duplicate, or malformed authoritative batch", () => {
    const authoritative = appendStudioAuthoritativeInk(createStudioPredictedInkTailState(), {
      points: [2, 3],
      pressures: [0.4],
    }).state;
    const withPrediction = replaceStudioPredictedInkTail(authoritative, {
      points: [8, 9],
      pressures: [0.8],
    }).state;
    const malformed = appendStudioAuthoritativeInk(withPrediction, {
      points: [Number.NaN, 10, 12, 13],
      pressures: [1, 0.2],
    });

    expect(malformed.authoritativeSpan).toEqual({ anchor: null, samples: [] });
    expect(malformed.predictionSurface).toEqual({ kind: "clear" });
    expect(malformed.state.predictedSamples).toEqual([]);
    expect(malformed.state.authoritativeEndpoint).toEqual({ x: 2, y: 3, pressure: 0.4 });

    const predictedAgain = replaceStudioPredictedInkTail(malformed.state, {
      points: [7, 8],
      pressures: [0.7],
    }).state;
    const duplicate = appendStudioAuthoritativeInk(predictedAgain, {
      points: [2, 3],
      pressures: [1],
    });
    expect(duplicate.authoritativeSpan.samples).toEqual([]);
    expect(duplicate.predictionSurface).toEqual({ kind: "clear" });
    expect(duplicate.state.predictedSamples).toEqual([]);
  });

  it("aligns and sanitizes authoritative pressures at their original coordinate-pair indices", () => {
    const points = [0, 0, 1, 1, 2, 2, 3, 3, 4];
    const pressures = [0.1, Number.NaN, -4, 7, 0.9];
    const pointsBefore = points.slice();
    const pressuresBefore = pressures.slice();
    const transition = appendStudioAuthoritativeInk(createStudioPredictedInkTailState(), {
      points,
      pressures,
    });

    expect(transition.authoritativeSpan.samples).toEqual([
      { x: 0, y: 0, pressure: 0.1 },
      { x: 1, y: 1, pressure: STUDIO_PREDICTED_INK_DEFAULT_PRESSURE },
      { x: 2, y: 2, pressure: 0 },
      { x: 3, y: 3, pressure: 1 },
    ]);
    expect(points).toEqual(pointsBefore);
    expect(pressures).toEqual(pressuresBefore);
  });

  it("keeps prediction pressure aligned when an anchor duplicate is discarded", () => {
    const authoritative = appendStudioAuthoritativeInk(createStudioPredictedInkTailState(), {
      points: [0, 0],
      pressures: [0.3],
    }).state;
    const transition = replaceStudioPredictedInkTail(authoritative, {
      points: [0, 0, 3, 0, 6, 0],
      pressures: [0.95, 0.45, 0.75],
    });

    expect(transition.predictionSurface).toEqual({
      kind: "replace",
      anchor: { x: 0, y: 0, pressure: 0.3 },
      samples: [
        { x: 3, y: 0, pressure: 0.45 },
        { x: 6, y: 0, pressure: 0.75 },
      ],
    });
  });

  it("accepts only the longest finite prediction prefix and refuses an unanchored tail", () => {
    const unanchored = replaceStudioPredictedInkTail(createStudioPredictedInkTailState(), {
      points: [5, 5],
      pressures: [0.8],
    });
    expect(unanchored.predictionSurface).toEqual({ kind: "clear" });
    expect(unanchored.state.predictedSamples).toEqual([]);

    const authoritative = appendStudioAuthoritativeInk(unanchored.state, {
      points: [0, 0],
      pressures: [0.2],
    }).state;
    const malformed = replaceStudioPredictedInkTail(authoritative, {
      points: [4, 0, 8, 0, Number.POSITIVE_INFINITY, 0, 12, 0],
      pressures: [0.4, 0.6, 0.8, 1],
    });
    expect(malformed.predictionSurface).toEqual({
      kind: "replace",
      anchor: { x: 0, y: 0, pressure: 0.2 },
      samples: [
        { x: 4, y: 0, pressure: 0.4 },
        { x: 8, y: 0, pressure: 0.6 },
      ],
    });
  });

  it("clear removes only the replaceable tail and permits a later prediction", () => {
    const authoritative = appendStudioAuthoritativeInk(createStudioPredictedInkTailState(), {
      points: [1, 2, 3, 4],
      pressures: [0.2, 0.4],
    }).state;
    const predicted = replaceStudioPredictedInkTail(authoritative, {
      points: [5, 6],
      pressures: [0.6],
    }).state;
    const cleared = clearStudioPredictedInkTail(predicted);

    expect(cleared.predictionSurface).toEqual({ kind: "clear" });
    expect(cleared.authoritativeSpan.samples).toEqual([]);
    expect(cleared.state).toMatchObject({
      phase: "active",
      authoritativeSampleCount: 2,
      authoritativeEndpoint: { x: 3, y: 4, pressure: 0.4 },
      predictedSamples: [],
    });

    const resumed = replaceStudioPredictedInkTail(cleared.state, {
      points: [7, 8],
      pressures: [0.8],
    });
    expect(resumed.predictionSurface).toMatchObject({
      kind: "replace",
      anchor: { x: 3, y: 4, pressure: 0.4 },
    });
  });

  it("end clears the tail, seals the lifecycle and ignores every late append or prediction", () => {
    const authoritative = appendStudioAuthoritativeInk(createStudioPredictedInkTailState(), {
      points: [0, 0, 10, 0],
      pressures: [0.25, 0.5],
    }).state;
    const predicted = replaceStudioPredictedInkTail(authoritative, {
      points: [15, 0],
      pressures: [0.75],
    }).state;
    const ended = endStudioPredictedInkTail(predicted);

    expect(ended.predictionSurface).toEqual({ kind: "clear" });
    expect(ended.state).toMatchObject({
      phase: "ended",
      authoritativeSampleCount: 2,
      authoritativeEndpoint: { x: 10, y: 0, pressure: 0.5 },
      predictedSamples: [],
    });

    const lateAppend = appendStudioAuthoritativeInk(ended.state, {
      points: [20, 0],
      pressures: [1],
    });
    expect(lateAppend.state).toBe(ended.state);
    expect(lateAppend.authoritativeSpan).toEqual({ anchor: null, samples: [] });
    expect(lateAppend.predictionSurface).toEqual({ kind: "keep" });

    const latePrediction = replaceStudioPredictedInkTail(ended.state, {
      points: [30, 0],
      pressures: [1],
    });
    expect(latePrediction.state).toBe(ended.state);
    expect(latePrediction.authoritativeSpan.samples).toEqual([]);
    expect(latePrediction.predictionSurface).toEqual({ kind: "keep" });

    const endedAgain = endStudioPredictedInkTail(ended.state);
    expect(endedAgain.state).toBe(ended.state);
    expect(endedAgain.predictionSurface).toEqual({ kind: "clear" });
  });
});
