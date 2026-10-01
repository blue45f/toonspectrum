import { translateBilingualValueForLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { Sparkles } from "lucide-react";

import { useSiteExperience } from "./site-experience/site-experience-context";

import { cx } from "@/shared/lib/cx";

import "./public-site-shell.css";

/** 공개 페이지 헤더 도구 영역의 화면 분위기(화사하게/차분하게) 전환 버튼. */
export function PublicSiteAppearanceToggle({ locale, className }: { locale: "ko" | "en"; className?: string }) {
  useBilingualI18nRevision();
  const settings = useSiteExperience();
  if (!settings) return null;
  const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
    translateBilingualValueForLocale(locale, "public-site-appearance", ko, en);
  return (
    <button
      type="button"
      className={cx("site-experience-toggle site-experience-toggle--compact", className)}
      aria-label={bi("차분한 화면", "Calm appearance")}
      aria-pressed={settings.mode === "calm"}
      title={bi("차분한 화면 전환", "Toggle calm appearance")}
      onClick={() => settings.setMode(settings.mode === "vivid" ? "calm" : "vivid")}
    >
      <Sparkles size={16} aria-hidden="true" />
    </button>
  );
}
