import { useEffect, useState, type CSSProperties } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualAvatarProfile } from "./studio-virtual-space-model";
import type { StudioSpriteDirection } from "./studio-virtual-space-sprite";
import { StudioVirtualAvatarFigure } from "./StudioVirtualAvatarFigure";
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
 * `useStudioVirtualAvatarProfile` 저장소에 저장된다. 한국어 UI.
 */

type Bilingual = (ko: string, en: string) => string;

const DIRECTIONS: readonly { readonly key: StudioSpriteDirection; readonly ko: string; readonly en: string }[] = [
  { key: "down", ko: "아래", en: "Down" },
  { key: "down-left", ko: "왼쪽 아래", en: "Bottom left" },
  { key: "left", ko: "왼쪽", en: "Left" },
  { key: "up-left", ko: "왼쪽 위", en: "Top left" },
  { key: "up", ko: "위", en: "Up" },
  { key: "up-right", ko: "오른쪽 위", en: "Top right" },
  { key: "right", ko: "오른쪽", en: "Right" },
  { key: "down-right", ko: "오른쪽 아래", en: "Bottom right" },
];

const swatchStyle = (selected: boolean): CSSProperties => ({
  width: 34,
  height: 34,
  borderRadius: "50%",
  border: selected ? "3px solid #1a1a22" : "2px solid rgba(0,0,0,0.25)",
  boxShadow: selected ? "0 0 0 2px #fff, 0 0 0 4px #1a1a22" : undefined,
  cursor: "pointer",
  padding: 0,
});

const chipStyle = (selected: boolean): CSSProperties => ({
  padding: "8px 12px",
  borderRadius: 999,
  border: selected ? "2px solid #1a1a22" : "1px solid rgba(0,0,0,0.25)",
  background: selected ? "#1a1a22" : "#fff",
  color: selected ? "#fff" : "#1a1a22",
  cursor: "pointer",
  fontSize: 13,
});

const groupStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  margin: "8px 0 4px",
};

function ColorSwatchGroup({ legend, options, value, onSelect, bt }: {
  readonly legend: string;
  readonly options: readonly { readonly value: string; readonly labelKo: string; readonly labelEn: string }[];
  readonly value: string;
  readonly onSelect: (value: string) => void;
  readonly bt: Bilingual;
}) {
  return (
    <fieldset style={{ border: "none", padding: 0, margin: "12px 0" }}>
      <legend style={{ fontWeight: 700, fontSize: 14 }}>{legend}</legend>
      <div style={groupStyle}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              aria-label={bt(option.labelKo, option.labelEn)}
              title={bt(option.labelKo, option.labelEn)}
              style={{ ...swatchStyle(selected), background: option.value }}
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
    <fieldset style={{ border: "none", padding: 0, margin: "12px 0" }}>
      <legend style={{ fontWeight: 700, fontSize: 14 }}>{legend}</legend>
      <div style={groupStyle}>
        {options.map((option) => {
          const selected = value === option.key;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={selected}
              style={chipStyle(selected)}
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
    <section aria-label={bt("아바타 꾸미기", "Customize avatar")} className="studio-vspace-avatar-customizer">
      <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>{bt("내 아바타 꾸미기", "Customize my avatar")}</h2>
      <p style={{ fontSize: 13, opacity: 0.75, margin: "0 0 12px" }}>
        {bt("파츠를 고르면 바로 저장되고 가상 오피스에 반영됩니다.", "Your picks save instantly and apply in the virtual office.")}
      </p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ textAlign: "center" }}>
          <StudioVirtualAvatarFigure
            profile={profile}
            direction={direction}
            animated={animated}
            title={bt("아바타 미리보기", "Avatar preview")}
            style={{ width: 144, height: 168 }}
          />
          <div style={{ ...groupStyle, justifyContent: "center", maxWidth: 220 }} role="group" aria-label={bt("미리보기 방향", "Preview direction")}>
            {DIRECTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={direction === item.key}
                aria-label={bt(`미리보기 방향: ${item.ko}`, `Preview direction: ${item.en}`)}
                title={bt(item.ko, item.en)}
                style={chipStyle(direction === item.key)}
                onClick={() => setDirection(item.key)}
              >
                {bt(item.ko, item.en)}
              </button>
            ))}
          </div>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, marginTop: 4 }}>
            <input
              type="checkbox"
              checked={animated}
              onChange={(event) => setAnimated(event.target.checked)}
            />
            {bt("걷기 애니메이션", "Walk animation")}
          </label>
        </div>

        {sheetUrl ? (
          <figure style={{ margin: 0, textAlign: "center" }}>
            <img
              src={sheetUrl}
              alt={bt("프로시저럴 스프라이트 미리보기", "Procedural sprite preview")}
              width={96}
              height={112}
              style={{ imageRendering: "pixelated", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8 }}
              draggable={false}
            />
            <figcaption style={{ fontSize: 12, opacity: 0.7 }}>
              {bt("프로시저럴 스프라이트", "Procedural sprite")}
            </figcaption>
          </figure>
        ) : null}
      </div>

      <fieldset style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, margin: "12px 0", padding: "8px 12px" }}>
        <legend style={{ fontWeight: 700, fontSize: 14 }}>{bt("프리셋", "Presets")}</legend>
        <div style={groupStyle}>
          {STUDIO_CHARACTER_PART_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              style={chipStyle(false)}
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

      <div style={{ ...groupStyle, marginTop: 16 }}>
        <button type="button" style={chipStyle(false)} onClick={applyRandom} aria-label={bt("랜덤 아바타 만들기", "Create a random avatar")}>
          🎲 {bt("랜덤", "Random")}
        </button>
        <button type="button" style={chipStyle(false)} onClick={reset} aria-label={bt("아바타 꾸미기 초기화", "Reset avatar customization")}>
          {bt("초기화", "Reset")}
        </button>
      </div>
    </section>
  );
}
