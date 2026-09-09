import {
  Activity,
  Check,
  Gauge,
  MousePointer2,
  PenLine,
  RotateCcw,
  Settings2,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  STUDIO_DRAWING_INPUT_PROFILES,
  captureStudioDrawingTelemetryFrame,
  formatStudioDrawingTelemetryReport,
  normalizeStudioDrawingInputSnapshot,
  planStudioDrawingInputProfile,
  recommendStudioDrawingInputProfile,
  studioDrawingInputProfileMatches,
  summarizeStudioDrawingTelemetry,
  type StudioDrawingInputProfileId,
  type StudioDrawingInputQuality,
  type StudioDrawingInputSnapshot,
  type StudioDrawingTelemetryChannel,
  type StudioDrawingTelemetryFrame,
} from "./studio-drawing-input-deck-model";

import type { StudioDrawingInputDeckProps } from "./StudioDrawingInputDeck";

import { cn } from "@/shared/lib/utils";

const TELEMETRY_FRAME_LIMIT = 96;
const TELEMETRY_UI_INTERVAL_MS = 50;

const QUALITY_META: Readonly<
  Record<
    StudioDrawingInputQuality,
    Readonly<{ label: string; detail: string; className: string }>
  >
> = Object.freeze({
  idle: Object.freeze({
    label: "입력 대기",
    detail: "캔버스에서 펜으로 한 획을 그리면 장치 신호를 분석합니다.",
    className: "border-line bg-bg-2/70 text-fg-3",
  }),
  compatibility: Object.freeze({
    label: "호환 입력",
    detail: "마우스·손가락처럼 압력이 고정된 입력에 맞는 보정이 유리합니다.",
    className: "border-warn/35 bg-warn/10 text-warn",
  }),
  limited: Object.freeze({
    label: "입력 확인 중",
    detail: "표본이 적거나 이벤트 빈도가 낮습니다. 몇 획 더 그려 보세요.",
    className: "border-line-strong bg-raised text-fg-2",
  }),
  good: Object.freeze({
    label: "안정적 입력",
    detail: "현재 샘플 빈도에서 적응형 보정을 안정적으로 사용할 수 있습니다.",
    className: "border-good/35 bg-good/10 text-good",
  }),
  excellent: Object.freeze({
    label: "고밀도 입력",
    detail: "고주사율·coalesced 표본이 감지되어 직결형 프로필도 활용할 수 있습니다.",
    className: "border-accent/40 bg-accent-soft text-accent",
  }),
});

const POINTER_LABELS = {
  pen: "펜",
  touch: "터치",
  mouse: "마우스",
  unknown: "알 수 없음",
} as const;

const CHANNEL_LABELS = {
  pointerrawupdate: "Raw",
  pointermove: "Move + coalesced",
  pointerdown: "Down",
} as const satisfies Record<StudioDrawingTelemetryChannel, string>;

export interface StudioDrawingInputDeckPanelProps
  extends StudioDrawingInputDeckProps {
  readonly onClose: () => void;
}

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function numeric(value: number | null, suffix: string): string {
  return value === null ? "—" : `${Math.round(value)}${suffix}`;
}

function signedPercent(value: number | null): string {
  if (value === null) return "—";
  const roundedValue = Math.round(value * 100);
  return `${roundedValue > 0 ? "+" : ""}${roundedValue}%`;
}

function profileModeLabel(mode: StudioDrawingInputSnapshot["stabilizerMode"]): string {
  if (mode === "precision") return "정밀";
  if (mode === "adaptive") return "적응";
  return "표준";
}

function isCanvasTelemetryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('[data-studio-canvas-viewport="true"]'));
}

