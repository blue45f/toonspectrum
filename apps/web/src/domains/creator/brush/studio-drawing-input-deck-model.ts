import type {
  StudioPressureCurveUi,
  StudioStabilizerModeUi,
} from "./StudioDrawOptionsBar";

export type StudioDrawingInputProfileId =
  | "direct"
  | "sketch"
  | "ink"
  | "precision"
  | "mouse-touch";

export type StudioDrawingTelemetryChannel =
  | "pointerrawupdate"
  | "pointermove"
  | "pointerdown";

export type StudioDrawingPointerType = "pen" | "touch" | "mouse" | "unknown";

export interface StudioDrawingInputSnapshot {
  readonly stabilizer: number;
  readonly stabilizerMode: StudioStabilizerModeUi;
  readonly postCorrection: number;
  readonly pressureCurveId: StudioPressureCurveUi;
  /** Null means the active brush does not expose a minimum pressure-size floor. */
  readonly stampMinSize: number | null;
}

export interface StudioDrawingInputProfile {
  readonly id: StudioDrawingInputProfileId;
  readonly label: string;
  readonly description: string;
  readonly useCase: string;
  readonly stabilizer: number;
  readonly stabilizerMode: StudioStabilizerModeUi;
  readonly postCorrection: number;
  readonly pressureCurveId: StudioPressureCurveUi;
  readonly stampMinSize: number;
}

export interface StudioDrawingInputProfilePlan {
  readonly profile: StudioDrawingInputProfile;
  readonly next: StudioDrawingInputSnapshot;
  readonly changed: readonly (keyof StudioDrawingInputSnapshot)[];
}

export interface StudioDrawingPointerEventLike {
  readonly pointerId?: unknown;
  readonly pointerType?: unknown;
  readonly pressure?: unknown;
  readonly tiltX?: unknown;
  readonly tiltY?: unknown;
  readonly twist?: unknown;
  readonly tangentialPressure?: unknown;
  readonly altitudeAngle?: unknown;
  readonly azimuthAngle?: unknown;
  readonly width?: unknown;
  readonly height?: unknown;
  readonly buttons?: unknown;
  readonly timeStamp?: unknown;
  readonly getCoalescedEvents?: unknown;
  readonly getPredictedEvents?: unknown;
}

export interface StudioDrawingTelemetryFrame {
  readonly pointerId: number;
  readonly pointerType: StudioDrawingPointerType;
  readonly channel: StudioDrawingTelemetryChannel;
  readonly timeStamp: number;
  readonly sampleCount: number;
  readonly predictedCount: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly tiltMagnitude: number;
  readonly twist: number;
  readonly tangentialPressure: number;
  readonly altitudeAngle: number | null;
  readonly azimuthAngle: number | null;
  readonly contactWidth: number;
  readonly contactHeight: number;
  readonly hovering: boolean;
  readonly coalescedSupported: boolean;
  readonly predictedSupported: boolean;
}

export type StudioDrawingInputQuality =
  | "idle"
  | "compatibility"
  | "limited"
  | "good"
  | "excellent";

export interface StudioDrawingTelemetrySummary {
  readonly latest: StudioDrawingTelemetryFrame;
  readonly quality: StudioDrawingInputQuality;
  readonly preferredChannel: "pointerrawupdate" | "pointermove" | "pointerdown";
  readonly sampleRateHz: number | null;
  readonly pressureMinimum: number | null;
  readonly pressureMaximum: number | null;
  readonly pressureRange: number | null;
  readonly tiltObserved: boolean;
  readonly twistObserved: boolean;
  readonly tangentialPressureObserved: boolean;
  readonly hoverObserved: boolean;
  readonly coalescedSupported: boolean;
  readonly predictedSupported: boolean;
  readonly recentFrameCount: number;
  readonly recentSampleCount: number;
}

