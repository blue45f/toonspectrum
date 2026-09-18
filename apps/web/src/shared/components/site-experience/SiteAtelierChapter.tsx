import {
  translateCurrentStaticSourceText,
  translateLocaleBranchForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import { useId } from "react";

import { AtelierWorkbenchDemo } from "./AtelierWorkbenchDemo";
import { atelierChapterForPath, type AtelierLocale } from "./site-atelier-content";

export function SiteAtelierChapter({ pathname, locale }: { pathname: string; locale: AtelierLocale }) {
  const headingId = useId();
  const chapter = atelierChapterForPath(pathname);
  // Home owns the demonstration inside its toolkit section.
  if (!chapter || pathname.replace(/\/+$/u, "") === "") return null;
  const copy = translateLocaleBranchForLocale(locale, "shared.components.siteExperience.SiteAtelierChapter", chapter);
  return <section className="site-atelier-chapter" aria-labelledby={headingId} data-testid="site-atelier-chapter">
    <div className="site-atelier-chapter__heading"><span aria-hidden="true">{chapter.number}</span><div><p>{translateCurrentStaticSourceText("shared.components.site.experience.SiteAtelierChapter", "en", "FROM INSPIRATION TO CREATION")}</p><h2 id={headingId}>{copy[0]}</h2><p>{copy[1]}</p></div></div>
    <AtelierWorkbenchDemo key={pathname} locale={locale} initialScene={chapter.scene} />
  </section>;
}
