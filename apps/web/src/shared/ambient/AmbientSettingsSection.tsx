import {
  CloudRain,
  CloudSun,
  Flower2,
  Leaf,
  Snowflake,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useId, useRef, useState } from "react";

import { Switch } from "@/shared/components/ui/switch";
import { cn } from "@/shared/lib/utils";

import type { AmbientScene } from "./ambient-engine";
import type { AmbientTone } from "./ambient-layers";
import type { AmbientEffectChoice } from "./ambient-preferences";
import type { AmbientSurfaceSize } from "./ambient-renderer";
import { isAmbientGeolocationAvailable } from "./ambient-weather";
import {
  useAmbientAppearance,
  useAmbientCanvas,
  useAmbientExperience,
  useAmbientScene,
  useAmbientWeather,
} from "./useAmbientExperience";

import "./ambient-effects.css";

const EFFECT_ICONS: Record<AmbientEffectChoice, LucideIcon> = {
  auto: CloudSun,
  clear: Sun,
  rain: CloudRain,
  snow: Snowflake,
  petals: Flower2,
  leaves: Leaf,
  fireflies: Sparkles,
};

/** 라디오 선택지 공통 모양: 라벨 전체가 누를 수 있는 영역이고, 숨긴 input의 포커스를 테두리로 보여 준다. */
const OPTION_CLASS =
  "relative flex min-h-11 cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors "
  + "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 "
  + "has-[:focus-visible]:outline-accent has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 "
  + "motion-reduce:transition-none";

function optionStateClass(checked: boolean): string {
  return checked
    ? "border-accent bg-accent-soft text-fg"
    : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg";
}

function measureElement(canvas: HTMLCanvasElement): AmbientSurfaceSize {
  return { width: canvas.clientWidth, height: canvas.clientHeight };
}

function observeElementResize(canvas: HTMLCanvasElement, onResize: () => void): () => void {
  if (typeof ResizeObserver === "undefined") {
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }
  const observer = new ResizeObserver(onResize);
  observer.observe(canvas);
  return () => observer.disconnect();
}

interface AmbientPreviewProps {
  readonly scene: AmbientScene | null;
  readonly tone: AmbientTone;
  readonly still: boolean;
  readonly badge: string;
  readonly message: string | null;
}

/**
 * 실제 배경과 같은 렌더러로 그리는 미리보기.
 * 가운데 작은 카드는 효과가 글자·카드 뒤에만 보인다는 것을 함께 보여 준다.
 */
function AmbientPreview({ scene, tone, still, badge, message }: AmbientPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useAmbientCanvas(canvasRef, {
    scene,
    tone,
    animate: !still,
    measure: measureElement,
    observeResize: observeElementResize,
  });
  return (
    <div
      className="relative h-36 overflow-hidden rounded-xl border border-line bg-canvas sm:h-44"
      aria-hidden="true"
      data-ambient-preview={scene?.kind ?? "none"}
    >
      <canvas ref={canvasRef} className="ambient-preview-canvas" />
      <div className="absolute bottom-3 left-3 w-40 rounded-lg border border-line bg-panel p-2.5 shadow-sm sm:w-48">
        <span className="block h-2 w-3/4 rounded-full bg-fg-3/40" />
        <span className="mt-1.5 block h-2 w-1/2 rounded-full bg-fg-3/25" />
      </div>
      <span className="absolute left-3 top-3 rounded-full border border-line bg-panel/90 px-2.5 py-1 text-[11px] font-semibold text-fg-2">
        {badge}
      </span>
      {message ? (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-fg-3">{message}</p>
      ) : null}
    </div>
  );
}

/**
 * 설정 화면의 날씨·계절 배경 섹션.
 * - 강도(끔/은은하게/화려하게)와 효과(자동/맑음/비/눈/벚꽃/낙엽/반딧불)를 고르면 배경·미리보기에 바로 반영된다.
 * - '내 위치 날씨 사용'을 켤 때만 위치 권한을 묻는다. 기본은 서울 날씨.
 * - 현재 상태를 "서울 · 맑음 · 가을 낮" 한 줄로 보여 준다.
 */