const STABILIZER_MODES = new Set<StudioStabilizerModeUi>([
  "standard",
  "adaptive",
  "precision",
]);
const PRESSURE_CURVES = new Set<StudioPressureCurveUi>([
  "soft",
  "linear",
  "firm",
]);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function finiteOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rounded(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function normalizePointerType(value: unknown): StudioDrawingPointerType {
  if (value === "pen" || value === "touch" || value === "mouse") return value;
  return "unknown";
}

interface SafePointerEventList {
  readonly supported: boolean;
  readonly samples: readonly StudioDrawingPointerEventLike[];
}

function safePointerEventList(
  event: StudioDrawingPointerEventLike,
  methodName: "getCoalescedEvents" | "getPredictedEvents"
): SafePointerEventList {
  const method = event[methodName];
  if (typeof method !== "function") {
    return Object.freeze({ supported: false, samples: Object.freeze([]) });
  }
  try {
    const result = method.call(event) as unknown;
    if (!Array.isArray(result)) {
      return Object.freeze({ supported: false, samples: Object.freeze([]) });
    }
    const samples = result.filter(
      (entry): entry is StudioDrawingPointerEventLike =>
        typeof entry === "object" && entry !== null
    );
    return Object.freeze({
      supported: true,
      samples: Object.freeze(samples),
    });
  } catch {
    // Some Safari/webview builds expose the method but throw at invocation time.
    return Object.freeze({ supported: false, samples: Object.freeze([]) });
  }
}

export const STUDIO_DRAWING_INPUT_PROFILES: readonly StudioDrawingInputProfile[] =
  Object.freeze([
    Object.freeze({
      id: "direct",
      label: "직결 드로잉",
      description: "보정 지연을 없애고 펜 끝을 그대로 따라갑니다.",
      useCase: "빠른 제스처 · 세부 묘사 · 고주사율 펜",
      stabilizer: 0,
      stabilizerMode: "standard",
      postCorrection: 0,
      pressureCurveId: "linear",
      stampMinSize: 0.04,
    }),
    Object.freeze({
      id: "sketch",
      label: "러프 스케치",
      description: "가벼운 적응 보정과 부드러운 필압으로 선을 살립니다.",
      useCase: "콘티 · 러프 · 연필/목탄",
      stabilizer: 2,
      stabilizerMode: "adaptive",
      postCorrection: 0,
      pressureCurveId: "soft",
      stampMinSize: 0.06,
    }),
    Object.freeze({
      id: "ink",
      label: "웹툰 선화",
      description: "반응성과 선 정리를 균형 있게 맞춘 기본 선화 프로필입니다.",
      useCase: "G펜 · 마커 · 일반 클린업",
      stabilizer: 5,
      stabilizerMode: "adaptive",
      postCorrection: 2,
      pressureCurveId: "linear",
      stampMinSize: 0.08,
    }),
    Object.freeze({
      id: "precision",
      label: "정밀 곡선",
      description: "느린 장선과 말풍선 외곽을 위해 강한 보정을 적용합니다.",
      useCase: "장선 · 곡선 · 클린 라인",
      stabilizer: 8,
      stabilizerMode: "precision",
      postCorrection: 4,
      pressureCurveId: "firm",
      stampMinSize: 0.12,
    }),
    Object.freeze({
      id: "mouse-touch",
      label: "마우스·손가락",
      description: "고정 압력 입력의 떨림과 시작/끝 튐을 완화합니다.",
      useCase: "마우스 · 비압력 스타일러스 · 손가락",
      stabilizer: 6,
      stabilizerMode: "adaptive",
      postCorrection: 3,
      pressureCurveId: "linear",
      stampMinSize: 0.36,
    }),
  ]);

export function studioDrawingInputProfile(
  id: StudioDrawingInputProfileId
): StudioDrawingInputProfile {
  const profile = STUDIO_DRAWING_INPUT_PROFILES.find((entry) => entry.id === id);
  if (!profile) throw new Error(`Unknown Studio drawing input profile: ${id}`);
  return profile;
}

export function normalizeStudioDrawingInputSnapshot(
  snapshot: StudioDrawingInputSnapshot
): StudioDrawingInputSnapshot {
  return Object.freeze({
    stabilizer: Math.round(clamp(finiteNumber(snapshot.stabilizer, 0), 0, 10)),
    stabilizerMode: STABILIZER_MODES.has(snapshot.stabilizerMode)
      ? snapshot.stabilizerMode
      : "adaptive",
    postCorrection: Math.round(
      clamp(finiteNumber(snapshot.postCorrection, 0), 0, 10)
    ),
    pressureCurveId: PRESSURE_CURVES.has(snapshot.pressureCurveId)
      ? snapshot.pressureCurveId
      : "linear",
    stampMinSize:
      snapshot.stampMinSize === null
        ? null
        : rounded(clamp(finiteNumber(snapshot.stampMinSize, 0), 0, 1)),
  });
}

export function planStudioDrawingInputProfile(
  currentInput: StudioDrawingInputSnapshot,
  profileId: StudioDrawingInputProfileId
): StudioDrawingInputProfilePlan {
  const current = normalizeStudioDrawingInputSnapshot(currentInput);
  const profile = studioDrawingInputProfile(profileId);
  const next = normalizeStudioDrawingInputSnapshot({
    stabilizer: profile.stabilizer,
    stabilizerMode: profile.stabilizerMode,
    postCorrection: profile.postCorrection,
    pressureCurveId: profile.pressureCurveId,
    stampMinSize: current.stampMinSize === null ? null : profile.stampMinSize,
  });
  const changed = (
    Object.keys(next) as readonly (keyof StudioDrawingInputSnapshot)[]
  ).filter((key) => next[key] !== current[key]);
  return Object.freeze({ profile, next, changed: Object.freeze(changed) });
}

export function studioDrawingInputProfileMatches(
  current: StudioDrawingInputSnapshot,
  profileId: StudioDrawingInputProfileId
): boolean {
  return planStudioDrawingInputProfile(current, profileId).changed.length === 0;
}

export function captureStudioDrawingTelemetryFrame(
  event: StudioDrawingPointerEventLike,
  channel: StudioDrawingTelemetryChannel,
  fallbackTimeStamp = 0
): StudioDrawingTelemetryFrame {
  const coalesced = safePointerEventList(event, "getCoalescedEvents");
  const predicted = safePointerEventList(event, "getPredictedEvents");
  const authoritative = coalesced.samples.at(-1) ?? event;
  const pointerType = normalizePointerType(
    authoritative.pointerType ?? event.pointerType
  );
  const pressure = rounded(
    clamp(finiteNumber(authoritative.pressure ?? event.pressure, 0), 0, 1)
  );
  const tiltX = rounded(
    clamp(finiteNumber(authoritative.tiltX ?? event.tiltX, 0), -90, 90)
  );
  const tiltY = rounded(
    clamp(finiteNumber(authoritative.tiltY ?? event.tiltY, 0), -90, 90)
  );
  const rawTwist = finiteNumber(authoritative.twist ?? event.twist, 0);
  const twist = rounded(((rawTwist % 360) + 360) % 360);
  const tangentialPressure = rounded(
    clamp(
      finiteNumber(
        authoritative.tangentialPressure ?? event.tangentialPressure,
        0
      ),
      -1,
      1
    )
  );
  const altitudeRadians = finiteOptionalNumber(
    authoritative.altitudeAngle ?? event.altitudeAngle
  );
  const azimuthRadians = finiteOptionalNumber(
    authoritative.azimuthAngle ?? event.azimuthAngle
  );
  const buttons = finiteNumber(authoritative.buttons ?? event.buttons, 0);
  const timeStamp = finiteNumber(
    authoritative.timeStamp ?? event.timeStamp,
    fallbackTimeStamp
  );

  return Object.freeze({
    pointerId: Math.round(
      Math.max(0, finiteNumber(authoritative.pointerId ?? event.pointerId, 0))
    ),
    pointerType,
    channel,
    timeStamp,
    sampleCount: Math.max(1, coalesced.samples.length),
    predictedCount: predicted.samples.length,
    pressure,
    tiltX,
    tiltY,
    tiltMagnitude: rounded(clamp(Math.hypot(tiltX, tiltY), 0, 90), 1),
    twist,
    tangentialPressure,
    altitudeAngle:
      altitudeRadians === null
        ? null
        : rounded(clamp((altitudeRadians * 180) / Math.PI, 0, 90), 1),
    azimuthAngle:
      azimuthRadians === null
        ? null
        : rounded((((azimuthRadians * 180) / Math.PI) % 360 + 360) % 360, 1),
    contactWidth: rounded(
      Math.max(0, finiteNumber(authoritative.width ?? event.width, 0)),
      1
    ),
    contactHeight: rounded(
      Math.max(0, finiteNumber(authoritative.height ?? event.height, 0)),
      1
    ),
    hovering: pointerType === "pen" && pressure === 0 && buttons === 0,
    coalescedSupported: coalesced.supported,
    predictedSupported: predicted.supported,
  });
}

const RECENT_PEN_PRIORITY_MS = 750;

function telemetrySubjectFrame(
  frames: readonly StudioDrawingTelemetryFrame[]
): StudioDrawingTelemetryFrame | null {
  const newest = frames.at(-1);
  if (!newest) return null;
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const candidate = frames[index];
    if (newest.timeStamp - candidate.timeStamp > RECENT_PEN_PRIORITY_MS) break;
    if (candidate.pointerType === "pen") return candidate;
  }
  return newest;
}

