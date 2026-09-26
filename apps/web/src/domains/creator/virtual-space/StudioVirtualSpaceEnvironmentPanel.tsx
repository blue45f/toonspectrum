import { CloudRain, Flower2, MoonStar, Snowflake, Sparkles, SunMedium, Sunrise, Sunset } from "lucide-react";

import "./studio-virtual-space-environment-panel.css";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_VIRTUAL_BACKDROPS,
  STUDIO_VIRTUAL_DAY_PHASES,
  STUDIO_VIRTUAL_WEATHERS,
  studioVirtualBackdropUrl,
  type StudioVirtualBackdrop,
  type StudioVirtualDayPhasePreference,
  type StudioVirtualEnvironmentPreference,
  type StudioVirtualWeather,
} from "./studio-virtual-space-environment-preference";

export interface StudioVirtualSpaceEnvironmentPanelProps {
  readonly value: StudioVirtualEnvironmentPreference;
  readonly onChange: (value: StudioVirtualEnvironmentPreference) => void;
}

const BACKDROP_COPY: Readonly<Record<StudioVirtualBackdrop, readonly [string, string, string, string]>> = Object.freeze({
  sky: ["공중섬", "Sky islands", "밝은 하늘과 원경 섬", "Bright sky and distant islands"],
  coast: ["해변", "Coast", "파도와 부두가 있는 수평선", "A horizon of waves and docks"],
  forest: ["정원 숲", "Garden forest", "나무집과 폭포 정원", "Tree houses and waterfall gardens"],
  city: ["네온 시티", "Neon city", "야간 이벤트와 갤러리", "Night events and gallery lights"],
});

const DAY_COPY: Readonly<Record<StudioVirtualDayPhasePreference, readonly [string, string]>> = Object.freeze({
  auto: ["자동", "Auto"], dawn: ["새벽", "Dawn"], day: ["낮", "Day"], dusk: ["노을", "Dusk"], night: ["밤", "Night"],
});
const WEATHER_COPY: Readonly<Record<StudioVirtualWeather, readonly [string, string]>> = Object.freeze({
  clear: ["맑음", "Clear"], rain: ["비", "Rain"], petals: ["꽃잎", "Petals"], snow: ["눈", "Snow"],
});

function DayIcon({ phase }: { readonly phase: StudioVirtualDayPhasePreference }) {
  if (phase === "dawn") return <Sunrise size={15} aria-hidden />;
  if (phase === "day") return <SunMedium size={15} aria-hidden />;
  if (phase === "dusk") return <Sunset size={15} aria-hidden />;
  if (phase === "night") return <MoonStar size={15} aria-hidden />;
  return <Sparkles size={15} aria-hidden />;
}

function WeatherIcon({ weather }: { readonly weather: StudioVirtualWeather }) {
  if (weather === "rain") return <CloudRain size={15} aria-hidden />;
  if (weather === "petals") return <Flower2 size={15} aria-hidden />;
  if (weather === "snow") return <Snowflake size={15} aria-hidden />;
  return <SunMedium size={15} aria-hidden />;
}

export function StudioVirtualSpaceEnvironmentPanel({ value, onChange }: StudioVirtualSpaceEnvironmentPanelProps) {
  const bt = useBilingual("domains.creator.virtual-space.StudioVirtualSpaceEnvironmentPanel");
  const patch = (next: Partial<Omit<StudioVirtualEnvironmentPreference, "version">>) => onChange({ ...value, ...next, version: 1 });
  return (
    <section className="studio-environment-panel" aria-labelledby="studio-environment-title">
      <div className="studio-environment-panel__heading">
        <p><Sparkles size={14} aria-hidden />ImageGen 2.5 scene direction</p>
        <h2 id="studio-environment-title">{bt("배경과 환경", "Backdrop & environment")}</h2>
        <span>{bt("장소 배경, 시간대와 날씨를 분리해 같은 공간을 다른 분위기로 연출합니다.", "Combine a backdrop, time of day and weather without changing the workspace layout.")}</span>
      </div>
      <fieldset className="studio-environment-panel__backdrops">
        <legend>{bt("배경", "Backdrop")}</legend>
        <div>
          {STUDIO_VIRTUAL_BACKDROPS.map((backdrop) => {
            const [ko, en, detailKo, detailEn] = BACKDROP_COPY[backdrop];
            return (
              <button key={backdrop} type="button" aria-pressed={value.backdrop === backdrop} onClick={() => patch({ backdrop })}>
                <img src={studioVirtualBackdropUrl(backdrop)} alt="" loading="lazy" decoding="async" draggable={false} />
                <span><strong>{bt(ko, en)}</strong><small>{bt(detailKo, detailEn)}</small></span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="studio-environment-panel__options">
        <fieldset>
          <legend>{bt("시간대", "Time of day")}</legend>
          <div>
            {STUDIO_VIRTUAL_DAY_PHASES.map((phase) => (
              <button key={phase} type="button" aria-pressed={value.dayPhase === phase} onClick={() => patch({ dayPhase: phase })}>
                <DayIcon phase={phase} />{bt(...DAY_COPY[phase])}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>{bt("날씨", "Weather")}</legend>
          <div>
            {STUDIO_VIRTUAL_WEATHERS.map((weather) => (
              <button key={weather} type="button" aria-pressed={value.weather === weather} onClick={() => patch({ weather })}>
                <WeatherIcon weather={weather} />{bt(...WEATHER_COPY[weather])}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  );
}

export default StudioVirtualSpaceEnvironmentPanel;
