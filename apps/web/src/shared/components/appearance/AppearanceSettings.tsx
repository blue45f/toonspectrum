import { Check, Monitor, RotateCcw } from "lucide-react";
import { useId, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";
import { useTheme } from "@/shared/lib/theme";
import { THEME_PRESETS, type AppearanceScope } from "@/shared/lib/theme-presets";

export function AppearanceSettings({ initialScope = "site" }: { initialScope?: AppearanceScope }) {
  const [scope, setScope] = useState<AppearanceScope>(initialScope);
  const id = useId();
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  const preference = useTheme((state) => state.preference);
  const studioPreference = useTheme((state) => state.studioPreference);
  const setPreference = useTheme((state) => state.setPreference);
  const setStudioPreference = useTheme((state) => state.setStudioPreference);
  const resetScope = useTheme((state) => state.resetScope);
  const storageAvailable = useTheme((state) => state.storageAvailable);
  const selected = scope === "studio" ? studioPreference : preference;
  const choose = (value: typeof preference) => {
    if (scope === "studio") setStudioPreference(value);
    else setPreference(value);
  };

  return (
    <div className="appearance-settings">
      <div className="appearance-scope" role="group" aria-label={korean ? "테마 적용 범위" : "Theme scope"}>
        {(["site", "studio"] as const).map((value) => (
          <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)}>
            {value === "site" ? korean ? "사이트" : "Site" : korean ? "스튜디오" : "Studio"}
          </button>
        ))}
      </div>
      <p id={`${id}-hint`} className="appearance-hint">
        {scope === "studio"
          ? korean ? "스튜디오 도구와 패널에만 적용합니다. 원고·브러시 색상과 내보내기 결과는 바뀌지 않습니다." : "Changes Studio tools and panels only. Artwork, brush colors and exported files stay unchanged."
          : korean ? "사이트 기본 테마입니다. 스튜디오는 별도 테마를 지정할 수 있습니다." : "The site's default theme. Studio can use its own palette."}
      </p>
      <fieldset aria-describedby={`${id}-hint`}>
        <legend className="sr-only">{korean ? "디자인 테마 선택" : "Choose a design theme"}</legend>
        <div className="appearance-preferences">
          {scope === "studio" && (
            <label className="appearance-option-row">
              <input type="radio" name={`${id}-theme`} checked={selected === "inherit"} onChange={() => setStudioPreference("inherit")} />
              <span>{korean ? "사이트와 동일" : "Use site theme"}</span>
            </label>
          )}
          <label className="appearance-option-row">
            <input type="radio" name={`${id}-theme`} checked={selected === "system"} onChange={() => choose("system")} />
            <Monitor size={16} aria-hidden />
            <span>{korean ? "시스템 설정 따르기" : "Follow system appearance"}</span>
          </label>
        </div>
        <div className="appearance-grid">
          {THEME_PRESETS.map((preset) => {
            const label = korean ? preset.ko : preset.en;
            return (
              <label className="appearance-card" key={preset.id} data-selected={selected === preset.id}>
                <input className="sr-only" type="radio" name={`${id}-theme`} aria-label={label}
                  checked={selected === preset.id} onChange={() => choose(preset.id)} />
                <span className="appearance-preview" data-appearance-preview={preset.id} aria-hidden="true">
                  <span className="appearance-preview-toolbar"><i /><i /><i /></span>
                  <span className="appearance-preview-rail"><i /><i /><i /></span>
                  <span className="appearance-preview-paper"><i /><i /><i /></span>
                  <span className="appearance-preview-panel"><i /><i /><i /></span>
                </span>
                <span className="appearance-card-title">{label}{selected === preset.id && <Check size={16} aria-hidden />}</span>
                <span className="appearance-card-description">{korean ? preset.descriptionKo : preset.descriptionEn}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="appearance-footer">
        <p role="status">{storageAvailable
          ? korean ? "선택 즉시 적용 · 이 브라우저에 자동 저장" : "Applied immediately · saved in this browser"
          : korean ? "브라우저 저장이 차단되어 이번 세션에만 적용됩니다." : "Browser storage is unavailable. Applied for this session only."}</p>
        <button type="button" onClick={() => resetScope(scope)}><RotateCcw size={14} aria-hidden />{korean ? "기본값 복원" : "Restore default"}</button>
      </div>
    </div>
  );
}
