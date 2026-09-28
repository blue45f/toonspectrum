import { Check, Palette } from "lucide-react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpaceEnvironmentPanelProps } from "../StudioVirtualSpaceEnvironmentPanel";
import { studioVirtualBackdropUrl } from "../studio-virtual-space-environment-preference";
import { STUDIO_ATMOSPHERE_PRESETS, studioAtmospherePresetFor } from "./studio-atmosphere-presets";
import "./studio-cinematic-experience.css";

export function StudioAtmospherePresets({ value, onChange, artStyle = "sky-island" }: StudioVirtualSpaceEnvironmentPanelProps) {
  const bt = useBilingual("StudioAtmospherePresets");
  const active = studioAtmospherePresetFor(value);
  return <fieldset className="studio-cinematic-presets">
    <legend><Palette size={16} aria-hidden />{bt("분위기 프리셋", "Atmosphere presets")}</legend>
    <p className="studio-cinematic-presets__status" role="status">{active ? bt(`현재 분위기: ${active.labelKo}`, `Current atmosphere: ${active.labelEn}`) : bt("직접 설정한 분위기", "Custom atmosphere")}</p>
    <div className="studio-cinematic-presets__grid">
      {STUDIO_ATMOSPHERE_PRESETS.map((item) => <button key={item.id} type="button"
        aria-label={bt(`${item.labelKo} 적용`, `Apply ${item.labelEn}`)} aria-pressed={active?.id === item.id}
        data-atmosphere={item.id} onClick={() => onChange({ ...item.value })}>
        <img src={studioVirtualBackdropUrl(item.value.backdrop, artStyle)} alt="" loading="lazy" decoding="async" width={1536} height={1024} />
        <span><strong>{bt(item.labelKo, item.labelEn)}</strong><small>{bt(item.detailKo, item.detailEn)}</small></span>
        {active?.id === item.id ? <Check size={17} aria-hidden /> : null}
      </button>)}
    </div>
    <p className="studio-cinematic-presets__hint">{bt("배경·시간대·날씨를 한 번에 적용합니다. 환경음과 미디어는 자동으로 켜지지 않습니다.", "Apply backdrop, time and weather together. Ambient audio and media stay off unless you enable them.")}</p>
  </fieldset>;
}
