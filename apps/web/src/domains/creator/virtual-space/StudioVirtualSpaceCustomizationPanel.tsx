import { Sparkles, Trash2 } from "lucide-react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_VIRTUAL_ACCESSORY_KEYS,
  STUDIO_VIRTUAL_AURA_KEYS,
  STUDIO_VIRTUAL_DECOR_FRAME,
  STUDIO_VIRTUAL_DECOR_TYPES,
  STUDIO_VIRTUAL_NAMEPLATE_KEYS,
  STUDIO_VIRTUAL_TRAIL_KEYS,
  addStudioVirtualDecoration,
  removeStudioVirtualDecoration,
  studioVirtualDecorationPreset,
  type StudioVirtualCharacterCustomization,
  type StudioVirtualDecorationState,
  type StudioVirtualDecorPresetKey,
} from "./studio-virtual-space-customization";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { STUDIO_TOWN_DISTRICT_IDS, studioTownDistrictPresentation } from "./studio-virtual-space-town-layout";

const ACCESSORY_LABELS = {
  none: ["없음", "None"], headset: ["헤드셋", "Headset"], beret: ["베레모", "Beret"],
  star: ["별 핀", "Star pin"], glasses: ["안경", "Glasses"],
} as const;
const AURA_LABELS = {
  none: ["없음", "None"], sparkle: ["반짝임", "Sparkle"], focus: ["집중 오라", "Focus aura"], neon: ["네온", "Neon"],
} as const;
const TRAIL_LABELS = {
  none: ["없음", "None"], petal: ["꽃잎", "Petals"], star: ["별빛", "Stars"], pixel: ["픽셀", "Pixels"],
} as const;
const NAMEPLATE_LABELS = {
  violet: ["보라", "Violet"], rose: ["로즈", "Rose"], sky: ["하늘", "Sky"], amber: ["앰버", "Amber"],
} as const;
const PRESET_LABELS: Readonly<Record<StudioVirtualDecorPresetKey, readonly [string, string]>> = {
  minimal: ["미니멀", "Minimal"], "creator-garden": ["창작 정원", "Creator garden"],
  festival: ["페스티벌", "Festival"], "night-market": ["야시장", "Night market"],
};
const DISTRICT_LABELS = {
  "archive-grove": ["아카이브 숲", "Archive Grove"], "story-terrace": ["스토리 테라스", "Story Terrace"],
  "production-heights": ["프로덕션 하이츠", "Production Heights"], "atelier-gardens": ["아틀리에 정원", "Atelier Gardens"],
  "review-falls": ["리뷰 폭포", "Review Falls"], "commons-market": ["커먼즈 마켓", "Commons Market"],
  "sky-port": ["스카이 포트", "Sky Port"],
} as const;
const PRESENTATION_LABELS = {
  minimal: ["미니멀", "Minimal"], decorated: ["데코레이션", "Decorated"], festival: ["페스티벌", "Festival"],
} as const;
const DISTRICT_PREVIEW_URL = "/assets/virtual-studio/living-town-v6/sky-island/district-preview-sheet.webp";
const DECOR_PREVIEW_URL = "/assets/virtual-studio/living-town-v6/sky-island/decor-sheet.webp";
const DECOR_LABELS = {
  tree: ["나무", "Tree"], "flower-bed": ["화단", "Flower bed"], bench: ["벤치", "Bench"],
  lamp: ["조명", "Lamp"], banner: ["배너", "Banner"], "market-stall": ["마켓 부스", "Market stall"],
  fountain: ["분수", "Fountain"], portal: ["포털", "Portal"], rug: ["러그", "Rug"],
  sign: ["안내판", "Sign"], parasol: ["파라솔", "Parasol"], pet: ["고양이", "Cat"],
} as const;

