import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Info, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { manualArticleScreen, manualSectionTool, manualStepRegions, type ManualArticleScreen } from "./manual-article-screens";
import { manualRegionCopy, manualRegionNumber } from "./manual-screen-map";
import { ManualCategoryIcon } from "./ManualCategoryIcon";
import { ManualScreenMap } from "./ManualScreenMap";
import { MANUAL_SHORTCUTS, MANUAL_UPDATED, MANUAL_WORKSPACE_LABELS, type ManualArticle } from "./studio-manual-data";
import {
  adjacentManualArticles,
  findManualArticle,
  findManualCategory,
  manualArticleHref,
  manualReadingMinutes,
} from "./studio-manual-search";

const ART_ROOT = "/brand/illustrated-20260928";

/** 단계가 일어나는 화면 영역 — 도식의 번호와 같은 번호·이름으로 "어디에서 하는지"를 단계 옆에 붙인다. */
function StepLocation({ screen, region }: { readonly screen: ManualArticleScreen; readonly region: string }) {
  const bt = useBilingual("StudioManualPage.screen");
  const language = useI18n((state) => state.lang);
  const copy = manualRegionCopy(screen, region);
  const number = manualRegionNumber(screen, region);
  if (!copy || !number) return null;
  return (
    <span className="manual-step-where" lang={language.startsWith("ko") ? "ko" : "en"}>
      <span className="manual-screen-badge" aria-hidden="true">{number}</span>
      <span className="manual-sr-only">{bt("화면 위치 ", "On screen: ")}</span>
      {bt(copy.name.ko, copy.name.en)}
    </span>
  );
}

/** 섹션을 바로 따라 할 수 있는 실제 화면 바로가기(새 탭이라 이 문서를 옆에 두고 따라 할 수 있다). */
function SectionToolLink({ articleId, sectionId }: { readonly articleId: string; readonly sectionId: string }) {
  const bt = useBilingual("StudioManualPage.section");
  const language = useI18n((state) => state.lang);
  const tool = manualSectionTool(articleId, sectionId);
  if (!tool) return null;
  return (
    <p className="manual-section-tool manual-no-print">
      <a href={tool.href} target="_blank" rel="noopener noreferrer" lang={language.startsWith("ko") ? "ko" : "en"}>
        {bt(tool.label.ko, tool.label.en)}
        <span className="manual-sr-only">{bt(" (새 탭)", " (new tab)")}</span>
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    </p>
  );
}

function ManualCopyButton() {
  const bt = useBilingual("StudioManualPage.copy");
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [fallback, setFallback] = useState("");
  async function copyAddress() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(window.location.href);
      setStatus("copied");
    } catch {
      setFallback(window.location.href);
      setStatus("failed");
    }
  }
  return (
    <div className="manual-copy">
      <button type="button" onClick={() => { void copyAddress(); }}>
        {status === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        {bt("주소 복사", "Copy link")}
      </button>
      <span role="status" className="manual-copy-status">
        {status === "copied"
          ? bt("주소를 복사했습니다.", "Link copied.")
          : status === "failed"
            ? bt("복사 권한이 없습니다. 아래 주소를 선택해 복사하세요.", "Clipboard blocked. Select the address below to copy it.")
            : ""}
      </span>
      {status === "failed" && <input aria-label={bt("직접 복사할 매뉴얼 주소", "Manual address to copy")} readOnly value={fallback} onFocus={(event) => event.currentTarget.select()} />}
    </div>
  );
}