export function AmbientSettingsSection() {
  const {
    intensity,
    effect,
    location,
    setIntensity,
    setEffect,
    setLocation,
    reducedMotion,
    labels,
    intensities,
    effects,
  } = useAmbientExperience();
  const { tone, highContrast } = useAmbientAppearance();
  const { scene, weather, weatherPending, timePhase, season } = useAmbientScene({ intensity, effect }, true);
  // 상태 줄에 실제 날씨를 보여 주기 위해 효과를 직접 골라도 날씨를 불러 둔다.
  useAmbientWeather(intensity !== "off");
  const [geolocationAvailable] = useState(isAmbientGeolocationAvailable);
  const ids = useId();
  const off = intensity === "off";

  const locationSource = weather.reading?.source ?? (location === "on" ? "device" : "default");
  const locationChecked = location === "on" || (location === null && weather.reading?.source === "device");
  const locationNote = !geolocationAvailable
    ? labels.locationUnavailable
    : location === "on" && weather.locationFallback
      ? labels.locationFallback
      : null;

  const previewMessage = off ? labels.previewOff : weatherPending ? labels.previewLoading : null;
  const still = reducedMotion || highContrast;
  const badge = scene
    ? `${labels.previewLabel} · ${labels.sceneName(scene.kind)}${still ? ` · ${labels.previewStill}` : ""}`
    : labels.previewLabel;

  return (
    <section className="rounded-2xl border border-line bg-panel/40 px-5" aria-labelledby={`${ids}-title`}>
      <div className="flex items-center gap-3 border-b border-line py-4">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"
          aria-hidden="true"
        >
          <CloudSun className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id={`${ids}-title`} className="text-base font-semibold">
            {labels.settingsTitle}
          </h2>
          <p className="text-xs text-fg-3">{labels.settingsDescription}</p>
        </div>
      </div>

      <div className="border-b border-line py-4">
        <AmbientPreview scene={scene} tone={tone} still={still} badge={badge} message={previewMessage} />
      </div>

      <fieldset className="border-b border-line py-4">
        <legend className="text-sm font-semibold text-fg">{labels.intensityLabel}</legend>
        <p className="mt-0.5 text-xs text-fg-3">{labels.intensityHint}</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {intensities.map((level) => {
            const checked = intensity === level;
            return (
              <label key={level} className={cn(OPTION_CLASS, "flex-col", optionStateClass(checked))}>
                <input
                  type="radio"
                  name={`${ids}-intensity`}
                  value={level}
                  checked={checked}
                  onChange={() => setIntensity(level)}
                  className="sr-only"
                />
                <span className="block text-sm font-semibold">{labels.intensityName(level)}</span>
                <span className="mt-0.5 block text-[11px] leading-tight text-fg-3">
                  {labels.intensityDescription(level)}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="border-b border-line py-4" disabled={off}>
        <legend className="text-sm font-semibold text-fg">{labels.effectLabel}</legend>
        <p className="mt-0.5 text-xs text-fg-3">{off ? labels.effectOffHint : labels.effectHint}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {effects.map((choice) => {
            const checked = effect === choice;
            const Icon = EFFECT_ICONS[choice];
            return (
              <label
                key={choice}
                className={cn(
                  OPTION_CLASS,
                  "items-center gap-2.5",
                  choice === "auto" && "col-span-2 sm:col-span-1",
                  optionStateClass(checked),
                )}
              >
                <input
                  type="radio"
                  name={`${ids}-effect`}
                  value={choice}
                  checked={checked}
                  onChange={() => setEffect(choice)}
                  className="sr-only"
                />
                <Icon className={cn("size-5 shrink-0", checked ? "text-accent" : "text-fg-3")} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{labels.effectName(choice)}</span>
                  <span className="block text-[11px] leading-tight text-fg-3">{labels.effectDescription(choice)}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-start justify-between gap-4 border-b border-line py-4">
        <div className="min-w-0">
          <p id={`${ids}-location`} className="text-sm font-semibold text-fg">
            {labels.locationLabel}
          </p>
          <p id={`${ids}-location-help`} className="mt-0.5 text-xs leading-relaxed text-fg-3">
            {labels.locationDescription}
          </p>
          {locationNote ? (
            <p className="mt-1.5 text-xs leading-relaxed text-warn" role="status">
              {locationNote}
            </p>
          ) : null}
        </div>
        <Switch
          checked={geolocationAvailable && locationChecked}
          onCheckedChange={(next) => setLocation(next ? "on" : "off")}
          disabled={off || !geolocationAvailable}
          aria-labelledby={`${ids}-location`}
          aria-describedby={`${ids}-location-help`}
        />
      </div>

      <div className="py-4">
        <p className="text-sm font-semibold text-fg">{labels.statusLabel}</p>
        <div aria-live="polite">
          <p className="mt-0.5 text-xs text-fg-2">
            {labels.statusLine({
              location: locationSource,
              weather: weather.reading?.condition ?? null,
              weatherLoading: !off && (weather.phase === "loading" || weather.phase === "idle"),
              season,
              timePhase,
            })}
          </p>
          <p className="mt-0.5 text-xs text-fg-3">
            {labels.backdropLine(off ? null : scene, !off && weatherPending)}
          </p>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-fg-3">{labels.routeNote}</p>
        {reducedMotion ? (
          <p className="mt-2 text-xs leading-relaxed text-fg-3">{labels.reducedMotionNote}</p>
        ) : null}
        {highContrast ? (
          <p className="mt-2 text-xs leading-relaxed text-fg-3">{labels.highContrastNote}</p>
        ) : null}
      </div>
    </section>
  );
}
