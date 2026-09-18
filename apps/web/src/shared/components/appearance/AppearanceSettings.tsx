import { Check, Monitor, RotateCcw, Sparkles } from "lucide-react";
import { useId, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";
import { useTheme } from "@/shared/lib/theme";
import { getThemeSceneAsset } from "@/shared/lib/theme-scene-assets";
import { THEME_PRESETS, type AppearanceScope, type ThemeGroup } from "@/shared/lib/theme-presets";

const GROUPS: readonly ThemeGroup[] = ["signature", "classic", "accessibility"];

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
  const groupCopy = {
    signature: {
      title: korean ? "시그니처 테마" : "Signature themes",
      description: korean ? "이미지 색감과 배경 모션까지 함께 바뀝니다." : "Artwork treatment and ambient motion change together.",
    },
    classic: {
      title: korean ? "클래식 작업실" : "Classic workspaces",
      description: korean ? "오래 집중하기 좋은 익숙하고 안정적인 팔레트입니다." : "Familiar, steady palettes made for long sessions.",
    },
    accessibility: {
      title: korean ? "접근성" : "Accessibility",
      description: korean ? "더 선명한 경계와 가독성을 우선합니다." : "Prioritises stronger boundaries and legibility.",
    },
  } as const;

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
          : korean ? "사이트 기본 테마입니다. 공개 화면의 이미지 연출과 모션도 테마에 맞춰 바뀝니다." : "The site's default theme. Public artwork treatment and motion adapt to it too."}
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
        <div className="appearance-theme-groups">
          {GROUPS.map((group) => {
            const copy = groupCopy[group];
            const presets = THEME_PRESETS.filter((preset) => preset.group === group);
            return (
              <section className="appearance-theme-group" data-theme-group={group} key={group} aria-labelledby={`${id}-${group}`}>
                <header className="appearance-theme-group-heading">
                  <h3 id={`${id}-${group}`}>{group === "signature" && <Sparkles size={15} aria-hidden />}{copy.title}</h3>
                  <p>{copy.description}</p>
                </header>
                <div className="appearance-grid">
                  {presets.map((preset) => {
                    const label = korean ? preset.ko : preset.en;
                    const scene = getThemeSceneAsset(preset.id);
                    return (
                      <label className="appearance-card" key={preset.id} data-selected={selected === preset.id} data-featured={preset.group === "signature" || undefined}>
                        <input className="sr-only" type="radio" name={`${id}-theme`} aria-label={label}
                          checked={selected === preset.id} onChange={() => choose(preset.id)} />
                        <span className="appearance-preview" data-appearance-preview={preset.id} aria-hidden="true">
                          <img
                            className="appearance-preview-scene"
                            src={scene.src}
                            width={1200}
                            height={800}
                            loading="lazy"
                            decoding="async"
                            alt=""
                          />
                          <span className="appearance-preview-toolbar"><i /><i /><i /></span>
                          <span className="appearance-preview-rail"><i /><i /><i /></span>
                          <span className="appearance-preview-paper"><i /><i /><i /></span>
                          <span className="appearance-preview-panel"><i /><i /><i /></span>
                          <span className="appearance-preview-art" data-motif={preset.motif}><i /><i /><i /><i /></span>
                        </span>
                        <span className="appearance-card-title">
                          <span>{label}{preset.group === "signature" && <small>{korean ? "시그니처" : "Signature"}</small>}</span>
                          {selected === preset.id && <Check size={16} aria-hidden />}
                        </span>
                        <span className="appearance-card-description">{korean ? preset.descriptionKo : preset.descriptionEn}</span>
                      </label>
                    );
                  })}
                </div>
              </section>
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
