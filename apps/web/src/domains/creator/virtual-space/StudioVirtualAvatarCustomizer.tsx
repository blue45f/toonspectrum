import { Dices, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualAvatarProfile } from "./studio-virtual-space-model";
import type { StudioSpriteDirection } from "./studio-virtual-space-sprite";
import { StudioVirtualAvatarFigure } from "./StudioVirtualAvatarFigure";
import { StudioVirtualSpriteSheetCustomizer } from "./StudioVirtualSpriteSheetCustomizer";
import {
  STUDIO_AVATAR_ACCESSORY_OPTIONS,
  STUDIO_AVATAR_EXPRESSION_OPTIONS,
  STUDIO_AVATAR_HAIR_COLOR_OPTIONS,
  STUDIO_AVATAR_HAIR_STYLE_OPTIONS,
  STUDIO_AVATAR_OUTFIT_COLOR_OPTIONS,
  STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS,
  STUDIO_AVATAR_SKIN_OPTIONS,
} from "./studio-virtual-space-avatar-options";
import {
  randomStudioVirtualAvatarProfile,
  useStudioVirtualAvatarProfile,
} from "./studio-virtual-space-avatar-store";
import {
  STUDIO_CHARACTER_PART_PRESETS,
  studioCharacterPartPreset,
} from "./studio-virtual-space-character-parts";
import {
  proceduralPaletteFromAvatarProfile,
  proceduralPartsFromAvatarProfile,
  renderProceduralCharacterPreview,
} from "./studio-virtual-space-character-procedural";

/**
 * 아바타 커스터마이저
 *
 * 파츠 선택(피부·헤어·의상·액세서리·표정) + 실시간 미리보기(SVG 피규어 8방향 +
 * 프로시저럴 스프라이트 셀) + 랜덤/프리셋/초기화 버튼. 선택 즉시
 * `useStudioVirtualAvatarProfile` 저장소(이 기기)에 저장된다. 아직 월드 렌더러와 프레즌스는
 * 이 프로필을 읽지 않으므로 화면 문구는 '미리보기 전용'으로 정직하게 안내한다.
 */

type Bilingual = (ko: string, en: string) => string;

const DIRECTIONS: readonly { readonly key: StudioSpriteDirection; readonly ko: string; readonly en: string; readonly arrow: string }[] = [
  { key: "down", ko: "아래", en: "Down", arrow: "↓" },
  { key: "down-left", ko: "왼쪽 아래", en: "Bottom left", arrow: "↙" },
  { key: "left", ko: "왼쪽", en: "Left", arrow: "←" },
  { key: "up-left", ko: "왼쪽 위", en: "Top left", arrow: "↖" },
  { key: "up", ko: "위", en: "Up", arrow: "↑" },
  { key: "up-right", ko: "오른쪽 위", en: "Top right", arrow: "↗" },
  { key: "right", ko: "오른쪽", en: "Right", arrow: "→" },
  { key: "down-right", ko: "오른쪽 아래", en: "Bottom right", arrow: "↘" },
];

function ColorSwatchGroup({ legend, options, value, onSelect, bt }: {
  readonly legend: string;
  readonly options: readonly { readonly value: string; readonly labelKo: string; readonly labelEn: string }[];
  readonly value: string;
  readonly onSelect: (value: string) => void;
  readonly bt: Bilingual;
}) {
  return (
    <fieldset className="avatar-customizer__group">
      <legend>{legend}</legend>
      <div className="avatar-customizer__options">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className="avatar-customizer__swatch"
              aria-pressed={selected}
              aria-label={bt(option.labelKo, option.labelEn)}
              title={bt(option.labelKo, option.labelEn)}
              // 색 견본 자체가 데이터라 배경만 인라인으로 둔다.
              style={{ background: option.value }}
              onClick={() => onSelect(option.value)}
            />
          );
        })}
      </div>
    </fieldset>
  );
}

