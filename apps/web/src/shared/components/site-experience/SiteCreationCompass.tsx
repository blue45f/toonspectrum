import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { ArrowUpRight, ChevronDown, PenTool } from "lucide-react";
import { useId } from "react";
import { useLocation } from "react-router-dom";

import { siteArtDirection } from "./site-art-direction";
import { SiteArtwork } from "./SiteArtwork";
import Link from "@/shared/navigation/router-link";


const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("SiteCreationCompass", ko, en);

/** A compact contextual brief. Expanded guidance is opt-in, not another hero. */
export function SiteCreationCompass() {
  useBilingualI18nRevision();
  const { pathname } = useLocation();


  const id = useId();
  const direction = siteArtDirection(pathname);
  if (!direction) return null;
  const [title, description, action] = bi((direction).ko, (direction).en);
  return (
    <aside className="site-creation-compass" aria-label={bi("전문 창작 여정 안내", "Professional creative journey")} data-testid="site-creation-compass">
      <details key={pathname} className="site-creation-compass__details">
        <summary aria-controls={id}>
          <PenTool size={17} aria-hidden="true" />
          <span><strong>TOONSTUDIO <span aria-hidden="true">/</span> {direction.chapter}</strong>
            <span>{bi("이 페이지를 내 창작에 활용하는 방법", "Connect this page with your creative practice")}</span></span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div id={id} className="site-creation-compass__brief">
          <div className="site-creation-compass__image"><SiteArtwork image={direction.image} alt="" sizes="(max-width: 767px) calc(100vw - 58px), 150px" /></div>
          <div><h2>{title}</h2><p>{description}</p><small>{bi("브러시 · 레이어 · 컷 · 말풍선 — 웹툰을 직접 그리는 전문 작업실", "Brushes · layers · panels · dialogue — a professional drawing workspace")}</small></div>
        </div>
      </details>
      <Link href={direction.href} className="site-creation-compass__action">{action}<ArrowUpRight size={16} aria-hidden="true" /></Link>
    </aside>
  );
}
