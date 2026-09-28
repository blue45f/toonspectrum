import { Sparkles, Trash2, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import {
  STUDIO_VIRTUAL_SPACE_NICKNAME_MAX_GRAPHEMES,
  normalizeStudioVirtualSpaceNickname,
} from "./studio-virtual-space-entry-preference";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { STUDIO_TOWN_DISTRICT_IDS, studioTownDistrictPresentation, type StudioTownDistrictId } from "./studio-virtual-space-town-layout";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { addStudioVirtualDecorationSafely, studioVirtualDecorationNavigationWorld, studioVirtualDecorationPresetForWorld, type StudioDecorationLayoutResult } from "./studio-virtual-space-decoration-layout";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import { StudioVirtualSpaceDecorationEditor } from "./StudioVirtualSpaceDecorationEditor";
import { DEFAULT_STUDIO_VIRTUAL_ART_STYLE, type StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import { StudioVirtualExperienceArtPreview } from "./StudioVirtualExperienceArtPreview";
import "./studio-virtual-space-decoration-editor.css";

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
const DECOR_LABELS = {
  tree: ["나무", "Tree"], "flower-bed": ["화단", "Flower bed"], bench: ["벤치", "Bench"],
  lamp: ["조명", "Lamp"], banner: ["배너", "Banner"], "market-stall": ["마켓 부스", "Market stall"],
  fountain: ["분수", "Fountain"], portal: ["포털", "Portal"], rug: ["러그", "Rug"],
  sign: ["안내판", "Sign"], parasol: ["파라솔", "Parasol"], pet: ["고양이", "Cat"],
  "drawing-desk": ["드로잉 데스크", "Drawing desk"], bookshelf: ["책장", "Bookshelf"],
  "review-board": ["원고 리뷰 보드", "Review board"], sofa: ["소파", "Sofa"],
  custom: ["내 가구", "My furniture"],
} as const;

export function StudioVirtualSpaceCustomizationPanel({
  nickname, character, decorations, selfPoint, onNickname, onCharacter, onDecorations, onSelectDistrict, world, artStyle = DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
}: {
  readonly artStyle?: StudioVirtualArtStyleKey;
  readonly nickname: string;
  readonly character: StudioVirtualCharacterCustomization;
  readonly decorations: StudioVirtualDecorationState;
  readonly selfPoint: StudioVirtualSpacePoint;
  readonly onNickname: (nickname: string) => void;
  readonly onCharacter: (value: StudioVirtualCharacterCustomization) => void;
  readonly onDecorations: (value: StudioVirtualDecorationState) => void;
  readonly onSelectDistrict?: (district: StudioTownDistrictId) => void;
  readonly world?: StudioVirtualSpaceWorldManifest;
}) {
  const bt = useBilingual("StudioVirtualSpaceCustomizationPanel");
  const [nicknameDraft, setNicknameDraft] = useState(nickname);
  useEffect(() => setNicknameDraft(nickname), [nickname]);
  const normalizedNickname = normalizeStudioVirtualSpaceNickname(nicknameDraft);
  const patchCharacter = (patch: Partial<StudioVirtualCharacterCustomization>) => onCharacter({ ...character, ...patch });
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<{ past: StudioVirtualDecorationState[]; future: StudioVirtualDecorationState[] }>({ past: [], future: [] });
  const accepted = useRef(decorations);
  useEffect(() => {
    if (accepted.current !== decorations) setHistory({ past: [], future: [] });
    accepted.current = decorations;
  }, [decorations]);
  useEffect(() => { setHistory({ past: [], future: [] }); setNotice(""); }, [world]);
  const commit = (result: StudioDecorationLayoutResult) => {
    if (!result.ok) {
      setNotice(result.reason === "limit" ? bt("최대 36개까지 배치할 수 있어요. 기존 가구를 이동하거나 지워 주세요.", "You can place up to 36 objects. Move or remove an existing object.")
        : result.reason === "bounds" ? bt("가구 전체가 지도 안에 들어오도록 배치해 주세요.", "Keep the whole object inside the map.")
          : result.reason === "occupied" ? bt("다른 가구와 겹쳐요. 비어 있는 바닥을 선택해 주세요.", "Another object is in the way. Choose an empty floor area.")
            : bt("출입구·작업 자리·이동 동선을 비워 주세요. 기존 배치는 유지했어요.", "Keep entrances, work seats and walking routes clear. Your layout was preserved."));
      return;
    }
    if (result.state === decorations) return;
    const next = { ...result.state, revision: Math.max(decorations.revision + 1, result.state.revision) };
    setHistory((current) => ({ past: [...current.past.slice(-23), decorations], future: [] }));
    accepted.current = next;
    onDecorations(next);
    setNotice(bt("배치를 적용했어요. 실행 취소로 되돌릴 수 있어요.", "Layout applied. You can undo this change."));
  };
  const restore = (direction: "undo" | "redo") => {
    const stack = direction === "undo" ? history.past : history.future, previous = stack.at(-1);
    if (!previous) return;
    const next = { ...previous, revision: decorations.revision + 1 };
    if (world && !studioWorldCanOccupy(studioVirtualDecorationNavigationWorld(world, next), selfPoint)) {
      setNotice(bt("현재 위치에 가구가 겹쳐 되돌리지 않았어요. 빈 곳으로 이동한 뒤 다시 시도해 주세요.", "The restored furniture would overlap your current position. Move to an empty spot, then try again."));
      return;
    }
    setHistory(direction === "undo" ? { past: history.past.slice(0, -1), future: [...history.future, decorations] }
      : { past: [...history.past, decorations], future: history.future.slice(0, -1) });
    accepted.current = next; onDecorations(next);
    setNotice(direction === "undo" ? bt("이전 배치로 되돌렸어요.", "Previous layout restored.") : bt("배치를 다시 적용했어요.", "Layout reapplied."));
  };
  return <section className="vs2-panel studio-vspace-customization" data-space-interactive="true">
    <header>
      <div><p>BUILD & STYLE</p><h2>{bt("캐릭터·공간 꾸미기", "Character & space customization")}</h2></div>
      <Sparkles size={19} aria-hidden />
    </header>
    <fieldset className="studio-vspace-customization-identity">
      <legend>{bt("내 닉네임", "My nickname")}</legend>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!normalizedNickname) return;
        setNicknameDraft(normalizedNickname);
        onNickname(normalizedNickname);
      }}>
        <label htmlFor="studio-vspace-customization-nickname"><UserRound size={15} aria-hidden />{bt("공개 이름", "Public name")}</label>
        <div>
          <input id="studio-vspace-customization-nickname" value={nicknameDraft}
            maxLength={STUDIO_VIRTUAL_SPACE_NICKNAME_MAX_GRAPHEMES} autoComplete="nickname"
            aria-invalid={nicknameDraft.length > 0 && !normalizedNickname}
            onChange={(event) => setNicknameDraft(event.target.value)} />
          <button type="submit" disabled={!normalizedNickname || normalizedNickname === nickname}>{bt("저장", "Save")}</button>
        </div>
        <small data-invalid={nicknameDraft.length > 0 && !normalizedNickname || undefined}>{normalizedNickname
          ? bt("팀원 목록과 캐릭터 이름표에 즉시 반영됩니다.", "Updates teammate lists and your character nameplate immediately.")
          : bt("2~16자의 한글·영문·숫자·공백을 사용해 주세요.", "Use 2–16 letters, numbers or spaces.")}</small>
      </form>
    </fieldset>
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
      <p>{bt("배경 장소는 지금 장소에만 저장되고, 배경·시간대·날씨는 모든 장소에 함께 적용됩니다. 두 설정 모두 이 브라우저에만 저장되며 서버의 공유 월드 게시 권한을 대신하지 않습니다.",
        "The background district is saved for this place only, while backdrop, time of day and weather apply across every place. Both are stored in this browser only and do not replace the server's shared-world publication permission.")}</p>
      <div className="studio-vspace-customization-districts">
        {STUDIO_TOWN_DISTRICT_IDS.map((district, index) => {
          const presentation = studioTownDistrictPresentation(district);
          return <button key={district} type="button" aria-pressed={decorations.districtKey === district}
            onClick={() => {
              onDecorations({ ...decorations, districtKey: district, revision: decorations.revision + 1 });
              onSelectDistrict?.(district);
            }}>
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
          aria-pressed={decorations.presetKey === key} onClick={() => commit(world ? studioVirtualDecorationPresetForWorld(key, world, selfPoint)
            : { ok: true, state: studioVirtualDecorationPreset(key) })}>
          {bt(PRESET_LABELS[key][0], PRESET_LABELS[key][1])}
        </button>)}
      </div>
    </fieldset>
    <fieldset>
      <legend>{bt("내 주변에 배치", "Place near me")}</legend>
      <div className="studio-vspace-customization-catalog">
        {STUDIO_VIRTUAL_DECOR_TYPES.map((type) => {
          const frame = STUDIO_VIRTUAL_DECOR_FRAME[type];
          return <button key={type} type="button" disabled={decorations.placements.length >= 36}
            onClick={() => commit(world ? addStudioVirtualDecorationSafely(decorations, type, selfPoint, world)
              : { ok: true, state: addStudioVirtualDecoration(decorations, type, selfPoint) })}>
            <StudioVirtualExperienceArtPreview kind="furniture" artStyle={artStyle} frame={frame} className="studio-vspace-customization-decor-preview" />
            <span>{bt(DECOR_LABELS[type][0], DECOR_LABELS[type][1])}</span>
          </button>;
        })}
      </div>
      <p>{bt(`${decorations.placements.length} / 36개 배치됨`, `${decorations.placements.length} / 36 placed`)}</p>
    </fieldset>
    <div className="studio-decoration-history" role="group" aria-label={bt("가구 배치 기록", "Furniture layout history")}>
      <button type="button" disabled={!history.past.length} onClick={() => restore("undo")}>{bt("배치 실행 취소", "Undo layout")}</button>
      <button type="button" disabled={!history.future.length} onClick={() => restore("redo")}>{bt("배치 다시 실행", "Redo layout")}</button>
    </div>
    {notice ? <p className="studio-decoration-notice" role="status">{notice}</p> : null}
    {world ? <StudioVirtualSpaceDecorationEditor artStyle={artStyle} world={world} decorations={decorations} selfPoint={selfPoint} onChange={commit} /> : null}
    {!world && decorations.placements.length > 0 ? <details>
      <summary>{bt("배치한 오브젝트 관리", "Manage placed objects")}</summary>
      <div className="studio-vspace-customization-placed">
        {decorations.placements.map((item) => <button key={item.id} type="button"
          onClick={() => commit({ ok: true, state: removeStudioVirtualDecoration(decorations, item.id) })}>
          <span>{bt(DECOR_LABELS[item.type][0], DECOR_LABELS[item.type][1])}</span><Trash2 size={14} aria-hidden />
        </button>)}
      </div>
    </details> : null}
  </section>;
}
