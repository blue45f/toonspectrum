import {
  resolveUiLocale,
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText,
  translateLocaleBranchForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import { ArrowUpRight, ChevronDown, PenTool } from "lucide-react";
import { useId } from "react";
import { useLocation } from "react-router-dom";

import { siteArtDirection } from "./site-art-direction";
import { SiteArtwork } from "./SiteArtwork";
import Link from "@/compat/router-link";
import { useI18n } from "@/shared/lib/i18n";

/** A compact contextual brief. Expanded guidance is opt-in, not another hero. */
export function SiteCreationCompass() {
  const { pathname } = useLocation();
  const language = useI18n((state) => state.lang);
  const locale = resolveUiLocale(language);
  const id = useId();
  const direction = siteArtDirection(pathname);
  if (!direction) return null;
  const [title, description, action] = translateLocaleBranchForLocale(locale, "shared.components.site.experience.SiteCreationCompass", direction);
  return (
    <aside className="site-creation-compass" aria-label={translateBilingualValueForLocale(locale, "shared.components.site.experience.SiteCreationCompass", "전문 창작 여정 안내", "Professional creative journey")} data-testid="site-creation-compass">
      <details key={pathname} className="site-creation-compass__details">
        <summary aria-controls={id}>
          <PenTool size={17} aria-hidden="true" />
          <span><strong>{translateCurrentStaticSourceText("shared.components.site.experience.SiteCreationCompass", "en", "TOONSTUDIO ")}<span aria-hidden="true">/</span> {direction.chapter}</strong>
            <span>{translateBilingualValueForLocale(locale, "shared.components.site.experience.SiteCreationCompass", "이 페이지를 내 창작에 활용하는 방법", "Connect this page with your creative practice")}</span></span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div id={id} className="site-creation-compass__brief">
          <div className="site-creation-compass__image"><SiteArtwork image={direction.image} alt="" sizes="(max-width: 767px) calc(100vw - 58px), 150px" /></div>
          <div><h2>{title}</h2><p>{description}</p><small>{translateBilingualValueForLocale(locale, "shared.components.site.experience.SiteCreationCompass", "브러시 · 레이어 · 컷 · 말풍선 — 웹툰을 직접 그리는 전문 작업실", "Brushes · layers · panels · dialogue — a professional drawing workspace")}</small></div>
        </div>
      </details>
      <Link href={direction.href} className="site-creation-compass__action">{action}<ArrowUpRight size={16} aria-hidden="true" /></Link>
    </aside>
  );
}
