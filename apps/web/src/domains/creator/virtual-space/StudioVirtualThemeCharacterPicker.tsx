import { Check, Sparkles } from "lucide-react";
import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioVirtualCharacterPreview } from "./StudioVirtualCharacterPreview";
import { STUDIO_VIRTUAL_ART_STYLES, type StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import { STUDIO_CHARACTER_SKINS, studioCharacterSkinForArtStyle } from "./studio-virtual-space-character-skins";
import { STUDIO_VIRTUAL_SPACE_AUTO_AVATAR } from "./studio-virtual-space-model";

type CharacterFilter = "all" | "base" | StudioVirtualArtStyleKey;

const CHARACTERS = STUDIO_CHARACTER_SKINS.map((skin, index) => ({ skin, index }));
const THEME_CHARACTERS = CHARACTERS.filter(({ skin }) => skin.selectionOnly && skin.nativeArtStyle);

/**
 * 캐릭터 선택기.
 * - theme: 테마별 대표 캐릭터 6종(추천은 선택을 바꾸지 않는다).
 * - all: 기본·테마 캐릭터를 한 격자에 모으고 스타일 필터 칩으로 좁힌다. 로비와 꾸미기 탭이 같은 선택기를 쓴다.
 * 선택은 사용자의 명시적 클릭만 onSelect(avatarIndex)로 알린다.
 */
export function StudioVirtualThemeCharacterPicker({ artStyle, avatarIndex, onSelect, mode = "theme", includeAuto = false }: {
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly avatarIndex: number;
  readonly onSelect: (index: number) => void;
  readonly mode?: "theme" | "all";
  /** 접속 이름으로 캐릭터를 자동 배정하는 선택지를 함께 보여 준다. */
  readonly includeAuto?: boolean;
}) {
  const bt = useBilingual("StudioVirtualThemeCharacterPicker");
  const [filter, setFilter] = useState<CharacterFilter>("all");
  if (mode === "theme") {
    if (!THEME_CHARACTERS.length) return null;
    return <fieldset className="studio-vspace-theme-characters">
      <legend>{bt("테마별 대표 캐릭터", "Characters for each theme")}</legend>
      <p>{bt("마음에 드는 캐릭터를 직접 선택하세요. 배경 테마를 바꿔도 선택한 캐릭터는 유지됩니다.", "Choose your character explicitly. Your choice stays when you change the background theme.")}</p>
      <div className="studio-vspace-theme-characters__grid">
        {THEME_CHARACTERS.map(({ skin, index }) => {
          const theme = STUDIO_VIRTUAL_ART_STYLES.find((item) => item.key === skin.nativeArtStyle);
          return <button type="button" key={skin.key} className="studio-vspace-theme-character" aria-pressed={avatarIndex === index}
            aria-label={bt(`${skin.labelKo} 테마 캐릭터 선택`, `Select ${skin.labelEn} theme character`)} onClick={() => onSelect(index)}>
            <span className="studio-vspace-theme-character__preview"><StudioVirtualCharacterPreview skin={skin} /></span>
            <strong>{bt(skin.labelKo, skin.labelEn)}</strong>
            {theme ? <small>{bt(theme.labelKo, theme.labelEn)}</small> : null}
            {skin.nativeArtStyle === artStyle ? <em>{bt("현재 테마와 어울려요", "Matches your theme")}</em> : null}
          </button>;
        })}
      </div>
    </fieldset>;
  }
  const filters: readonly { readonly id: CharacterFilter; readonly ko: string; readonly en: string }[] = [
    { id: "all", ko: "전체", en: "All" },
    { id: "base", ko: "기본", en: "Base" },
    ...STUDIO_VIRTUAL_ART_STYLES.filter((style) => THEME_CHARACTERS.some(({ skin }) => skin.nativeArtStyle === style.key))
      .map((style) => ({ id: style.key, ko: style.labelKo, en: style.labelEn })),
  ];
  const shown = CHARACTERS.filter(({ skin }) => filter === "all"
    || (filter === "base" ? !skin.nativeArtStyle : skin.nativeArtStyle === filter));
  return <fieldset className="studio-vspace-character-picker">
    <legend>{bt("내 캐릭터", "My character")}</legend>
    <div className="studio-vspace-character-picker__filters" role="group" aria-label={bt("캐릭터 스타일", "Character style")}>
      {filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
        {bt(item.ko, item.en)}
      </button>)}
    </div>
    <div className="studio-vspace-character-picker__grid">
      {includeAuto && filter === "all" ? <button type="button" className="studio-vspace-character-picker__item" data-auto="true"
        aria-pressed={avatarIndex === STUDIO_VIRTUAL_SPACE_AUTO_AVATAR} aria-label={bt("자동 캐릭터 선택", "Select automatic character")}
        onClick={() => onSelect(STUDIO_VIRTUAL_SPACE_AUTO_AVATAR)}>
        <span className="studio-vspace-character-picker__preview"><Sparkles size={22} aria-hidden /></span>
        <strong>{bt("자동", "Auto")}</strong>
      </button> : null}
      {shown.map(({ skin, index }) => {
        const presented = skin.nativeArtStyle ? skin : studioCharacterSkinForArtStyle(skin, artStyle);
        const selected = avatarIndex === index;
        return <button key={skin.key} type="button" className="studio-vspace-character-picker__item" aria-pressed={selected}
          aria-label={bt(`${skin.labelKo} 캐릭터 선택`, `Select ${skin.labelEn} character`)} onClick={() => onSelect(index)}>
          <span className="studio-vspace-character-picker__preview"><StudioVirtualCharacterPreview skin={presented} /></span>
          <strong>{bt(skin.labelKo, skin.labelEn)}</strong>
          {selected ? <b className="studio-vspace-character-picker__check" aria-hidden><Check size={12} /></b> : null}
        </button>;
      })}
    </div>
  </fieldset>;
}
