import type { StudioVirtualEnvironmentPreference } from "../studio-virtual-space-environment-preference";

export interface StudioAtmospherePreset {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
  readonly value: StudioVirtualEnvironmentPreference;
}

const preset = (value: StudioAtmospherePreset): StudioAtmospherePreset => Object.freeze({ ...value, value: Object.freeze(value.value) });

/** 환경 설정만 변경한다. 캐릭터·가구·오디오와 협업 권한은 보존한다. */
export const STUDIO_ATMOSPHERE_PRESETS: readonly StudioAtmospherePreset[] = Object.freeze([
  preset({ id: "sunlit", labelKo: "햇살 아틀리에", labelEn: "Sunlit atelier", detailKo: "구름 위의 밝은 작업 시간", detailEn: "A bright workspace above the clouds", value: { version: 1, backdrop: "sky", dayPhase: "day", weather: "clear" } }),
  preset({ id: "sunset", labelKo: "노을 해변", labelEn: "Sunset coast", detailKo: "따뜻한 석양과 고요한 수평선", detailEn: "Warm sunset and a quiet horizon", value: { version: 1, backdrop: "coast", dayPhase: "dusk", weather: "clear" } }),
  preset({ id: "rainy", labelKo: "비 오는 숲", labelEn: "Rainy forest", detailKo: "차분하게 몰입하는 숲속 작업실", detailEn: "A calm forest for focused work", value: { version: 1, backdrop: "forest", dayPhase: "day", weather: "rain" } }),
  preset({ id: "moonlit", labelKo: "달빛 도시", labelEn: "Moonlit city", detailKo: "불빛이 켜진 늦은 밤의 영감", detailEn: "City lights for late-night inspiration", value: { version: 1, backdrop: "city", dayPhase: "night", weather: "clear" } }),
  preset({ id: "blossom", labelKo: "꽃잎 정원", labelEn: "Blossom garden", detailKo: "새벽 정원에 흩날리는 꽃잎", detailEn: "Drifting petals in a dawn garden", value: { version: 1, backdrop: "forest", dayPhase: "dawn", weather: "petals" } }),
]);

export function studioAtmospherePresetFor(value: StudioVirtualEnvironmentPreference): StudioAtmospherePreset | undefined {
  return STUDIO_ATMOSPHERE_PRESETS.find((item) => item.value.backdrop === value.backdrop
    && item.value.dayPhase === value.dayPhase && item.value.weather === value.weather);
}
