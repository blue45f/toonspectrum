import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/shared/lib/utils";

import { ambientWeatherProvider } from "./ambient-weather";
import { useAmbientExperience } from "./useAmbientExperience";

/**
 * 설정 페이지용 화면 연출 섹션.
 * - 연출 강도 3단계 (끔/은은하게/화려하게)
 * - 현재 분위기 미리보기 (시간대·계절·날씨)
 */
export function AmbientSettingsSection() {
  const { intensity, setIntensity, reducedMotion, labels, intensities } = useAmbientExperience();
  const [weatherLabel, setWeatherLabel] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const reading = ambientWeatherProvider.snapshot().reading;
      setWeatherLabel(reading ? labels.weatherName(reading.condition) : null);
    };
    sync();
    ambientWeatherProvider.start();
    const unsubscribe = ambientWeatherProvider.subscribe(sync);
    return unsubscribe;
  }, [labels]);

  const now = new Date();
  const timePhase = (() => {
    const h = now.getHours();
    if (h >= 5 && h < 7) return labels.timePhaseName("dawn");
    if (h >= 7 && h < 11) return labels.timePhaseName("morning");
    if (h >= 11 && h < 16) return labels.timePhaseName("day");
    if (h >= 16 && h < 19) return labels.timePhaseName("evening");
    return labels.timePhaseName("night");
  })();
  const season = (() => {
    const m = now.getMonth() + 1;
    if (m >= 3 && m <= 5) return labels.seasonName("spring");
    if (m >= 6 && m <= 8) return labels.seasonName("summer");
    if (m >= 9 && m <= 11) return labels.seasonName("autumn");
    return labels.seasonName("winter");
  })();

  return (
    <section
      className="rounded-2xl border border-line bg-panel/40 px-5"
      aria-label={labels.settingsTitle}
    >
      <div className="flex items-center gap-3 border-b border-line py-4">
        <span
          className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"
          aria-hidden="true"
        >
          <Sparkles className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold">{labels.settingsTitle}</h2>
          <p className="text-xs text-fg-3">{labels.settingsDescription}</p>
        </div>
      </div>

      <div className="border-b border-line py-4">
        <p className="text-sm font-semibold text-fg" id="ambient-intensity-label">
          {labels.intensityLabel}
        </p>
        <p className="mt-0.5 text-xs text-fg-3">{labels.intensityHint}</p>
        <div
          className="mt-3 grid grid-cols-3 gap-2"
          role="radiogroup"
          aria-labelledby="ambient-intensity-label"
        >
          {intensities.map((level) => {
            const active = intensity === level;
            return (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setIntensity(level)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-colors",
                  active
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                <span className="block text-sm font-semibold">
                  {labels.intensityName(level)}
                </span>
                <span className="mt-0.5 block text-[11px] leading-tight text-fg-3">
                  {labels.intensityDescription(level)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 py-4">
        <div>
          <p className="text-sm font-semibold text-fg">{labels.nowPlaying}</p>
          <p className="mt-0.5 text-xs text-fg-3" aria-live="polite">
            {timePhase} · {season}
            {weatherLabel ? ` · ${weatherLabel}` : ""}
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-xs text-fg-2"
          aria-hidden="true"
        >
          <span className="size-2 rounded-full bg-accent pf-sparkle" />
          {intensity === "off" ? labels.intensityName("off") : labels.intensityName(intensity)}
        </div>
      </div>

      {reducedMotion ? (
        <p className="border-t border-line py-3 text-xs text-fg-3">{labels.reducedMotionNote}</p>
      ) : null}
    </section>
  );
}
