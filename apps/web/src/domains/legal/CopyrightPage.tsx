import { Link2, Printer } from "lucide-react";

import { SectionArt } from "@/shared/components/section-art";
import { Container } from "@/shared/components/section";
import { useT } from "@/shared/lib/i18n";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("CopyrightPage", ko, en);

// 저작권·콘텐츠 안내(/copyright).
export function CopyrightPage() {
  const t = useT();
  useBilingualI18nRevision();
  useDocumentTitle(bi("저작권·콘텐츠 안내", "Copyright & Content Notice"));

  const sections = [
    {
      id: "copyright-section-sources",
      title: t("copyright.section1.title"),
      body: t("copyright.section1.body"),
    },
    {
      id: "copyright-section-covers",
      title: t("copyright.section2.title"),
      body: t("copyright.section2.body"),
    },
    {
      id: "copyright-section-metrics",
      title: t("copyright.section3.title"),
      body: bi(
        "네이버 웹툰의 별점은 실수집값이며, 조회·관심수는 공개 집계가 비공개로 전환되어 추정값(≈)으로 표기합니다. 그 외 플랫폼의 평점·조회·완독률 등 일부 지표도 추정값(≈)으로 표기하며, 추정은 명확히 구분 표시합니다.",
        "Star ratings for Naver Webtoon are actually collected values; views and interest counts are shown as estimates (≈) because public aggregation was switched off. Some metrics from other platforms — ratings, views, completion rates — are also estimates (≈), always marked clearly as such.",
      ),
    },
    {
      id: "copyright-section-rights",
      title: t("copyright.section4.title"),
      body: bi(
        "각 작품의 메타데이터·표지에 대한 권리는 해당 플랫폼 및 권리자에게 있습니다. 서비스는 이를 정보 제공·인용 목적으로 사용하며 출처(플랫폼) 링크를 함께 제공합니다.",
        "Rights to each work's metadata and covers belong to the respective platform and rightsholders. The service uses them for informational and quotation purposes, always with a source (platform) link.",
      ),
    },
    {
      id: "copyright-section-takedown",
      title: t("copyright.section5.title"),
      body: t("copyright.section5.body"),
    },
  ];

  return (
    <Container size="prose" className="py-8 sm:py-12 lg:py-16">
      <p className="eyebrow text-accent">COPYRIGHT</p>
      <h1 className="mt-3 text-pretty text-[clamp(1.6rem,7vw,1.875rem)] font-bold leading-tight sm:text-4xl">
        {t("copyright.title")}
      </h1>

      <SectionArt
        image="library"
        className="mt-6 aspect-[21/9] w-full rounded-2xl border border-line object-cover"
      />

      <nav aria-label={bi("문서 목차", "Document outline")} className="mt-6 rounded-2xl border border-line bg-panel/60 p-4">
        <h2 className="text-sm font-bold text-fg">{bi("문서 목차", "Contents")}</h2>
        <ol className="mt-3 space-y-1">
          {sections.map((section, index) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="flex min-h-10 items-start gap-2 rounded-lg px-2 py-2 text-sm leading-6 text-fg-2 hover:bg-card hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <span className="mt-px font-mono text-xs text-accent">{String(index + 1).padStart(2, "0")}</span>
                <span>{section.title}</span>
              </a>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => window.print()}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-card px-3 text-xs font-bold text-fg-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          <Printer size={15} aria-hidden="true" />
          {bi("인쇄·PDF 저장", "Print / save as PDF")}
        </button>
      </nav>

      <div className="mt-8 space-y-7 text-sm leading-relaxed text-fg-2">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-28">
            <div className="group mb-2 flex items-start gap-2">
              <h2 className="min-w-0 text-base font-bold text-fg">{section.title}</h2>
              <a
                href={`#${section.id}`}
                className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-3 opacity-70 transition hover:bg-panel hover:text-accent focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                aria-label={bi(`${section.title} 섹션 링크`, `Link to section: ${section.title}`)}
                title={bi("이 섹션으로 연결", "Link to this section")}
              >
                <Link2 size={14} aria-hidden="true" />
              </a>
            </div>
            <p>{section.body}</p>
            {section.id === "copyright-section-takedown" ? (
              <p className="mt-2">
                <Link href="/support" className="text-accent underline underline-offset-2">
                  {t("copyright.leaveInquiry")}
                </Link>
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </Container>
  );
}
