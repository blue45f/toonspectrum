import { useId } from "react";

import { AtelierWorkbenchDemo } from "./AtelierWorkbenchDemo";
import { atelierChapterForPath, type AtelierLocale } from "./site-atelier-content";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("SiteAtelierChapter", ko, en);

export function SiteAtelierChapter({ pathname, locale }: { pathname: string; locale: AtelierLocale }) {
  useBilingualI18nRevision();
  const headingId = useId();
  const chapter = atelierChapterForPath(pathname);
  // Home owns the demonstration inside its toolkit section.
  if (!chapter || pathname.replace(/\/+$/u, "") === "") return null;
  return <section className="site-atelier-chapter" aria-labelledby={headingId} data-testid="site-atelier-chapter">
    <div className="site-atelier-chapter__heading"><span aria-hidden="true">{chapter.number}</span><div><p>FROM INSPIRATION TO CREATION</p><h2 id={headingId}>{bi((chapter).ko, (chapter).en)[0]}</h2><p>{bi((chapter).ko, (chapter).en)[1]}</p></div></div>
    <AtelierWorkbenchDemo key={pathname} locale={locale} initialScene={chapter.scene} />
  </section>;
}
