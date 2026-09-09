import { describe, expect, it } from "vitest";

import {
  cancelStudioTimelineExport,
  planStudioAudioDriftCorrection,
  planStudioTimelineVirtualWindow,
  STUDIO_TIMELINE_RATES,
  studioTimelineAudioSampleToFrame,
  studioTimelineFrameToAudioSample,
  studioTimelineFramesToSeconds,
  transactStudioTimeline,
  type StudioTimelineDocument,
} from "./studio-timeline-timebase";

const timeline: StudioTimelineDocument = {
  version: 1,
  id: "timeline-1",
  revision: 0,
  rate: STUDIO_TIMELINE_RATES.fps2997,
  durationFrames: 9_000,
  sampleRate: 48_000,
  tracks: [
    { id: "cel", kind: "cel", cels: [] },
    { id: "camera", kind: "camera", keyframes: [] },
  ],
};

describe("studio rational timeline", () => {
  it("keeps 29.97 frame/audio conversion bounded over long durations", () => {
    const frame = 8_991;
    const sample = studioTimelineFrameToAudioSample(frame, timeline.rate, timeline.sampleRate);
    expect(studioTimelineAudioSampleToFrame(sample, timeline.rate, timeline.sampleRate)).toBe(frame);
    expect(studioTimelineFramesToSeconds(30_000, timeline.rate)).toBeCloseTo(1001, 8);
  });

  it("produces a bounded correction receipt instead of accumulating audio drift", () => {
    const expected = studioTimelineFrameToAudioSample(3_000, timeline.rate, timeline.sampleRate);
    const receipt = planStudioAudioDriftCorrection({
      frame: 3_000,
      observedSample: expected + 4_800,
      rate: timeline.rate,
      sampleRate: timeline.sampleRate,
      maxCorrectionMs: 50,
    });
    expect(receipt.corrected).toBe(true);
    expect(receipt.correctionSamples).toBe(-2_400);
  });

  it("virtualizes frame and track ranges for long timelines", () => {
    expect(
      planStudioTimelineVirtualWindow({
        scrollLeft: 10_000,
        viewportWidth: 1_000,
        pixelsPerFrame: 2,
        scrollTop: 3_000,
        viewportHeight: 600,
        rowHeight: 60,
        durationFrames: 100_000,
        trackCount: 500,
      }),
    ).toEqual({
      startFrame: 4_976,
      endFrameExclusive: 5_524,
      startTrackIndex: 46,
      endTrackIndexExclusive: 64,
      overscanFrames: 24,
      overscanTracks: 4,
    });
  });

  it("commits cel and camera edits as one atomic history transaction", () => {
    const transaction = transactStudioTimeline(timeline, "timeline-tx", [
      {
        type: "add-cel",
        trackId: "cel",
        cel: { id: "cel-1", assetHash: "sha256-cel", startFrame: 0, exposureFrames: 3 },
      },
      {
        type: "add-keyframe",
        trackId: "camera",
        keyframe: { id: "camera-1", frame: 12, value: 1.25, interpolation: "bezier" },
      },
    ]);
    expect(transaction.after.tracks[0]?.cels).toHaveLength(1);
    expect(transaction.after.tracks[1]?.keyframes).toHaveLength(1);
    expect(transaction.beforeHash).not.toBe(transaction.afterHash);
  });

  it("removes partial export objects when cancelled during preparation", () => {
    expect(
      cancelStudioTimelineExport({
        id: "export-1",
        format: "mp4",
        status: "preparing",
        temporaryObjectKeys: ["tmp/audio", "tmp/video"],
      }),
    ).toEqual({
      id: "export-1",
      format: "mp4",
      status: "cancelled",
      temporaryObjectKeys: [],
    });
  });
});
