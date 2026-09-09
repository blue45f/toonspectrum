import { studioDeterministicContentId } from "../studio-deterministic-serialization";

export interface StudioRationalRate {
  readonly numerator: number;
  readonly denominator: number;
  readonly dropFrame: boolean;
}

export const STUDIO_TIMELINE_RATES = Object.freeze({
  fps24: Object.freeze({ numerator: 24, denominator: 1, dropFrame: false }),
  fps25: Object.freeze({ numerator: 25, denominator: 1, dropFrame: false }),
  fps2997: Object.freeze({ numerator: 30_000, denominator: 1_001, dropFrame: true }),
  fps30: Object.freeze({ numerator: 30, denominator: 1, dropFrame: false }),
  fps5994: Object.freeze({ numerator: 60_000, denominator: 1_001, dropFrame: true }),
  fps60: Object.freeze({ numerator: 60, denominator: 1, dropFrame: false }),
});

export interface StudioTimelineCel {
  readonly id: string;
  readonly assetHash: string;
  readonly startFrame: number;
  readonly exposureFrames: number;
  readonly sourceCelId?: string;
}

export interface StudioTimelineKeyframe {
  readonly id: string;
  readonly frame: number;
  readonly value: number;
  readonly interpolation: "hold" | "linear" | "bezier";
  readonly inTangent?: readonly [number, number];
  readonly outTangent?: readonly [number, number];
}

export interface StudioTimelineTrack {
  readonly id: string;
  readonly kind: "cel" | "transform" | "opacity" | "camera" | "audio" | "marker" | "bone";
  readonly cels?: readonly StudioTimelineCel[];
  readonly keyframes?: readonly StudioTimelineKeyframe[];
  readonly muted?: boolean;
  readonly locked?: boolean;
}