export function StudioVirtualSpaceCustomizationPanel({
  character, decorations, selfPoint, onCharacter, onDecorations,
}: {
  readonly character: StudioVirtualCharacterCustomization;
  readonly decorations: StudioVirtualDecorationState;
  readonly selfPoint: StudioVirtualSpacePoint;
  readonly onCharacter: (value: StudioVirtualCharacterCustomization) => void;
  readonly onDecorations: (value: StudioVirtualDecorationState) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceCustomizationPanel");
  const patchCharacter = (patch: Partial<StudioVirtualCharacterCustomization>) => onCharacter({ ...character, ...patch });
  return <section className="vs2-panel studio-vspace-customization" data-space-interactive="true">
    <header>
      <div><p>BUILD & STYLE</p><h2>{bt("캐릭터·공간 꾸미기", "Character & space customization")}</h2></div>
      <Sparkles size={19} aria-hidden />
    </header>
    <fieldset>
      <legend>{bt("액세서리", "Accessory")}</legend>
      <div className="studio-vspace-customization-options">
        {STUDIO_VIRTUAL_ACCESSORY_KEYS.map((key) => <button key={key} type="button"
          aria-pressed={character.accessoryKey === key} onClick={() => patchCharacter({ accessoryKey: key })}>
          {bt(ACCESSORY_LABELS[key][0], ACCESSORY_LABELS[key][1])}
        </button>)}
      </div>
    </fieldset>
    <fieldset>
      <legend>{bt("오라·이동 이펙트", "Aura & movement effect")}</legend>
      <div className="studio-vspace-customization-options">
        {STUDIO_VIRTUAL_AURA_KEYS.map((key) => <button key={key} type="button"
          aria-pressed={character.auraKey === key} onClick={() => patchCharacter({ auraKey: key })}>
          {bt(AURA_LABELS[key][0], AURA_LABELS[key][1])}
        </button>)}
      </div>
      <div className="studio-vspace-customization-options">
        {STUDIO_VIRTUAL_TRAIL_KEYS.map((key) => <button key={key} type="button"
          aria-pressed={character.trailKey === key} onClick={() => patchCharacter({ trailKey: key })}>
          {bt(TRAIL_LABELS[key][0], TRAIL_LABELS[key][1])}
        </button>)}
      </div>
    </fieldset>
    <fieldset>
      <legend>{bt("이름표", "Nameplate")}</legend>
      <div className="studio-vspace-customization-options">
        {STUDIO_VIRTUAL_NAMEPLATE_KEYS.map((key) => <button key={key} type="button" data-nameplate={key}
          aria-pressed={character.nameplateKey === key} onClick={() => patchCharacter({ nameplateKey: key })}>
          {bt(NAMEPLATE_LABELS[key][0], NAMEPLATE_LABELS[key][1])}
        </button>)}
      </div>
    </fieldset>
    <fieldset>
      <legend>{bt("배경 장소", "Background district")}</legend>
      <p>{bt("장소마다 식생·조명·환경음·랜드마크 연출이 달라집니다.", "Each district changes foliage, lighting, ambience and landmark presentation.")}</p>
      <div className="studio-vspace-customization-districts">
        {STUDIO_TOWN_DISTRICT_IDS.map((district, index) => {
          const presentation = studioTownDistrictPresentation(district);
          return <button key={district} type="button" aria-pressed={decorations.districtKey === district}
            onClick={() => onDecorations({ ...decorations, districtKey: district, revision: decorations.revision + 1 })}>
            <span className="studio-vspace-customization-district-preview" aria-hidden style={{
              backgroundImage: `url(${DISTRICT_PREVIEW_URL})`,
              backgroundSize: `${STUDIO_TOWN_DISTRICT_IDS.length * 100}% 100%`,
              backgroundPosition: `${index / Math.max(1, STUDIO_TOWN_DISTRICT_IDS.length - 1) * 100}% 50%`,
            }} />
            <strong>{bt(DISTRICT_LABELS[district][0], DISTRICT_LABELS[district][1])}</strong>
            <small>{bt(presentation.noteKo, presentation.noteEn)}</small>
          </button>;
        })}
      </div>
    </fieldset>
    <fieldset>
      <legend>{bt("배경 밀도", "Background density")}</legend>
      <div className="studio-vspace-customization-options">
        {(["minimal", "decorated", "festival"] as const).map((mode) => <button key={mode} type="button"
          aria-pressed={decorations.presentationMode === mode}
          onClick={() => onDecorations({ ...decorations, presentationMode: mode, revision: decorations.revision + 1 })}>
          {bt(PRESENTATION_LABELS[mode][0], PRESENTATION_LABELS[mode][1])}
        </button>)}
      </div>
    </fieldset>
    <fieldset>
      <legend>{bt("공간 프리셋", "Space preset")}</legend>
      <p>{bt("기능과 충돌 영역은 유지하고 안전한 내장 오브젝트만 배치합니다.", "Keep tools and collision rules while placing safe bundled objects only.")}</p>
      <div className="studio-vspace-customization-presets">
        {(Object.keys(PRESET_LABELS) as StudioVirtualDecorPresetKey[]).map((key) => <button key={key} type="button"
          aria-pressed={decorations.presetKey === key} onClick={() => onDecorations(studioVirtualDecorationPreset(key))}>
          {bt(PRESET_LABELS[key][0], PRESET_LABELS[key][1])}
        </button>)}
      </div>
    </fieldset>
    <fieldset>
      <legend>{bt("내 주변에 배치", "Place near me")}</legend>
      <div className="studio-vspace-customization-catalog">
        {STUDIO_VIRTUAL_DECOR_TYPES.map((type) => {
          const frame = STUDIO_VIRTUAL_DECOR_FRAME[type];
          return <button key={type} type="button"
            onClick={() => onDecorations(addStudioVirtualDecoration(decorations, type, selfPoint))}>
            <span className="studio-vspace-customization-decor-preview" aria-hidden style={{
              backgroundImage: `url(${DECOR_PREVIEW_URL})`,
              backgroundSize: `${STUDIO_VIRTUAL_DECOR_TYPES.length * 100}% 100%`,
              backgroundPosition: `${frame / Math.max(1, STUDIO_VIRTUAL_DECOR_TYPES.length - 1) * 100}% 50%`,
            }} />
            <span>{bt(DECOR_LABELS[type][0], DECOR_LABELS[type][1])}</span>
          </button>;
        })}
      </div>
      <p>{bt(`${decorations.placements.length} / 36개 배치됨`, `${decorations.placements.length} / 36 placed`)}</p>
    </fieldset>
    {decorations.placements.length > 0 ? <details>
      <summary>{bt("배치한 오브젝트 관리", "Manage placed objects")}</summary>
      <div className="studio-vspace-customization-placed">
        {decorations.placements.map((item) => <button key={item.id} type="button"
          onClick={() => onDecorations(removeStudioVirtualDecoration(decorations, item.id))}>
          <span>{bt(DECOR_LABELS[item.type][0], DECOR_LABELS[item.type][1])}</span><Trash2 size={14} aria-hidden />
        </button>)}
      </div>
    </details> : null}
  </section>;
}