function subjectTelemetryFrames(
  frames: readonly StudioDrawingTelemetryFrame[],
  subject: StudioDrawingTelemetryFrame
): readonly StudioDrawingTelemetryFrame[] {
  return frames.filter(
    (frame) =>
      frame.pointerId === subject.pointerId &&
      frame.pointerType === subject.pointerType
  );
}

function preferredTelemetryFrames(
  samePointer: readonly StudioDrawingTelemetryFrame[]
): readonly StudioDrawingTelemetryFrame[] {
  const rawFrames = samePointer.filter(
    (frame) => frame.channel === "pointerrawupdate"
  );
  if (rawFrames.length >= 2) return rawFrames;
  const moveFrames = samePointer.filter((frame) => frame.channel === "pointermove");
  if (moveFrames.length >= 2) return moveFrames;
  return samePointer;
}

export function summarizeStudioDrawingTelemetry(
  inputFrames: readonly StudioDrawingTelemetryFrame[]
): StudioDrawingTelemetrySummary | null {
  const frames = inputFrames.slice(-96);
  const latest = telemetrySubjectFrame(frames);
  if (!latest) return null;
  const subjectFrames = subjectTelemetryFrames(frames, latest);
  const preferred = preferredTelemetryFrames(subjectFrames);
  const first = preferred.at(0) ?? latest;
  const last = preferred.at(-1) ?? latest;
  const durationMs = last.timeStamp - first.timeStamp;
  const recentSampleCount = preferred.reduce(
    (total, frame) => total + frame.sampleCount,
    0
  );
  const sampleRateHz =
    preferred.length >= 2 && durationMs > 8
      ? rounded(
          clamp(((Math.max(1, recentSampleCount) - 1) * 1000) / durationMs, 0, 1000),
          1
        )
      : null;
  const contactPressures = preferred
    .filter((frame) => frame.pointerType === "pen" && !frame.hovering)
    .map((frame) => frame.pressure);
  const pressureMinimum =
    contactPressures.length > 0 ? Math.min(...contactPressures) : null;
  const pressureMaximum =
    contactPressures.length > 0 ? Math.max(...contactPressures) : null;
  const pressureRange =
    pressureMinimum === null || pressureMaximum === null
      ? null
      : rounded(pressureMaximum - pressureMinimum);
  const coalescedSupported = subjectFrames.some(
    (frame) => frame.coalescedSupported
  );
  const predictedSupported = subjectFrames.some(
    (frame) => frame.predictedSupported
  );
  const quality: StudioDrawingInputQuality =
    latest.pointerType === "mouse" || latest.pointerType === "touch"
      ? "compatibility"
      : latest.pointerType !== "pen" || sampleRateHz === null
        ? "limited"
        : sampleRateHz >= 120 && coalescedSupported
          ? "excellent"
          : sampleRateHz >= 55
            ? "good"
            : "limited";

  return Object.freeze({
    latest,
    quality,
    preferredChannel: preferred.at(-1)?.channel ?? latest.channel,
    sampleRateHz,
    pressureMinimum,
    pressureMaximum,
    pressureRange,
    tiltObserved: subjectFrames.some((frame) => frame.tiltMagnitude >= 1),
    twistObserved: subjectFrames.some((frame) => frame.twist >= 1),
    tangentialPressureObserved: subjectFrames.some(
      (frame) => Math.abs(frame.tangentialPressure) >= 0.01
    ),
    hoverObserved: subjectFrames.some((frame) => frame.hovering),
    coalescedSupported,
    predictedSupported,
    recentFrameCount: preferred.length,
    recentSampleCount,
  });
}

