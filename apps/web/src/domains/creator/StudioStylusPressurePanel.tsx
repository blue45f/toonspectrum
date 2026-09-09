import {
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";

import {
  DEFAULT_STUDIO_PEN_BUTTON_POLICY,
} from "./brush/studio-pen-button-policy";
import {
  getStudioPenButtonPolicySnapshot,
  setStudioPenButtonPolicy,
  subscribeStudioPenButtonPolicy,
} from "./brush/studio-pen-button-policy-store";

import {
  DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE,
  STUDIO_STYLUS_PRESSURE_PROFILE_POINT_LIMIT,
  fitStudioStylusPressureProfile,
  normalizeStudioStylusPressureProfile,
  resolveStudioStylusPressureInput,
  studioStylusPressurePreset,
  studioStylusPressureProfileMap,
  type StudioStylusPressurePoint,
  type StudioStylusPressurePresetId,
  type StudioStylusPressureProfile,
} from "./brush/studio-stylus-pressure-profile";
import {
  getStudioStylusPressureProfileSnapshot,
  resetStudioStylusPressureProfile,
  setStudioStylusPressureProfile,
  subscribeStudioStylusPressureProfile,
} from "./brush/studio-stylus-pressure-profile-store";

import { cn } from "@/shared/lib/utils";

const CURVE_W = 260;
const CURVE_H = 132;
const CURVE_PAD = 10;
const TEST_W = 320;
const TEST_H = 76;
const TEST_POINT_LIMIT = 220;
const MIN_POINT_GAP = 0.025;

interface TestPoint {
  readonly x: number;
  readonly y: number;
  readonly rawPressure: number;
  readonly mappedPressure: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly timeStamp: number;
}

interface InputHealth {
  readonly deliveries: number;
  readonly sampleCount: number;
  readonly coalescedSampleCount: number;
  readonly duplicateCount: number;
  readonly timeRegressionCount: number;
  readonly maximumGapPx: number;
  readonly totalDeliveryDelayMs: number;
  readonly delayedSampleCount: number;
  readonly pointerType: string;
}

const EMPTY_INPUT_HEALTH: InputHealth = Object.freeze({
  deliveries: 0,
  sampleCount: 0,
  coalescedSampleCount: 0,
  duplicateCount: 0,
  timeRegressionCount: 0,
  maximumGapPx: 0,
  totalDeliveryDelayMs: 0,
  delayedSampleCount: 0,
  pointerType: "대기",
});

const PRESETS: readonly Readonly<{
  id: StudioStylusPressurePresetId;
  label: string;
  description: string;
}>[] = Object.freeze([
  { id: "linear", label: "선형", description: "장치 입력을 그대로 사용" },
  { id: "light-touch", label: "가벼운 터치", description: "약한 압력을 빠르게 살림" },
  { id: "firm-touch", label: "단단한 터치", description: "중·고압 중심의 단단한 반응" },
  { id: "inking", label: "잉킹", description: "초입 제어와 중압 표현을 함께 확보" },
]);

type CoalescedPointerEvent = PointerEvent & {
  getCoalescedEvents?: () => readonly PointerEvent[];
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function pressurePercent(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function profilePointRawInput(
  profile: StudioStylusPressureProfile,
  point: StudioStylusPressurePoint,
): number {
  return profile.deadZone + point.input * (profile.saturation - profile.deadZone);
}

function graphX(rawInput: number): number {
  return CURVE_PAD + clamp01(rawInput) * (CURVE_W - CURVE_PAD * 2);
}

function graphY(output: number): number {
  return CURVE_H - CURVE_PAD - clamp01(output) * (CURVE_H - CURVE_PAD * 2);
}

function profileCurvePath(profile: StudioStylusPressureProfile): string {
  return Array.from({ length: 65 }, (_, index) => {
    const raw = index / 64;
    const x = graphX(raw);
    const y = graphY(studioStylusPressureProfileMap(raw, profile));
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function safeCoalescedPointerEvents(event: PointerEvent): readonly PointerEvent[] {
  const method = (event as CoalescedPointerEvent).getCoalescedEvents;
  if (typeof method !== "function") return [event];
  try {
    const samples = method.call(event);
    return samples.length > 0 ? samples : [event];
  } catch {
    return [event];
  }
}

function normalizedPressure(event: PointerEvent): number {
  const pressure = Number.isFinite(event.pressure) ? event.pressure : 0;
  if (pressure > 0) return clamp01(pressure);
  return event.pointerType === "mouse" || event.pointerType === "touch" ? 0.5 : 0;
}

function normalizedTestPoint(
  event: PointerEvent,
  rect: DOMRect,
  profile: StudioStylusPressureProfile,
): TestPoint | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  const rawPressure = normalizedPressure(event);
  const mappedPressure = resolveStudioStylusPressureInput(
    event.pointerType,
    rawPressure,
    profile,
  );
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * TEST_W, 0, TEST_W),
    y: clamp(((event.clientY - rect.top) / rect.height) * TEST_H, 0, TEST_H),
    rawPressure,
    mappedPressure: typeof mappedPressure === "number" ? mappedPressure : rawPressure,
    clientX: event.clientX,
    clientY: event.clientY,
    timeStamp: Number.isFinite(event.timeStamp) ? event.timeStamp : 0,
  };
}

function averageDeliveryDelay(health: InputHealth): number {
  return health.delayedSampleCount > 0
    ? health.totalDeliveryDelayMs / health.delayedSampleCount
    : 0;
}

function healthGrade(health: InputHealth): Readonly<{ label: string; detail: string }> {
  if (health.sampleCount === 0) {
    return { label: "입력 대기", detail: "시험선을 그리면 장치 전달 품질을 진단합니다." };
  }
  const delay = averageDeliveryDelay(health);
  if (health.timeRegressionCount > 0 || health.maximumGapPx > 26 || delay > 30) {
    return {
      label: "점검 권장",
      detail: "브라우저·태블릿 드라이버·절전 설정을 확인하세요.",
    };
  }
  if (delay <= 12 && health.maximumGapPx <= 10 && health.duplicateCount === 0) {
    return { label: "최상", detail: "연속 샘플과 이벤트 전달 상태가 안정적입니다." };
  }
  return { label: "양호", detail: "일반적인 드로잉에 충분한 입력 품질입니다." };
}

function profileWithPoint(
  profile: StudioStylusPressureProfile,
  pointIndex: number,
  nextPoint: StudioStylusPressurePoint,
): StudioStylusPressureProfile {
  const points = profile.points.map((point, index) => index === pointIndex ? nextPoint : point);
  return normalizeStudioStylusPressureProfile({ ...profile, points });
}

function removeProfilePoint(
  profile: StudioStylusPressureProfile,
  pointIndex: number,
): StudioStylusPressureProfile {
  if (pointIndex <= 0 || pointIndex >= profile.points.length - 1) return profile;
  return normalizeStudioStylusPressureProfile({
    ...profile,
    points: profile.points.filter((_, index) => index !== pointIndex),
  });
}

export interface StudioStylusPressurePanelProps {
  readonly density?: "compact" | "touch";
}

export function StudioStylusPressurePanel({
  density = "compact",
}: StudioStylusPressurePanelProps): ReactElement {
  const touch = density === "touch";
  const profile = useSyncExternalStore(
    subscribeStudioStylusPressureProfile,
    getStudioStylusPressureProfileSnapshot,
    () => DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE,
  );
  const penButtonPolicy = useSyncExternalStore(
    subscribeStudioPenButtonPolicy,
    getStudioPenButtonPolicySnapshot,
    () => DEFAULT_STUDIO_PEN_BUTTON_POLICY,
  );
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [testPoints, setTestPoints] = useState<readonly TestPoint[]>([]);
  const [inputHealth, setInputHealth] = useState<InputHealth>(EMPTY_INPUT_HEALTH);
  const curvePointerIdRef = useRef<number | null>(null);
  const curvePointIndexRef = useRef<number | null>(null);
  const testPointerIdRef = useRef<number | null>(null);
  const latestTestPointRef = useRef<TestPoint | null>(null);
  const curvePath = useMemo(() => profileCurvePath(profile), [profile]);
  const rawSamples = useMemo(
    () => testPoints.map((point) => point.rawPressure),
    [testPoints],
  );
  const fittedProfile = useMemo(
    () => fitStudioStylusPressureProfile(rawSamples),
    [rawSamples],
  );
  const latest = testPoints.at(-1) ?? null;
  const grade = healthGrade(inputHealth);
  const averageCoalesced = inputHealth.deliveries > 0
    ? inputHealth.coalescedSampleCount / inputHealth.deliveries
    : 0;
  const averageDelay = averageDeliveryDelay(inputHealth);

  const updateProfile = (next: unknown): void => {
    const normalized = setStudioStylusPressureProfile(next);
    if (
      selectedPointIndex !== null
      && selectedPointIndex >= normalized.points.length
    ) {
      setSelectedPointIndex(normalized.points.length - 2);
    }
  };

  const updatePointFromClient = (
    pointIndex: number,
    clientX: number,
    clientY: number,
    svg: SVGSVGElement,
  ): void => {
    if (pointIndex <= 0 || pointIndex >= profile.points.length - 1) return;
    const rect = svg.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return;
    const rawInput = clamp01((clientX - rect.left) / rect.width);
    const output = clamp01(1 - (clientY - rect.top) / rect.height);
    const normalizedInput = clamp01(
      (rawInput - profile.deadZone) /
        Math.max(0.08, profile.saturation - profile.deadZone),
    );
    const previous = profile.points[pointIndex - 1]!;
    const next = profile.points[pointIndex + 1]!;
    updateProfile(profileWithPoint(profile, pointIndex, {
      input: clamp(
        normalizedInput,
        previous.input + MIN_POINT_GAP,
        next.input - MIN_POINT_GAP,
      ),
      output: clamp(output, previous.output, next.output),
    }));
  };

  const onCurvePointPointerDown = (
    event: ReactPointerEvent<SVGGElement>,
    pointIndex: number,
  ): void => {
    if (event.button !== 0 && event.button !== -1) return;
    if (pointIndex <= 0 || pointIndex >= profile.points.length - 1) return;
    event.preventDefault();
    event.stopPropagation();
    curvePointerIdRef.current = event.pointerId;
    curvePointIndexRef.current = pointIndex;
    setSelectedPointIndex(pointIndex);
    try {
      event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
    } catch {
      // Window-level Pointer Events remain available if capture is unsupported.
    }
    const svg = event.currentTarget.ownerSVGElement;
    if (svg) updatePointFromClient(pointIndex, event.clientX, event.clientY, svg);
  };

  const onCurvePointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (curvePointerIdRef.current !== event.pointerId) return;
    const pointIndex = curvePointIndexRef.current;
    if (pointIndex === null) return;
    event.preventDefault();
    updatePointFromClient(pointIndex, event.clientX, event.clientY, event.currentTarget);
  };

  const finishCurvePointer = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (curvePointerIdRef.current !== event.pointerId) return;
    curvePointerIdRef.current = null;
    curvePointIndexRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already have been released by the browser.
    }
  };

  const addCurvePoint = (event: ReactMouseEvent<SVGSVGElement>): void => {
    if (profile.points.length >= STUDIO_STYLUS_PRESSURE_PROFILE_POINT_LIMIT) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return;
    const rawInput = clamp01((event.clientX - rect.left) / rect.width);
    const input = clamp01(
      (rawInput - profile.deadZone) /
        Math.max(0.08, profile.saturation - profile.deadZone),
    );
    if (input <= MIN_POINT_GAP || input >= 1 - MIN_POINT_GAP) return;
    const output = clamp01(1 - (event.clientY - rect.top) / rect.height);
    const points = [...profile.points, { input, output }]
      .sort((left, right) => left.input - right.input);
    const next = normalizeStudioStylusPressureProfile({ ...profile, points });
    updateProfile(next);
    const insertedIndex = next.points.reduce((closest, point, index) => (
      Math.abs(point.input - input) < Math.abs(next.points[closest]!.input - input)
        ? index
        : closest
    ), 0);
    setSelectedPointIndex(insertedIndex);
  };

  const onPointKeyDown = (
    event: ReactKeyboardEvent<SVGGElement>,
    pointIndex: number,
  ): void => {
    const point = profile.points[pointIndex];
    if (!point || pointIndex <= 0 || pointIndex >= profile.points.length - 1) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      updateProfile(removeProfilePoint(profile, pointIndex));
      setSelectedPointIndex(null);
      return;
    }
    const previous = profile.points[pointIndex - 1]!;
    const next = profile.points[pointIndex + 1]!;
    const step = event.shiftKey ? 0.05 : 0.015;
    let input = point.input;
    let output = point.output;
    if (event.key === "ArrowLeft") input -= step;
    else if (event.key === "ArrowRight") input += step;
    else if (event.key === "ArrowUp") output += step;
    else if (event.key === "ArrowDown") output -= step;
    else if (event.key === "Home") output = previous.output;
    else if (event.key === "End") output = next.output;
    else return;
    event.preventDefault();
    setSelectedPointIndex(pointIndex);
    updateProfile(profileWithPoint(profile, pointIndex, {
      input: clamp(input, previous.input + MIN_POINT_GAP, next.input - MIN_POINT_GAP),
      output: clamp(output, previous.output, next.output),
    }));
  };

  const appendTestPoints = (
    event: ReactPointerEvent<SVGSVGElement>,
    replace: boolean,
  ): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nativeSamples = safeCoalescedPointerEvents(event.nativeEvent);
    const points = nativeSamples
      .map((sample) => normalizedTestPoint(sample, rect, profile))
      .filter((sample): sample is TestPoint => sample !== null);
    if (points.length === 0) return;

    const processingTime = globalThis.performance?.now?.() ?? event.timeStamp;
    setInputHealth((current) => {
      const base = replace ? EMPTY_INPUT_HEALTH : current;
      let previous = replace ? null : latestTestPointRef.current;
      let duplicateCount = base.duplicateCount;
      let timeRegressionCount = base.timeRegressionCount;
      let maximumGapPx = base.maximumGapPx;
      let totalDeliveryDelayMs = base.totalDeliveryDelayMs;
      let delayedSampleCount = base.delayedSampleCount;
      for (const point of points) {
        if (previous) {
          const gap = Math.hypot(
            point.clientX - previous.clientX,
            point.clientY - previous.clientY,
          );
          maximumGapPx = Math.max(maximumGapPx, gap);
          if (
            point.clientX === previous.clientX
            && point.clientY === previous.clientY
            && point.rawPressure === previous.rawPressure
            && point.timeStamp === previous.timeStamp
          ) duplicateCount += 1;
          if (point.timeStamp < previous.timeStamp) timeRegressionCount += 1;
        }
        const delay = processingTime - point.timeStamp;
        if (Number.isFinite(delay) && delay >= 0 && delay <= 10_000) {
          totalDeliveryDelayMs += delay;
          delayedSampleCount += 1;
        }
        previous = point;
      }
      return {
        deliveries: base.deliveries + 1,
        sampleCount: base.sampleCount + points.length,
        coalescedSampleCount: base.coalescedSampleCount + Math.max(0, points.length - 1),
        duplicateCount,
        timeRegressionCount,
        maximumGapPx,
        totalDeliveryDelayMs,
        delayedSampleCount,
        pointerType: event.pointerType || "unknown",
      };
    });
    latestTestPointRef.current = points.at(-1) ?? latestTestPointRef.current;
    setTestPoints((current) => {
      const next = replace ? points : [...current, ...points];
      return next.length > TEST_POINT_LIMIT
        ? next.slice(next.length - TEST_POINT_LIMIT)
        : next;
    });
  };

  const onTestPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (event.button !== 0 && event.button !== -1) return;
    event.preventDefault();
    testPointerIdRef.current = event.pointerId;
    latestTestPointRef.current = null;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The normal pointer stream is still sufficient for the calibration lane.
    }
    appendTestPoints(event, true);
  };

  const onTestPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (testPointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    appendTestPoints(event, false);
  };

  const finishTestPointer = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (testPointerIdRef.current !== event.pointerId) return;
    testPointerIdRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already be released.
    }
  };

  const clearTest = (): void => {
    latestTestPointRef.current = null;
    setTestPoints([]);
    setInputHealth(EMPTY_INPUT_HEALTH);
  };

  return (
    <details
      data-studio-stylus-pressure-panel="true"
      className="group mt-2.5 rounded-lg border border-line/55 bg-canvas/45 p-2"
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-2 rounded-md text-[0.62rem] font-bold text-fg-2 outline-none focus-visible:ring-2 focus-visible:ring-accent/45 [&::-webkit-details-marker]:hidden",
          touch ? "min-h-11" : "min-h-9",
        )}
      >
        <span>장치 필압 프로필 · 입력 진단</span>
        <span className="text-[0.54rem] font-semibold text-fg-3 group-open:hidden">
          다중 제어점 · 데드존 · 포화점
        </span>
        <span className="hidden text-[0.54rem] font-semibold text-fg-3 group-open:inline">
          접기
        </span>
      </summary>

      <div className="mt-2 border-t border-line/45 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[0.62rem] font-bold text-fg-2">장치 전처리</p>
            <p className="mt-0.5 text-[0.54rem] leading-relaxed text-fg-3">
              브러시별 감마 전에 적용하며, 작품에는 보정된 샘플만 기록합니다.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={profile.enabled}
            onClick={() => updateProfile({ ...profile, enabled: !profile.enabled })}
            className={cn(
              "rounded-full border px-2.5 text-[0.56rem] font-bold transition-colors",
              touch ? "min-h-11" : "min-h-8",
              profile.enabled
                ? "border-accent/55 bg-accent-soft text-accent"
                : "border-line/70 bg-raised text-fg-3",
            )}
          >
            {profile.enabled ? "사용 중" : "사용 안 함"}
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5" aria-label="장치 필압 프리셋">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-studio-stylus-pressure-preset={preset.id}
              title={preset.description}
              onClick={() => {
                updateProfile(studioStylusPressurePreset(preset.id));
                setSelectedPointIndex(null);
              }}
              className={cn(
                "rounded-md border border-line/65 bg-card/55 px-2 text-left text-[0.56rem] font-semibold text-fg-2 hover:border-accent/45 hover:bg-accent-soft/45",
                touch ? "min-h-11" : "min-h-8",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <svg
          role="group"
          aria-label="장치 필압 다중 제어점 곡선"
          viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
          data-studio-stylus-pressure-curve="true"
          className={cn(
            "mt-2 block w-full touch-none select-none rounded-md border border-line/45 bg-card/65 text-accent",
            touch ? "h-40" : "h-32",
          )}
          onDoubleClick={addCurvePoint}
          onPointerMove={onCurvePointerMove}
          onPointerUp={finishCurvePointer}
          onPointerCancel={finishCurvePointer}
        >
          {[0.25, 0.5, 0.75].map((ratio) => (
            <g key={ratio} aria-hidden="true" className="text-fg-3">
              <line
                x1={graphX(ratio)}
                x2={graphX(ratio)}
                y1={CURVE_PAD}
                y2={CURVE_H - CURVE_PAD}
                stroke="currentColor"
                strokeOpacity={0.13}
                strokeDasharray="3 4"
              />
              <line
                x1={CURVE_PAD}
                x2={CURVE_W - CURVE_PAD}
                y1={graphY(ratio)}
                y2={graphY(ratio)}
                stroke="currentColor"
                strokeOpacity={0.13}
                strokeDasharray="3 4"
              />
            </g>
          ))}
          <line
            x1={graphX(profile.deadZone)}
            x2={graphX(profile.deadZone)}
            y1={CURVE_PAD}
            y2={CURVE_H - CURVE_PAD}
            stroke="currentColor"
            strokeOpacity={0.32}
            strokeDasharray="2 3"
            aria-hidden="true"
          />
          <line
            x1={graphX(profile.saturation)}
            x2={graphX(profile.saturation)}
            y1={CURVE_PAD}
            y2={CURVE_H - CURVE_PAD}
            stroke="currentColor"
            strokeOpacity={0.32}
            strokeDasharray="2 3"
            aria-hidden="true"
          />
          <path
            d={curvePath}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            aria-hidden="true"
          />
          {profile.points.map((point, index) => {
            const endpoint = index === 0 || index === profile.points.length - 1;
            const selected = selectedPointIndex === index;
            const rawInput = profilePointRawInput(profile, point);
            return (
              <g
                key={`${index}-${point.input.toFixed(4)}-${point.output.toFixed(4)}`}
                role={endpoint ? undefined : "slider"}
                tabIndex={endpoint ? -1 : 0}
                aria-label={endpoint ? undefined : `장치 필압 제어점 ${index}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(point.output * 100)}
                aria-valuetext={`입력 ${pressurePercent(rawInput)}, 출력 ${pressurePercent(point.output)}`}
                data-studio-stylus-pressure-point={endpoint ? "endpoint" : "control"}
                onFocus={() => !endpoint && setSelectedPointIndex(index)}
                onPointerDown={(event) => onCurvePointPointerDown(event, index)}
                onKeyDown={(event) => onPointKeyDown(event, index)}
                className={endpoint ? "pointer-events-none" : "cursor-grab outline-none"}
              >
                <circle
                  cx={graphX(rawInput)}
                  cy={graphY(point.output)}
                  r={selected ? 6 : endpoint ? 3.5 : 4.8}
                  fill={selected ? "currentColor" : "var(--color-card, currentColor)"}
                  stroke="currentColor"
                  strokeWidth={selected ? 2.5 : 2}
                />
              </g>
            );
          })}
        </svg>
        <p className="mt-1 text-[0.52rem] leading-relaxed text-fg-3">
          점을 끌어 조정 · 빈 곡선을 더블클릭해 추가 · Delete로 삭제 · 화살표로 미세 조정
        </p>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[0.56rem] font-semibold text-fg-3">
            <span className="mb-1 flex justify-between gap-2">
              <span>데드존</span>
              <span className="tabular-nums">{pressurePercent(profile.deadZone)}</span>
            </span>
            <input
              type="range"
              aria-label="장치 필압 데드존"
              min={0}
              max={20}
              step={0.5}
              value={profile.deadZone * 100}
              onChange={(event) => updateProfile({
                ...profile,
                deadZone: Number(event.currentTarget.value) / 100,
              })}
              className="w-full accent-accent"
            />
          </label>
          <label className="text-[0.56rem] font-semibold text-fg-3">
            <span className="mb-1 flex justify-between gap-2">
              <span>포화점</span>
              <span className="tabular-nums">{pressurePercent(profile.saturation)}</span>
            </span>
            <input
              type="range"
              aria-label="장치 필압 포화점"
              min={70}
              max={100}
              step={0.5}
              value={profile.saturation * 100}
              onChange={(event) => updateProfile({
                ...profile,
                saturation: Number(event.currentTarget.value) / 100,
              })}
              className="w-full accent-accent"
            />
          </label>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[0.54rem] leading-relaxed text-fg-3">
            내부 제어점 {Math.max(0, profile.points.length - 2)}개 / 최대 {STUDIO_STYLUS_PRESSURE_PROFILE_POINT_LIMIT - 2}개
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={selectedPointIndex === null}
              onClick={() => {
                if (selectedPointIndex === null) return;
                updateProfile(removeProfilePoint(profile, selectedPointIndex));
                setSelectedPointIndex(null);
              }}
              className={cn(
                "rounded-md border border-line/70 px-2 text-[0.56rem] font-semibold text-fg-3 disabled:cursor-not-allowed disabled:opacity-40",
                touch ? "min-h-11" : "min-h-8",
              )}
            >
              선택 점 삭제
            </button>
            <button
              type="button"
              onClick={() => {
                resetStudioStylusPressureProfile();
                setSelectedPointIndex(null);
              }}
              className={cn(
                "rounded-md border border-line/70 px-2 text-[0.56rem] font-semibold text-fg-3",
                touch ? "min-h-11" : "min-h-8",
              )}
            >
              초기화
            </button>
          </div>
        </div>

        <div
          data-studio-pen-button-policy="true"
          className="mt-3 border-t border-line/45 pt-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[0.62rem] font-bold text-fg-2">펜 뒤집기 · 배럴 버튼</p>
              <p className="mt-0.5 text-[0.52rem] leading-relaxed text-fg-3">
                스트로크 시작 시 도구를 고정해 획 중간의 버튼 변화가 잉크를 섞지 않습니다.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="펜 뒤집기 지우개"
              aria-checked={penButtonPolicy.eraserTipEnabled}
              onClick={() => setStudioPenButtonPolicy({
                ...penButtonPolicy,
                eraserTipEnabled: !penButtonPolicy.eraserTipEnabled,
              })}
              className={cn(
                "rounded-full border px-2.5 text-[0.56rem] font-bold",
                touch ? "min-h-11" : "min-h-8",
                penButtonPolicy.eraserTipEnabled
                  ? "border-accent/55 bg-accent-soft text-accent"
                  : "border-line/70 bg-raised text-fg-3",
              )}
            >
              뒤집기 {penButtonPolicy.eraserTipEnabled ? "지우개" : "끔"}
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[0.56rem] font-semibold text-fg-3">
              <span className="mb-1 block">배럴 버튼</span>
              <select
                aria-label="펜 배럴 버튼 동작"
                value={penButtonPolicy.barrelAction}
                onChange={(event) => setStudioPenButtonPolicy({
                  ...penButtonPolicy,
                  barrelAction: event.currentTarget.value,
                })}
                className={cn(
                  "w-full rounded-md border border-line/70 bg-card px-2 text-[0.58rem] font-semibold text-fg-2",
                  touch ? "min-h-11" : "h-8",
                )}
              >
                <option value="context-menu">컨텍스트 메뉴 유지</option>
                <option value="eraser">누르는 동안 지우개</option>
              </select>
            </label>
            <label className="text-[0.56rem] font-semibold text-fg-3">
              <span className="mb-1 flex justify-between gap-2">
                <span>순간 지우개 크기</span>
                <span className="tabular-nums">{penButtonPolicy.eraserWidthScale.toFixed(1)}×</span>
              </span>
              <input
                type="range"
                aria-label="순간 지우개 크기 배율"
                min={1}
                max={4}
                step={0.25}
                value={penButtonPolicy.eraserWidthScale}
                onChange={(event) => setStudioPenButtonPolicy({
                  ...penButtonPolicy,
                  eraserWidthScale: Number(event.currentTarget.value),
                })}
                className="w-full accent-accent"
              />
            </label>
          </div>
          <p className="mt-1.5 text-[0.52rem] leading-relaxed text-fg-3">
            Pointer Events 표준의 배럴(button 2)·지우개 팁(button 5)을 사용합니다. 배럴 기본값은 우클릭 호환을 위해 컨텍스트 메뉴입니다.
          </p>
        </div>

        <div className="mt-3 border-t border-line/45 pt-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div>
              <p className="text-[0.62rem] font-bold text-fg-2">실제 펜 시험선</p>
              <p className="mt-0.5 text-[0.52rem] text-fg-3">
                약하게→강하게 한 번에 그리면 다중점 프로필을 자동 맞춤합니다.
              </p>
            </div>
            <span className="tabular-nums text-[0.56rem] font-semibold text-fg-3">
              입력 {pressurePercent(latest?.rawPressure ?? 0)} → 장치 {pressurePercent(latest?.mappedPressure ?? 0)}
            </span>
          </div>
          <svg
            role="group"
            aria-label="장치 필압 시험선 입력 영역"
            viewBox={`0 0 ${TEST_W} ${TEST_H}`}
            data-studio-stylus-pressure-test-pad="true"
            className={cn(
              "block w-full touch-none select-none rounded-md border border-line/45 bg-card/60",
              touch ? "h-24" : "h-20",
            )}
            onPointerDown={onTestPointerDown}
            onPointerMove={onTestPointerMove}
            onPointerUp={finishTestPointer}
            onPointerCancel={finishTestPointer}
          >
            <path
              d={`M0 ${TEST_H / 2} H${TEST_W}`}
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeDasharray="4 4"
              aria-hidden="true"
            />
            {testPoints.length === 0 ? (
              <text
                x={TEST_W / 2}
                y={TEST_H / 2 + 3}
                textAnchor="middle"
                fill="currentColor"
                className="text-fg-3 text-[10px]"
                aria-hidden="true"
              >
                펜을 약하게→강하게 눌러 한 획을 그리세요
              </text>
            ) : null}
            <g className="text-fg-3" aria-hidden="true">
              {testPoints.slice(1).map((point, index) => {
                const previous = testPoints[index] ?? point;
                const pressure = (previous.rawPressure + point.rawPressure) / 2;
                return (
                  <line
                    key={`raw-${index}-${point.x.toFixed(2)}-${point.y.toFixed(2)}`}
                    x1={previous.x}
                    y1={previous.y}
                    x2={point.x}
                    y2={point.y}
                    stroke="currentColor"
                    strokeOpacity={0.28}
                    strokeWidth={1 + pressure * 8}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
            <g className="text-accent" aria-hidden="true">
              {testPoints.slice(1).map((point, index) => {
                const previous = testPoints[index] ?? point;
                const pressure = (previous.mappedPressure + point.mappedPressure) / 2;
                return (
                  <line
                    key={`mapped-${index}-${point.x.toFixed(2)}-${point.y.toFixed(2)}`}
                    x1={previous.x}
                    y1={previous.y}
                    x2={point.x}
                    y2={point.y}
                    stroke="currentColor"
                    strokeOpacity={0.5 + pressure * 0.5}
                    strokeWidth={1 + pressure * 16}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          </svg>

          <div
            data-studio-stylus-input-health="true"
            className="mt-2 rounded-md border border-line/45 bg-card/45 p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.58rem] font-bold text-fg-2">입력 건강도</span>
              <span className="text-[0.58rem] font-extrabold text-accent" aria-live="polite">
                {grade.label}
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.52rem] text-fg-3">
              <span>포인터 <b className="text-fg-2">{inputHealth.pointerType}</b></span>
              <span>샘플 <b className="tabular-nums text-fg-2">{inputHealth.sampleCount}</b></span>
              <span>전달당 코얼레싱 <b className="tabular-nums text-fg-2">{averageCoalesced.toFixed(1)}</b></span>
              <span>최대 간격 <b className="tabular-nums text-fg-2">{inputHealth.maximumGapPx.toFixed(1)}px</b></span>
              <span>평균 이벤트 지연 <b className="tabular-nums text-fg-2">{averageDelay.toFixed(1)}ms</b></span>
              <span>중복/시간 역행 <b className="tabular-nums text-fg-2">{inputHealth.duplicateCount}/{inputHealth.timeRegressionCount}</b></span>
            </div>
            <p className="mt-1.5 text-[0.52rem] leading-relaxed text-fg-3">{grade.detail}</p>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
            <p className="min-w-0 flex-1 text-[0.54rem] leading-relaxed text-fg-3">
              원시 입력은 회색, 실제 장치 프로필 출력은 강조선으로 겹쳐 표시합니다.
            </p>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={clearTest}
                disabled={testPoints.length === 0}
                className={cn(
                  "rounded-md border border-line/70 px-2 text-[0.56rem] font-semibold text-fg-3 disabled:cursor-not-allowed disabled:opacity-40",
                  touch ? "min-h-11" : "min-h-8",
                )}
              >
                지우기
              </button>
              <button
                type="button"
                disabled={fittedProfile === null}
                title={fittedProfile ? "시험선 분포로 다중 제어점 프로필 적용" : "서로 다른 필압 샘플이 12개 이상 필요합니다"}
                onClick={() => {
                  if (fittedProfile) updateProfile(fittedProfile);
                }}
                className={cn(
                  "rounded-md border border-accent/45 bg-accent-soft px-2 text-[0.56rem] font-bold text-accent disabled:cursor-not-allowed disabled:opacity-40",
                  touch ? "min-h-11" : "min-h-8",
                )}
              >
                다중점 자동 맞춤
              </button>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