export interface StudioTimelineDocument {
  readonly version: 1;
  readonly id: string;
  readonly revision: number;
  readonly rate: StudioRationalRate;
  readonly durationFrames: number;
  readonly sampleRate: number;
  readonly tracks: readonly StudioTimelineTrack[];
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${field} must be a positive integer.`);
  return value;
}

export function normalizeStudioTimelineRate(rate: StudioRationalRate): StudioRationalRate {
  const numerator = positiveInteger(rate.numerator, "rate.numerator");
  const denominator = positiveInteger(rate.denominator, "rate.denominator");
  const gcd = (left: number, right: number): number => (right === 0 ? left : gcd(right, left % right));
  const divisor = gcd(numerator, denominator);
  const normalized = { numerator: numerator / divisor, denominator: denominator / divisor, dropFrame: rate.dropFrame };
  if (normalized.dropFrame && !(
    (normalized.numerator === 30_000 && normalized.denominator === 1_001) ||
    (normalized.numerator === 60_000 && normalized.denominator === 1_001)
  )) {
    throw new RangeError("drop-frame timecode is supported only for 29.97 and 59.94 fps.");
  }
  return Object.freeze(normalized);
}

export function studioTimelineFramesToSeconds(frames: number, rate: StudioRationalRate): number {
  if (!Number.isFinite(frames)) throw new TypeError("frames must be finite.");
  const normalized = normalizeStudioTimelineRate(rate);
  return (frames * normalized.denominator) / normalized.numerator;
}

export function studioTimelineSecondsToFrame(
  seconds: number,
  rate: StudioRationalRate,
  rounding: "floor" | "round" | "ceil" = "round",
): number {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("seconds must be finite and non-negative.");
  const normalized = normalizeStudioTimelineRate(rate);
  const raw = (seconds * normalized.numerator) / normalized.denominator;
  return Math[rounding](raw);
}

export function studioTimelineFrameToAudioSample(
  frame: number,
  rate: StudioRationalRate,
  sampleRate: number,
): number {
  positiveInteger(sampleRate, "sampleRate");
  return Math.round(studioTimelineFramesToSeconds(frame, rate) * sampleRate);
}

export function studioTimelineAudioSampleToFrame(
  sample: number,
  rate: StudioRationalRate,
  sampleRate: number,
): number {
  if (!Number.isSafeInteger(sample) || sample < 0) throw new RangeError("sample must be non-negative.");
  positiveInteger(sampleRate, "sampleRate");
  return studioTimelineSecondsToFrame(sample / sampleRate, rate, "round");
}

export interface StudioAudioDriftReceipt {
  readonly expectedSample: number;
  readonly observedSample: number;
  readonly driftSamples: number;
  readonly driftMs: number;
  readonly correctionSamples: number;
  readonly corrected: boolean;
}

export function planStudioAudioDriftCorrection(input: {
  readonly frame: number;
  readonly observedSample: number;
  readonly rate: StudioRationalRate;
  readonly sampleRate: number;
  readonly toleranceMs?: number;
  readonly maxCorrectionMs?: number;
}): StudioAudioDriftReceipt {
  const expectedSample = studioTimelineFrameToAudioSample(input.frame, input.rate, input.sampleRate);
  const driftSamples = input.observedSample - expectedSample;
  const driftMs = (driftSamples / input.sampleRate) * 1_000;
  const toleranceMs = input.toleranceMs ?? 8;
  const maxCorrection = Math.round(((input.maxCorrectionMs ?? 80) / 1_000) * input.sampleRate);
  const correctionSamples = Math.abs(driftMs) <= toleranceMs
    ? 0
    : Math.max(-maxCorrection, Math.min(maxCorrection, -driftSamples));
  return Object.freeze({
    expectedSample,
    observedSample: input.observedSample,
    driftSamples,
    driftMs,
    correctionSamples,
    corrected: correctionSamples !== 0,
  });
}

export interface StudioTimelineVirtualWindow {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  readonly startTrackIndex: number;
  readonly endTrackIndexExclusive: number;
  readonly overscanFrames: number;
  readonly overscanTracks: number;
}

export function planStudioTimelineVirtualWindow(input: {
  readonly scrollLeft: number;
  readonly viewportWidth: number;
  readonly pixelsPerFrame: number;
  readonly scrollTop: number;
  readonly viewportHeight: number;
  readonly rowHeight: number;
  readonly durationFrames: number;
  readonly trackCount: number;
  readonly overscanFrames?: number;
  readonly overscanTracks?: number;
}): StudioTimelineVirtualWindow {
  if (input.pixelsPerFrame <= 0 || input.rowHeight <= 0) throw new RangeError("timeline scales must be positive.");
  const overscanFrames = Math.max(0, Math.floor(input.overscanFrames ?? 24));
  const overscanTracks = Math.max(0, Math.floor(input.overscanTracks ?? 4));
  const visibleStart = Math.floor(Math.max(0, input.scrollLeft) / input.pixelsPerFrame);
  const visibleEnd = Math.ceil((Math.max(0, input.scrollLeft) + input.viewportWidth) / input.pixelsPerFrame);
  const visibleTrackStart = Math.floor(Math.max(0, input.scrollTop) / input.rowHeight);
  const visibleTrackEnd = Math.ceil((Math.max(0, input.scrollTop) + input.viewportHeight) / input.rowHeight);
  return Object.freeze({
    startFrame: Math.max(0, visibleStart - overscanFrames),
    endFrameExclusive: Math.min(input.durationFrames, visibleEnd + overscanFrames),
    startTrackIndex: Math.max(0, visibleTrackStart - overscanTracks),
    endTrackIndexExclusive: Math.min(input.trackCount, visibleTrackEnd + overscanTracks),
    overscanFrames,
    overscanTracks,
  });
}

export type StudioTimelineMutation =
  | { readonly type: "add-cel"; readonly trackId: string; readonly cel: StudioTimelineCel }
  | { readonly type: "remove-cel"; readonly trackId: string; readonly celId: string }
  | { readonly type: "add-keyframe"; readonly trackId: string; readonly keyframe: StudioTimelineKeyframe }
  | { readonly type: "remove-keyframe"; readonly trackId: string; readonly keyframeId: string }
  | { readonly type: "set-duration"; readonly durationFrames: number };

export interface StudioTimelineTransaction {
  readonly id: string;
  readonly before: StudioTimelineDocument;
  readonly after: StudioTimelineDocument;
  readonly beforeHash: string;
  readonly afterHash: string;
}

function validateStudioTimelineDocument(document: StudioTimelineDocument): void {
  normalizeStudioTimelineRate(document.rate);
  positiveInteger(document.durationFrames, "durationFrames");
  positiveInteger(document.sampleRate, "sampleRate");
  const trackIds = new Set<string>();
  for (const track of document.tracks) {
    if (!track.id.trim() || trackIds.has(track.id)) throw new TypeError("timeline track ids must be unique and non-empty.");
    trackIds.add(track.id);
    for (const cel of track.cels ?? []) {
      if (cel.startFrame < 0 || cel.exposureFrames < 1 || cel.startFrame + cel.exposureFrames > document.durationFrames) {
        throw new RangeError(`cel ${cel.id} is outside the timeline.`);
      }
    }
    for (const keyframe of track.keyframes ?? []) {
      if (keyframe.frame < 0 || keyframe.frame >= document.durationFrames) {
        throw new RangeError(`keyframe ${keyframe.id} is outside the timeline.`);
      }
    }
  }
}

export function transactStudioTimeline(
  document: StudioTimelineDocument,
  transactionId: string,
  mutations: readonly StudioTimelineMutation[],
): StudioTimelineTransaction {
  if (!transactionId.trim()) throw new TypeError("timeline transaction id is required.");
  validateStudioTimelineDocument(document);
  let durationFrames = document.durationFrames;
  let tracks = document.tracks.map((track) => ({ ...track }));
  for (const mutation of mutations) {
    if (mutation.type === "set-duration") {
      durationFrames = positiveInteger(mutation.durationFrames, "durationFrames");
      continue;
    }
    const index = tracks.findIndex((track) => track.id === mutation.trackId);
    if (index < 0) throw new TypeError(`timeline track not found: ${mutation.trackId}`);
    const track = tracks[index]!;
    if (track.locked) throw new Error(`timeline track is locked: ${track.id}`);
    if (mutation.type === "add-cel") {
      tracks[index] = { ...track, cels: Object.freeze([...(track.cels ?? []), mutation.cel]) };
    } else if (mutation.type === "remove-cel") {
      tracks[index] = { ...track, cels: Object.freeze((track.cels ?? []).filter((cel) => cel.id !== mutation.celId)) };
    } else if (mutation.type === "add-keyframe") {
      tracks[index] = { ...track, keyframes: Object.freeze([...(track.keyframes ?? []), mutation.keyframe]) };
    } else {
      tracks[index] = {
        ...track,
        keyframes: Object.freeze((track.keyframes ?? []).filter((keyframe) => keyframe.id !== mutation.keyframeId)),
      };
    }
  }
  const after = Object.freeze({
    ...document,
    revision: document.revision + 1,
    durationFrames,
    tracks: Object.freeze(tracks.map((track) => Object.freeze(track))),
  });
  validateStudioTimelineDocument(after);
  return Object.freeze({
    id: transactionId.trim(),
    before: document,
    after,
    beforeHash: studioDeterministicContentId(document),
    afterHash: studioDeterministicContentId(after),
  });
}

export interface StudioTimelineExportSession {
  readonly id: string;
  readonly format: "gif" | "mp4" | "webm" | "png-sequence" | "animatic-pdf";
  readonly status: "preparing" | "rendering" | "muxing" | "completed" | "cancelled" | "failed";
  readonly temporaryObjectKeys: readonly string[];
}

export function cancelStudioTimelineExport(session: StudioTimelineExportSession): StudioTimelineExportSession {
  if (session.status === "completed" || session.status === "failed" || session.status === "cancelled") return session;
  return Object.freeze({ ...session, status: "cancelled" as const, temporaryObjectKeys: Object.freeze([]) });
}

export function failStudioTimelineExport(session: StudioTimelineExportSession): StudioTimelineExportSession {
  if (session.status === "completed") throw new Error("completed timeline export cannot fail retroactively.");
  return Object.freeze({ ...session, status: "failed" as const, temporaryObjectKeys: Object.freeze([]) });
}