export function recommendStudioDrawingInputProfile(
  summary: StudioDrawingTelemetrySummary | null
): StudioDrawingInputProfileId {
  if (!summary) return "ink";
  if (
    summary.latest.pointerType === "mouse" ||
    summary.latest.pointerType === "touch"
  ) {
    return "mouse-touch";
  }
  if (summary.latest.pointerType !== "pen") return "ink";
  if (
    summary.sampleRateHz !== null &&
    summary.sampleRateHz >= 160 &&
    summary.coalescedSupported &&
    (summary.pressureRange ?? 0) >= 0.3
  ) {
    return "direct";
  }
  if (summary.tiltObserved && (summary.pressureRange ?? 0) >= 0.2) {
    return "sketch";
  }
  if (summary.sampleRateHz !== null && summary.sampleRateHz < 45) {
    return "precision";
  }
  return "ink";
}

export function formatStudioDrawingTelemetryReport(
  summary: StudioDrawingTelemetrySummary | null
): string {
  if (!summary) {
    return [
      "ToonStudio drawing input report",
      "status=idle",
      "privacy=coordinates-and-stroke-content-not-collected",
    ].join("\n");
  }

  const value = (input: number | null, digits = 1): string =>
    input === null ? "n/a" : input.toFixed(digits);
  const observed = (input: boolean): string => (input ? "yes" : "no");

  return [
    "ToonStudio drawing input report",
    `pointer=${summary.latest.pointerType}`,
    `quality=${summary.quality}`,
    `channel=${summary.preferredChannel}`,
    `sample-rate-hz=${value(summary.sampleRateHz)}`,
    `pressure-current=${value(summary.latest.pressure, 3)}`,
    `pressure-min=${value(summary.pressureMinimum, 3)}`,
    `pressure-max=${value(summary.pressureMaximum, 3)}`,
    `pressure-range=${value(summary.pressureRange, 3)}`,
    `tilt-deg=${value(summary.latest.tiltMagnitude)}`,
    `twist-deg=${value(summary.latest.twist)}`,
    `altitude-deg=${value(summary.latest.altitudeAngle)}`,
    `azimuth-deg=${value(summary.latest.azimuthAngle)}`,
    `tangential-pressure=${value(summary.latest.tangentialPressure, 3)}`,
    `contact=${summary.latest.contactWidth.toFixed(1)}x${summary.latest.contactHeight.toFixed(1)}`,
    `coalesced=${observed(summary.coalescedSupported)}`,
    `predicted=${observed(summary.predictedSupported)}`,
    `hover=${observed(summary.hoverObserved)}`,
    `frames=${summary.recentFrameCount}`,
    `samples=${summary.recentSampleCount}`,
    "privacy=coordinates-and-stroke-content-not-collected",
  ].join("\n");
}
