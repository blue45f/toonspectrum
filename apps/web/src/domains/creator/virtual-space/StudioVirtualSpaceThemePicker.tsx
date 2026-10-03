import { Palette } from "lucide-react";

import "./studio-virtual-space-theme-picker.css";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_SPACE_THEMES,
  studioSpaceThemeSwatch,
  type StudioSpaceThemeKey,
} from "./studio-virtual-space-theme";

export interface StudioVirtualSpaceThemePickerProps {
  readonly value: StudioSpaceThemeKey;
  readonly onChange: (value: StudioSpaceThemeKey) => void;
}

/**
 * 공간 테마 선택 (트랙 H). 썸네일은 이미지 없이 테마 팔레트만으로 그린 미니 장면이다:
 * 위는 배경 그라데이션, 가운데는 벽 띠, 아래는 바닥색, 점은 장식 포인트색.
 * 선택 즉시 공간에 적용되고 이 브라우저에 저장돼 재입장 시 유지된다.
 */
export function StudioVirtualSpaceThemePicker({ value, onChange }: StudioVirtualSpaceThemePickerProps) {
  const bt = useBilingual("domains.creator.virtual-space.StudioVirtualSpaceThemePicker");
  return (
    <fieldset className="studio-theme-picker">
      <legend>
        <Palette size={13} aria-hidden />
        {bt("공간 테마", "Space theme")}
      </legend>
      <p className="studio-theme-picker__note">
        {bt("바닥·벽·배경의 스타일을 통째로 바꿉니다. 이 기기에 저장돼 다시 들어와도 유지돼요.",
          "Restyles floors, walls and the backdrop as one set. Saved on this device and kept when you return.")}
      </p>
      <div className="studio-theme-picker__grid">
        {STUDIO_SPACE_THEMES.map((theme) => {
          const swatch = studioSpaceThemeSwatch(theme);
          const selected = value === theme.key;
          return (
            <button
              key={theme.key}
              type="button"
              aria-pressed={selected}
              data-space-theme={theme.key}
              onClick={() => onChange(theme.key)}
            >
              <span className="studio-theme-picker__thumb" style={{ background: swatch.gradientCss }} aria-hidden>
                <span className="studio-theme-picker__wall" style={{ background: swatch.wall }} />
                <span className="studio-theme-picker__floor" style={{ background: swatch.floor }} />
                <span className="studio-theme-picker__accent" style={{ background: swatch.accent }} />
              </span>
              <span className="studio-theme-picker__copy">
                <strong>{bt(theme.labelKo, theme.labelEn)}</strong>
                <small>{bt(theme.descriptionKo, theme.descriptionEn)}</small>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default StudioVirtualSpaceThemePicker;