export function StudioDrawingInputDeckPanel({
  brushLabel,
  mobile,
  dockInsets,
  stabilizer,
  stabilizerMode,
  postCorrection,
  pressureCurveId,
  stampTuning,
  onStabilizerChange,
  onStabilizerModeChange,
  onPostCorrectionChange,
  onPressureCurveChange,
  onStampTuningChange,
  onOpenBrushStudio,
  onClose,
}: StudioDrawingInputDeckPanelProps): ReactElement {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const telemetryFramesRef = useRef<StudioDrawingTelemetryFrame[]>([]);
  const telemetryTimerRef = useRef<number | null>(null);
  const [telemetryFrames, setTelemetryFrames] = useState<
    readonly StudioDrawingTelemetryFrame[]
  >([]);
  const [previousSnapshot, setPreviousSnapshot] =
    useState<StudioDrawingInputSnapshot | null>(null);
  const [notice, setNotice] = useState(
    "프로필은 브러시 종류와 색·굵기를 바꾸지 않고 입력감만 조정합니다."
  );

  const currentSnapshot = useMemo(
    () =>
      normalizeStudioDrawingInputSnapshot({
        stabilizer,
        stabilizerMode,
        postCorrection,
        pressureCurveId,
        stampMinSize: stampTuning?.minSize ?? null,
      }),
    [
      postCorrection,
      pressureCurveId,
      stabilizer,
      stabilizerMode,
      stampTuning?.minSize,
    ]
  );
  const telemetry = useMemo(
    () => summarizeStudioDrawingTelemetry(telemetryFrames),
    [telemetryFrames]
  );
  const recommendedProfileId = recommendStudioDrawingInputProfile(telemetry);
  const activeProfileId = STUDIO_DRAWING_INPUT_PROFILES.find((profile) =>
    studioDrawingInputProfileMatches(currentSnapshot, profile.id)
  )?.id;
  const qualityMeta = QUALITY_META[telemetry?.quality ?? "idle"];
  const latest = telemetry?.latest ?? null;
  const tiltDirection = latest
    ? (Math.atan2(latest.tiltY, latest.tiltX) * 180) / Math.PI
    : 0;
  const right = mobile ? 12 : Math.max(12, dockInsets.right + 12);

  const applySnapshot = useCallback(
    (next: StudioDrawingInputSnapshot): void => {
      if (next.stabilizer !== currentSnapshot.stabilizer) {
        onStabilizerChange(next.stabilizer);
      }
      if (next.stabilizerMode !== currentSnapshot.stabilizerMode) {
        onStabilizerModeChange(next.stabilizerMode);
      }
      if (next.postCorrection !== currentSnapshot.postCorrection) {
        onPostCorrectionChange(next.postCorrection);
      }
      if (next.pressureCurveId !== currentSnapshot.pressureCurveId) {
        onPressureCurveChange(next.pressureCurveId);
      }
      if (
        stampTuning &&
        next.stampMinSize !== null &&
        next.stampMinSize !== currentSnapshot.stampMinSize
      ) {
        onStampTuningChange({ ...stampTuning, minSize: next.stampMinSize });
      }
    },
    [
      currentSnapshot,
      onPostCorrectionChange,
      onPressureCurveChange,
      onStabilizerChange,
      onStabilizerModeChange,
      onStampTuningChange,
      stampTuning,
    ]
  );

  const applyProfile = useCallback(
    (profileId: StudioDrawingInputProfileId): void => {
      const plan = planStudioDrawingInputProfile(currentSnapshot, profileId);
      if (plan.changed.length === 0) {
        setNotice(`${plan.profile.label} 프로필이 이미 적용되어 있습니다.`);
        return;
      }
      setPreviousSnapshot(currentSnapshot);
      applySnapshot(plan.next);
      setNotice(
        `${plan.profile.label} 적용 · 입력감 설정 ${plan.changed.length}개를 조정했습니다.`
      );
    },
    [applySnapshot, currentSnapshot]
  );

  const restorePreviousSnapshot = useCallback((): void => {
    if (!previousSnapshot) return;
    const restore = previousSnapshot;
    setPreviousSnapshot(currentSnapshot);
    applySnapshot(restore);
    setNotice("직전 입력감 설정으로 복원했습니다.");
  }, [applySnapshot, currentSnapshot, previousSnapshot]);

  const clearTelemetry = useCallback((): void => {
    telemetryFramesRef.current = [];
    setTelemetryFrames([]);
    setNotice("입력 진단 표본을 지웠습니다. 새 획부터 다시 측정합니다.");
  }, []);

  const copyTelemetryReport = useCallback(async (): Promise<void> => {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard?.writeText) {
      setNotice("이 브라우저에서는 클립보드 복사를 사용할 수 없습니다.");
      return;
    }
    try {
      await clipboard.writeText(formatStudioDrawingTelemetryReport(telemetry));
      setNotice("좌표와 획 내용을 제외한 입력 진단을 복사했습니다.");
    } catch {
      setNotice("입력 진단을 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.");
    }
  }, [telemetry]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const queueTelemetryRender = (): void => {
      if (telemetryTimerRef.current !== null) return;
      telemetryTimerRef.current = window.setTimeout(() => {
        telemetryTimerRef.current = null;
        setTelemetryFrames(telemetryFramesRef.current.slice());
      }, TELEMETRY_UI_INTERVAL_MS);
    };
    const collect = (
      event: PointerEvent,
      channel: StudioDrawingTelemetryChannel
    ): void => {
      if (!isCanvasTelemetryTarget(event.target)) return;
      telemetryFramesRef.current.push(
        captureStudioDrawingTelemetryFrame(
          event,
          channel,
          globalThis.performance?.now?.() ?? Date.now()
        )
      );
      if (telemetryFramesRef.current.length > TELEMETRY_FRAME_LIMIT) {
        telemetryFramesRef.current.splice(
          0,
          telemetryFramesRef.current.length - TELEMETRY_FRAME_LIMIT
        );
      }
      queueTelemetryRender();
    };
    const onPointerDown = (event: PointerEvent): void =>
      collect(event, "pointerdown");
    const onPointerMove = (event: PointerEvent): void =>
      collect(event, "pointermove");
    const onPointerRawUpdate = (event: Event): void =>
      collect(event as PointerEvent, "pointerrawupdate");
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };

    window.addEventListener("pointerdown", onPointerDown, {
      capture: true,
      passive: true,
    });
    window.addEventListener("pointermove", onPointerMove, {
      capture: true,
      passive: true,
    });
    window.addEventListener(
      "pointerrawupdate",
      onPointerRawUpdate as EventListener,
      { capture: true, passive: true }
    );
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener(
        "pointerrawupdate",
        onPointerRawUpdate as EventListener,
        true
      );
      window.removeEventListener("keydown", onKeyDown);
      if (telemetryTimerRef.current !== null) {
        window.clearTimeout(telemetryTimerRef.current);
        telemetryTimerRef.current = null;
      }
    };
  }, [onClose]);

  return (
    <aside
      id="studio-drawing-input-deck"
      aria-labelledby="studio-drawing-input-deck-title"
      data-studio-drawing-input-deck-panel="true"
      className="fixed bottom-[calc(8rem+env(safe-area-inset-bottom))] z-[73] flex max-h-[min(42rem,calc(100vh-9rem))] w-[min(25rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-line-strong bg-card/[0.97] shadow-[0_24px_70px_oklch(0.06_0.01_70/0.48)] backdrop-blur-2xl"
      style={{ right }}
    >
      <header className="flex shrink-0 items-start gap-2.5 border-b border-line/70 px-3 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent ring-1 ring-accent/15">
          <Activity size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="studio-drawing-input-deck-title"
            className="text-sm font-extrabold text-fg"
          >
            펜 입력 센터
          </h2>
          <p className="mt-0.5 truncate text-[0.62rem] text-fg-3">
            {brushLabel} · 실제 캔버스 입력을 작품 좌표 저장 없이 관찰
          </p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="펜 입력 센터 닫기"
          onClick={onClose}
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg border border-line text-fg-3 hover:bg-raised hover:text-fg",
            STUDIO_EASE,
            STUDIO_FOCUS_RING
          )}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 overscroll-contain">
        <section
          aria-labelledby="studio-drawing-input-health-heading"
          className="rounded-xl border border-line/70 bg-bg-2/45 p-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3
                id="studio-drawing-input-health-heading"
                className="flex items-center gap-1.5 text-[0.72rem] font-extrabold text-fg-2"
              >
                <Gauge size={14} aria-hidden="true" />
                실시간 입력 품질
              </h3>
              <p className="mt-0.5 text-[0.57rem] leading-relaxed text-fg-3">
                패널을 연 채 캔버스에 그리면 압력·기울기·회전·표본 빈도를 확인합니다.
              </p>
            </div>
            <span className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={copyTelemetryReport}
                disabled={!telemetry}
                className={cn(
                  "min-h-8 rounded-lg border border-line px-2 text-[0.58rem] font-semibold text-fg-3 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING
                )}
              >
                진단 복사
              </button>
              <button
                type="button"
                onClick={clearTelemetry}
                disabled={!telemetry}
                className={cn(
                  "min-h-8 rounded-lg border border-line px-2 text-[0.58rem] font-semibold text-fg-3 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING
                )}
              >
                지우기
              </button>
            </span>
          </div>

          <div className="mt-2 flex items-start gap-2">
            <span
              className={cn(
                "inline-flex min-h-7 shrink-0 items-center rounded-full border px-2 text-[0.58rem] font-bold",
                qualityMeta.className
              )}
            >
              {qualityMeta.label}
            </span>
            <p className="min-w-0 text-[0.57rem] leading-relaxed text-fg-3">
              {qualityMeta.detail}
            </p>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <div className="rounded-lg border border-line/60 bg-card/70 px-2 py-1.5">
              <span className="block text-[0.52rem] font-semibold text-fg-3">
                입력
              </span>
              <strong className="mt-0.5 block text-[0.68rem] text-fg">
                {latest ? POINTER_LABELS[latest.pointerType] : "—"}
              </strong>
            </div>
            <div className="rounded-lg border border-line/60 bg-card/70 px-2 py-1.5">
              <span className="block text-[0.52rem] font-semibold text-fg-3">
                유효 표본
              </span>
              <strong className="mt-0.5 block text-[0.68rem] tabular-nums text-fg">
                {numeric(telemetry?.sampleRateHz ?? null, "Hz")}
              </strong>
            </div>
            <div className="rounded-lg border border-line/60 bg-card/70 px-2 py-1.5">
              <span className="block text-[0.52rem] font-semibold text-fg-3">
                현재 필압
              </span>
              <strong className="mt-0.5 block text-[0.68rem] tabular-nums text-fg">
                {percent(latest?.pressure ?? null)}
              </strong>
            </div>
            <div className="rounded-lg border border-line/60 bg-card/70 px-2 py-1.5">
              <span className="block text-[0.52rem] font-semibold text-fg-3">
                필압 범위
              </span>
              <strong className="mt-0.5 block text-[0.68rem] tabular-nums text-fg">
                {percent(telemetry?.pressureRange ?? null)}
              </strong>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_5.25rem] gap-2 rounded-lg border border-line/55 bg-card/50 p-2">
            <div className="min-w-0 space-y-1.5">
              <div>
                <div className="mb-0.5 flex items-center justify-between text-[0.54rem] font-semibold text-fg-3">
                  <span>필압</span>
                  <span className="tabular-nums">
                    {percent(latest?.pressure ?? null)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-75 motion-reduce:transition-none"
                    style={{ width: `${Math.round((latest?.pressure ?? 0) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1 text-[0.52rem] font-semibold text-fg-3">
                <span className="rounded bg-bg-2 px-1.5 py-1">
                  기울기 {latest ? `${Math.round(latest.tiltMagnitude)}°` : "—"}
                </span>
                <span className="rounded bg-bg-2 px-1.5 py-1">
                  회전 {latest ? `${Math.round(latest.twist)}°` : "—"}
                </span>
                <span className="rounded bg-bg-2 px-1.5 py-1">
                  고도 {latest?.altitudeAngle == null
                    ? "—"
                    : `${Math.round(latest.altitudeAngle)}°`}
                </span>
                <span className="rounded bg-bg-2 px-1.5 py-1">
                  방위 {latest?.azimuthAngle == null
                    ? "—"
                    : `${Math.round(latest.azimuthAngle)}°`}
                </span>
                <span className="rounded bg-bg-2 px-1.5 py-1">
                  측압 {latest ? signedPercent(latest.tangentialPressure) : "—"}
                </span>
                <span className="rounded bg-bg-2 px-1.5 py-1">
                  접촉 {latest ? `${latest.contactWidth}×${latest.contactHeight}` : "—"}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 border-l border-line/50 pl-2">
              <span className="relative grid size-10 place-items-center rounded-full border border-line bg-bg-2">
                <span
                  aria-hidden="true"
                  className="absolute h-px w-7 origin-center bg-accent transition-transform duration-75 motion-reduce:transition-none"
                  style={{
                    transform: `rotate(${tiltDirection}deg) scaleX(${latest && latest.tiltMagnitude > 0 ? 1 : 0.2})`,
                  }}
                />
                <span className="size-1.5 rounded-full bg-fg" aria-hidden="true" />
              </span>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1" aria-label="입력 기능 감지 결과">
            <span
              className={cn(
                "rounded-full border px-2 py-1 text-[0.52rem] font-bold",
                telemetry?.coalescedSupported
                  ? "border-good/35 bg-good/10 text-good"
                  : "border-line bg-bg-2 text-fg-3"
              )}
            >
              Coalesced {telemetry?.coalescedSupported ? "감지" : "미감지"}
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-1 text-[0.52rem] font-bold",
                telemetry?.predictedSupported
                  ? "border-good/35 bg-good/10 text-good"
                  : "border-line bg-bg-2 text-fg-3"
              )}
            >
              Predicted {telemetry?.predictedSupported ? "감지" : "미감지"}
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-1 text-[0.52rem] font-bold",
                telemetry?.tiltObserved
                  ? "border-accent/35 bg-accent-soft text-accent"
                  : "border-line bg-bg-2 text-fg-3"
              )}
            >
              Tilt {telemetry?.tiltObserved ? "입력됨" : "대기"}
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-1 text-[0.52rem] font-bold",
                telemetry?.twistObserved
                  ? "border-accent/35 bg-accent-soft text-accent"
                  : "border-line bg-bg-2 text-fg-3"
              )}
            >
              Twist {telemetry?.twistObserved ? "입력됨" : "대기"}
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-1 text-[0.52rem] font-bold",
                telemetry?.tangentialPressureObserved
                  ? "border-accent/35 bg-accent-soft text-accent"
                  : "border-line bg-bg-2 text-fg-3"
              )}
            >
              Barrel {telemetry?.tangentialPressureObserved ? "입력됨" : "대기"}
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-1 text-[0.52rem] font-bold",
                telemetry?.hoverObserved
                  ? "border-accent/35 bg-accent-soft text-accent"
                  : "border-line bg-bg-2 text-fg-3"
              )}
            >
              Hover {telemetry?.hoverObserved ? "입력됨" : "대기"}
            </span>
          </div>

          <p className="mt-2 text-[0.53rem] leading-relaxed text-fg-3">
            채널 {telemetry ? CHANNEL_LABELS[telemetry.preferredChannel] : "—"}
            {telemetry
              ? ` · 최근 프레임 ${telemetry.recentFrameCount} · 하드웨어 표본 ${telemetry.recentSampleCount}`
              : ""}
            {latest?.predictedCount
              ? ` · 예측 표본 ${latest.predictedCount}개는 진단에만 표시하고 현재값 권위에는 쓰지 않음`
              : ""}
          </p>
        </section>

        <section
          aria-labelledby="studio-drawing-input-profiles-heading"
          className="rounded-xl border border-line/70 bg-bg-2/45 p-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3
                id="studio-drawing-input-profiles-heading"
                className="flex items-center gap-1.5 text-[0.72rem] font-extrabold text-fg-2"
              >
                <Zap size={14} aria-hidden="true" />
                작업별 입력 프로필
              </h3>
              <p className="mt-0.5 text-[0.57rem] leading-relaxed text-fg-3">
                보정 모드·강도·후처리·필압 응답을 한 번에 바꿉니다.
              </p>
            </div>
            <span className="rounded-full border border-accent/30 bg-accent-soft px-2 py-1 text-[0.52rem] font-bold text-accent">
              {telemetry ? "장치 권장" : "기본 권장"} ·{" "}
              {STUDIO_DRAWING_INPUT_PROFILES.find(
                (entry) => entry.id === recommendedProfileId
              )?.label}
            </span>
          </div>

          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {STUDIO_DRAWING_INPUT_PROFILES.map((profile) => {
              const active = activeProfileId === profile.id;
              const recommended = recommendedProfileId === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => applyProfile(profile.id)}
                  className={cn(
                    "min-h-24 rounded-xl border p-2.5 text-left",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                    active
                      ? "border-accent/55 bg-accent-soft"
                      : "border-line bg-card/70 hover:border-line-strong hover:bg-raised"
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-[0.66rem] font-extrabold text-fg">
                      {profile.label}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {recommended ? (
                        <Sparkles
                          size={12}
                          className="text-accent"
                          aria-label="장치 권장"
                        />
                      ) : null}
                      {active ? (
                        <Check
                          size={13}
                          className="text-good"
                          aria-label="현재 적용됨"
                        />
                      ) : null}
                    </span>
                  </span>
                  <span className="mt-1 block text-[0.56rem] leading-relaxed text-fg-3">
                    {profile.description}
                  </span>
                  <span className="mt-1.5 block text-[0.52rem] font-semibold text-fg-2">
                    {profileModeLabel(profile.stabilizerMode)} {profile.stabilizer}
                    {" · "}후처리 {profile.postCorrection}
                    {" · "}{profile.pressureCurveId}
                  </span>
                  <span className="mt-0.5 block text-[0.5rem] leading-relaxed text-fg-3">
                    {profile.useCase}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 border-t border-line/55 pt-2">
            <p className="min-w-0 flex-1 text-[0.54rem] leading-relaxed text-fg-3" aria-live="polite">
              {notice}
            </p>
            <button
              type="button"
              onClick={restorePreviousSnapshot}
              disabled={!previousSnapshot}
              className={cn(
                "inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-line px-2 text-[0.56rem] font-bold text-fg-2 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40",
                STUDIO_EASE,
                STUDIO_FOCUS_RING
              )}
            >
              <RotateCcw size={12} aria-hidden="true" />
              이전 설정
            </button>
          </div>
        </section>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-line/70 bg-bg-2/60 px-3 py-2.5">
        <span className="inline-flex min-w-0 items-center gap-1 text-[0.53rem] text-fg-3">
          {latest?.pointerType === "mouse" ? (
            <MousePointer2 size={12} aria-hidden="true" />
          ) : (
            <PenLine size={12} aria-hidden="true" />
          )}
          좌표·획 내용은 저장하지 않습니다
        </span>
        <button
          type="button"
          onClick={() => {
            onClose();
            queueMicrotask(onOpenBrushStudio);
          }}
          className={cn(
            "inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-accent/40 bg-accent-soft px-2.5 text-[0.57rem] font-extrabold text-accent hover:border-accent/60",
            STUDIO_EASE,
            STUDIO_FOCUS_RING
          )}
        >
          <Settings2 size={13} aria-hidden="true" />
          정밀 필압 보정
        </button>
      </footer>
    </aside>
  );
}