function ChipGroup<T extends string>({ legend, options, value, onSelect, bt }: {
  readonly legend: string;
  readonly options: readonly { readonly key: T; readonly labelKo: string; readonly labelEn: string }[];
  readonly value: T;
  readonly onSelect: (key: T) => void;
  readonly bt: Bilingual;
}) {
  return (
    <fieldset className="avatar-customizer__group">
      <legend>{legend}</legend>
      <div className="avatar-customizer__options">
        {options.map((option) => {
          const selected = value === option.key;
          return (
            <button
              key={option.key}
              type="button"
              className="avatar-customizer__chip"
              aria-pressed={selected}
              onClick={() => onSelect(option.key)}
            >
              {bt(option.labelKo, option.labelEn)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function StudioVirtualAvatarCustomizer({ identity }: { readonly identity: string }) {
  const bt = useBilingual("StudioVirtualAvatarCustomizer");
  const { profile, save, reset } = useStudioVirtualAvatarProfile(identity);
  const [direction, setDirection] = useState<StudioSpriteDirection>("down");
  const [animated, setAnimated] = useState(true);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  // 프로시저럴 스프라이트 미리보기 (캔버스 미지원 환경에서는 조용히 생략).
  useEffect(() => {
    try {
      const preview = renderProceduralCharacterPreview(
        proceduralPaletteFromAvatarProfile(profile),
        proceduralPartsFromAvatarProfile(profile),
      );
      setSheetUrl(preview.dataUrl);
    } catch {
      setSheetUrl(null);
    }
  }, [profile]);

  const update = (patch: Partial<StudioVirtualAvatarProfile>) => {
    save({ ...profile, ...patch });
  };

  const applyRandom = () => {
    save(randomStudioVirtualAvatarProfile());
  };

  const applyPreset = (presetKey: string) => {
    const preset = studioCharacterPartPreset(presetKey);
    if (!preset) return;
    // 프리셋 색상은 아바타 옵션 카탈로그의 값만 사용한다 (저장소 검증 통과 보장).
    const hair = STUDIO_AVATAR_HAIR_COLOR_OPTIONS.find((option) => option.value === preset.hair);
    if (!hair || hair.highlight !== preset.hairHighlight) return;
    save({
      skin: preset.skin,
      hair: preset.hair,
      hairHighlight: preset.hairHighlight,
      outfit: preset.outfit,
      accent: preset.accent,
      hairStyle: preset.hairStyle,
      outfitStyle: preset.outfitStyle,
      accessory: preset.accessory,
      expression: profile.expression,
    });
  };

  return (
    <section aria-label={bt("아바타 꾸미기", "Customize avatar")} className="studio-vspace-avatar-customizer avatar-customizer">
      <h2 className="avatar-customizer__title">{bt("내 아바타 꾸미기", "Customize my avatar")}</h2>
      <p className="avatar-customizer__note">
        {bt(
          "파츠를 고르면 이 기기에 바로 저장돼요. 지금은 미리보기 전용이라 월드 캐릭터는 위의 캐릭터 선택으로 바꿔요.",
          "Picks save on this device instantly. This is a preview for now — change your world character with the character picker above.",
        )}
      </p>

      <div className="avatar-customizer__preview">
        <div className="avatar-customizer__figure">
          <StudioVirtualAvatarFigure
            profile={profile}
            direction={direction}
            animated={animated}
            title={bt("아바타 미리보기", "Avatar preview")}
            className="avatar-customizer__svg"
          />
          <div className="avatar-customizer__directions" role="group" aria-label={bt("미리보기 방향", "Preview direction")}>
            {DIRECTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                className="avatar-customizer__direction"
                aria-pressed={direction === item.key}
                aria-label={bt(`미리보기 방향: ${item.ko}`, `Preview direction: ${item.en}`)}
                title={bt(item.ko, item.en)}
                onClick={() => setDirection(item.key)}
              >
                <span aria-hidden>{item.arrow}</span>
              </button>
            ))}
          </div>
          <label className="avatar-customizer__toggle">
            <input
              type="checkbox"
              checked={animated}
              onChange={(event) => setAnimated(event.target.checked)}
            />
            {bt("걷기 애니메이션", "Walk animation")}
          </label>
        </div>

        {sheetUrl ? (
          <figure className="avatar-customizer__sprite">
            <img
              src={sheetUrl}
              alt={bt("프로시저럴 스프라이트 미리보기", "Procedural sprite preview")}
              width={96}
              height={112}
              draggable={false}
            />
            <figcaption>{bt("픽셀 스프라이트", "Pixel sprite")}</figcaption>
          </figure>
        ) : null}
      </div>

      <fieldset className="avatar-customizer__group avatar-customizer__group--boxed">
        <legend>{bt("프리셋", "Presets")}</legend>
        <div className="avatar-customizer__options">
          {STUDIO_CHARACTER_PART_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className="avatar-customizer__chip"
              onClick={() => applyPreset(preset.key)}
            >
              {bt(preset.labelKo, preset.labelEn)}
            </button>
          ))}
        </div>
      </fieldset>

      <ColorSwatchGroup
        legend={bt("피부색", "Skin tone")}
        options={STUDIO_AVATAR_SKIN_OPTIONS}
        value={profile.skin}
        onSelect={(skin) => update({ skin })}
        bt={bt}
      />
      <ChipGroup
        legend={bt("헤어스타일", "Hairstyle")}
        options={STUDIO_AVATAR_HAIR_STYLE_OPTIONS}
        value={profile.hairStyle}
        onSelect={(hairStyle) => update({ hairStyle })}
        bt={bt}
      />
      <ColorSwatchGroup
        legend={bt("헤어 색상", "Hair color")}
        options={STUDIO_AVATAR_HAIR_COLOR_OPTIONS}
        value={profile.hair}
        onSelect={(hair) => {
          const found = STUDIO_AVATAR_HAIR_COLOR_OPTIONS.find((option) => option.value === hair);
          update({ hair, hairHighlight: found?.highlight ?? profile.hairHighlight });
        }}
        bt={bt}
      />
      <ChipGroup
        legend={bt("의상", "Outfit")}
        options={STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS}
        value={profile.outfitStyle ?? "tee"}
        onSelect={(outfitStyle) => update({ outfitStyle })}
        bt={bt}
      />
      <ColorSwatchGroup
        legend={bt("의상 색상", "Outfit color")}
        options={STUDIO_AVATAR_OUTFIT_COLOR_OPTIONS}
        value={profile.outfit}
        onSelect={(outfit) => update({ outfit })}
        bt={bt}
      />
      <ChipGroup
        legend={bt("액세서리", "Accessory")}
        options={STUDIO_AVATAR_ACCESSORY_OPTIONS}
        value={profile.accessory}
        onSelect={(accessory) => update({ accessory })}
        bt={bt}
      />
      <ChipGroup
        legend={bt("표정", "Expression")}
        options={STUDIO_AVATAR_EXPRESSION_OPTIONS}
        value={profile.expression}
        onSelect={(expression) => update({ expression })}
        bt={bt}
      />

      <div className="avatar-customizer__options avatar-customizer__footer">
        <button type="button" className="avatar-customizer__chip" onClick={applyRandom} aria-label={bt("랜덤 아바타 만들기", "Create a random avatar")}>
          <Dices size={15} aria-hidden /> {bt("랜덤", "Random")}
        </button>
        <button type="button" className="avatar-customizer__chip" onClick={reset} aria-label={bt("아바타 꾸미기 초기화", "Reset avatar customization")}>
          <RotateCcw size={15} aria-hidden /> {bt("초기화", "Reset")}
        </button>
      </div>

      <StudioVirtualSpriteSheetCustomizer profile={profile} onSave={save} />
    </section>
  );
}