function useScrollToKnownAnchor(article: ManualArticle) {
  const { hash } = useLocation();
  useEffect(() => {
    let anchor: string;
    try {
      anchor = decodeURIComponent(hash.slice(1));
    } catch {
      return;
    }
    const knownAnchor = article.sections.some((section) => section.id === anchor)
      || (article.id === "shortcuts" && anchor === "shortcut-table");
    if (!knownAnchor) return;
    // The lazy article may mount after the browser's initial fragment navigation.
    // Run after the app shell's focus/scroll restoration and limit this to known section IDs.
    const frame = requestAnimationFrame(() => {
      document.getElementById(anchor)?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [article, hash]);
}

/** 문서 한 편: 머리말·예시 일러스트·목차·단계 카드·관련 도구 바로가기·이전/다음 문서. */
export function ManualArticleView({ article }: { readonly article: ManualArticle }) {
  const bt = useBilingual("StudioManualPage.article");
  useScrollToKnownAnchor(article);
  const category = findManualCategory(article.category);
  const { previous, next } = adjacentManualArticles(article.id);
  const workspace = MANUAL_WORKSPACE_LABELS[article.workspace];
  const workspaceLabel = workspace ? bt(workspace.ko, workspace.en) : bt("관련 작업 공간 열기", "Open the related workspace");
  const minutes = manualReadingMinutes(article);
  const screen = manualArticleScreen(article.id);
  const contents = [
    ...article.sections.map((section) => ({ id: section.id, title: section.title })),
    ...(article.id === "shortcuts" ? [{ id: "shortcut-table", title: "기본 단축키 표" }] : []),
  ];

  return (
    <>
      <header className="manual-article-head">
        <p className="manual-article-category">
          <ManualCategoryIcon categoryId={article.category} size={15} />
          {category ? bt(category.title, category.titleEn) : article.category}
        </p>
        <h1 id="manual-title" lang="ko">{article.title}</h1>
        <p className="manual-summary" lang="ko">{article.summary}</p>
        <p className="manual-meta">
          {bt(`읽는 시간 약 ${minutes}분`, `About ${minutes} min read`)} · <time dateTime={MANUAL_UPDATED}>{bt(`${MANUAL_UPDATED.replaceAll("-", ".")} 업데이트`, `Updated ${MANUAL_UPDATED}`)}</time>
        </p>
        <div className="manual-actions manual-no-print">
          <a className="manual-primary" href={article.workspace} target="_blank" rel="noopener noreferrer">
            {workspaceLabel}
            <span className="manual-sr-only">{bt(" (새 탭)", " (new tab)")}</span>
            <ExternalLink size={15} aria-hidden="true" />
          </a>
          <ManualCopyButton key={article.id} />
          <button type="button" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />{bt("인쇄", "Print")}</button>
        </div>
      </header>

      {category && !screen ? (
        <figure className="manual-figure">
          <img
            src={`${ART_ROOT}/${category.art}-640.webp`}
            srcSet={`${ART_ROOT}/${category.art}-320.webp 320w, ${ART_ROOT}/${category.art}-640.webp 640w`}
            sizes="(min-width: 960px) 44rem, 92vw"
            width={640}
            height={637}
            loading="lazy"
            decoding="async"
            alt={bt(`${category.title} 예시 일러스트`, `${category.titleEn} example illustration`)}
          />
          <figcaption>
            <Info size={14} aria-hidden="true" />
            {bt("예시 일러스트예요. 실제 화면은 스튜디오에서 확인하세요.", "Example illustration. Check the real screen in Studio.")}
          </figcaption>
        </figure>
      ) : null}

      <div className="manual-article-layout">
        <nav className="manual-toc manual-no-print" aria-label={bt("문서 내 목차", "On this page")}>
          <p className="manual-toc-title">{bt("이 문서의 목차", "On this page")}</p>
          <ol>
            {contents.map((entry, index) => (
              <li key={entry.id}><a href={`#${entry.id}`} lang="ko"><span aria-hidden="true">{index + 1}</span>{entry.title}</a></li>
            ))}
          </ol>
        </nav>

        <div className="manual-article-body">
          {screen ? <ManualScreenMap screen={screen} /> : null}
          <div lang="ko">
            {article.sections.map((section) => {
              const regions = manualStepRegions(screen, section.id);
              return (
                <section className="manual-section" key={section.id} aria-labelledby={section.id}>
                  <h2 id={section.id}><a href={`#${section.id}`}>{section.title}</a></h2>
                  {section.paragraphs.map((text) => <p key={text}>{text}</p>)}
                  {section.steps ? (
                    <ol className="manual-step-list">
                      {section.steps.map((text, index) => {
                        const region = regions[index];
                        return (
                          <li key={text}>
                            <span className="manual-step-count" aria-hidden="true">{index + 1}</span>
                            <span className="manual-step-text">
                              {text}
                              {screen && region ? <StepLocation screen={screen} region={region} /> : null}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  ) : null}
                  {section.note ? <aside className="manual-note"><strong>{bt("확인하세요", "Good to know")}</strong><p>{section.note}</p></aside> : null}
                  <SectionToolLink articleId={article.id} sectionId={section.id} />
                </section>
              );
            })}
            {article.id === "shortcuts" ? (
              <section className="manual-section" aria-labelledby="shortcut-table">
                <h2 id="shortcut-table">기본 단축키 표</h2>
                <div className="manual-table-wrap">
                  <table>
                    <caption>스튜디오 기본 단축키 일부. 사용자 지정 키맵은 스튜디오의 단축키 도움말에서 확인하세요.</caption>
                    <thead><tr><th scope="col">키</th><th scope="col">동작</th></tr></thead>
                    <tbody>{MANUAL_SHORTCUTS.map((row) => <tr key={row.keys}><th scope="row"><kbd>{row.keys}</kbd></th><td>{row.action}</td></tr>)}</tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>

      <section className="manual-tool-cta manual-no-print" aria-labelledby="manual-tool-cta-title">
        <div>
          <span className="manual-eyebrow">Try it now</span>
          <h2 id="manual-tool-cta-title">{bt("읽은 기능을 바로 써 보세요", "Try what you just read")}</h2>
          <p>{bt("작업 공간은 새 탭에서 열려서 이 문서를 옆에 두고 따라 할 수 있어요.", "The workspace opens in a new tab so you can follow along with this article.")}</p>
        </div>
        <a className="manual-primary" href={article.workspace} target="_blank" rel="noopener noreferrer">
          {workspaceLabel}
          <span className="manual-sr-only">{bt(" (새 탭)", " (new tab)")}</span>
          <ExternalLink size={15} aria-hidden="true" />
        </a>
      </section>

      <section className="manual-related manual-no-print" aria-labelledby="manual-related-title">
        <h2 id="manual-related-title">{bt("함께 보면 좋은 문서", "Related articles")}</h2>
        <div className="manual-tags">{article.related.map((id) => {
          const related = findManualArticle(id);
          return related ? <Link key={id} to={manualArticleHref(id)} lang="ko">{related.title}<ArrowRight size={13} aria-hidden="true" /></Link> : null;
        })}</div>
      </section>
      <nav className="manual-pagination manual-no-print" aria-label={bt("이전 다음 문서", "Previous and next articles")}>
        <div>{previous ? <Link to={manualArticleHref(previous.id)}><span><ArrowLeft size={13} aria-hidden="true" />{bt("이전 문서", "Previous")}</span><strong lang="ko">{previous.title}</strong></Link> : null}</div>
        <div>{next ? <Link to={manualArticleHref(next.id)}><span>{bt("다음 문서", "Next")}<ArrowRight size={13} aria-hidden="true" /></span><strong lang="ko">{next.title}</strong></Link> : null}</div>
      </nav>
    </>
  );
}
