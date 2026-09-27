import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { STUDIO_CHARACTER_SKINS } from "./studio-virtual-space-character-skins";
import { STUDIO_VIRTUAL_ART_STYLES, type StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import { StudioVirtualCharacterPreview } from "./StudioVirtualCharacterPreview";

/** 테마 추천은 현재 선택을 바꾸지 않는다. 사용자의 명시적 클릭만 기존 avatarIndex 선택으로 연결한다. */
export function StudioVirtualThemeCharacterPicker({ artStyle, avatarIndex, onSelect }: {
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly avatarIndex: number;
  readonly onSelect: (index: number) => void;
}) {
  const bt = useBilingual("StudioVirtualThemeCharacterPicker");
  const characters = STUDIO_CHARACTER_SKINS.map((skin, index) => ({ skin, index }))
    .filter(({ skin }) => skin.selectionOnly && skin.nativeArtStyle);
  if (!characters.length) return null;
  return <fieldset className="studio-vspace-theme-characters">
    <legend>{bt("테마별 대표 캐릭터", "Characters for each theme")}</legend>
    <p>{bt("마음에 드는 캐릭터를 직접 선택하세요. 배경 테마를 바꿔도 선택한 캐릭터는 유지됩니다.", "Choose your character explicitly. Your choice stays when you change the background theme.")}</p>
    <div className="studio-vspace-theme-characters__grid">
      {characters.map(({ skin, index }) => {
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
