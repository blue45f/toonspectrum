import { useId } from "react";

import { AtelierWorkbenchDemo } from "./AtelierWorkbenchDemo";
import { atelierChapterForPath, type AtelierLocale } from "./site-atelier-content";

export function SiteAtelierChapter({ pathname, locale }: { pathname: string; locale: AtelierLocale }) {
  const headingId = useId();
  const chapter = atelierChapterForPath(pathname);
  // Home owns the demonstration inside its toolkit section.
  if (!chapter || pathname.replace(/\/+$/u, "") === "") return null;
  return <section className="site-atelier-chapter" aria-labelledby={headingId} data-testid="site-atelier-chapter">
    <div className="site-atelier-chapter__heading"><span aria-hidden="true">{chapter.number}</span><div><p>FROM INSPIRATION TO CREATION</p><h2 id={headingId}>{chapter[locale][0]}</h2><p>{chapter[locale][1]}</p></div></div>
    <AtelierWorkbenchDemo key={pathname} locale={locale} initialScene={chapter.scene} />
  </section>;
}
