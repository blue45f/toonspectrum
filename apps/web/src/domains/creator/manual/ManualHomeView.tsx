import { ArrowRight, ChevronRight, MessageSquareText, PenLine, Rocket, Save, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { ManualCategoryIcon } from "./ManualCategoryIcon";
import { MANUAL_CATEGORIES, type ManualArticle } from "./studio-manual-data";
import {
  findManualCategory,
  highlightManualText,
  manualArticleHref,
  manualArticlesInCategory,
  searchManual,
} from "./studio-manual-search";

const ART_ROOT = "/brand/illustrated-20260928";

const QUICK_START: readonly { readonly id: string; readonly icon: LucideIcon; readonly ko: string; readonly en: string; readonly detailKo: string; readonly detailEn: string }[] = [
  { id: "getting-started", icon: Rocket, ko: "작업 준비", en: "Set up", detailKo: "캔버스를 열고 연습 문서 만들기", detailEn: "Open a canvas and a practice file" },
  { id: "brushes", icon: PenLine, ko: "그리기", en: "Draw", detailKo: "브러시 고르고 시험 획 긋기", detailEn: "Pick a brush and test strokes" },
  { id: "lettering", icon: MessageSquareText, ko: "대사 넣기", en: "Add dialogue", detailKo: "말풍선과 읽기 순서 확인", detailEn: "Balloons and reading order" },
  { id: "save-recovery", icon: Save, ko: "안전하게 보관", en: "Keep it safe", detailKo: "저장 상태와 백업 확인", detailEn: "Check saves and backups" },
];

function HighlightedText({ text, query }: { readonly text: string; readonly query: string }) {
  return (
    <>
      {highlightManualText(text, query).map((segment, index) => segment.match
        ? <mark key={index} className="manual-mark">{segment.text}</mark>
        : <span key={index}>{segment.text}</span>)}
    </>
  );
}

function ResultCard({ article, query, onNavigate }: { readonly article: ManualArticle; readonly query: string; readonly onNavigate: () => void }) {
  const bt = useBilingual("StudioManualPage.result");
  const category = findManualCategory(article.category);
  return (
    <Link className="manual-result" to={manualArticleHref(article.id)} onClick={onNavigate}>
      <span className="manual-result-icon" aria-hidden="true"><ManualCategoryIcon categoryId={article.category} size={18} /></span>
      <span className="manual-result-copy">
        <span className="manual-eyebrow">{category ? bt(category.title, category.titleEn) : article.category}</span>
        <strong lang="ko"><HighlightedText text={article.title} query={query} /></strong>
        <span lang="ko"><HighlightedText text={article.summary} query={query} /></span>
      </span>
      <ChevronRight size={18} className="manual-result-arrow" aria-hidden="true" />
    </Link>
  );
}

export function ManualSearchResults({
  query,
  category,
  onReset,
  onPickQuery,
  onNavigate,
  suggestions,
}: {
  readonly query: string;
  readonly category: string;
  readonly onReset: () => void;
  readonly onPickQuery: (query: string) => void;
  readonly onNavigate: () => void;
  readonly suggestions: readonly string[];
}) {
  const bt = useBilingual("StudioManualPage.results");
  const articles = searchManual(query, category);
  return (
    <section aria-labelledby="manual-results-title" className="manual-results">
      <div className="manual-results-heading">
        <h2 id="manual-results-title">{bt("검색 결과", "Search results")}</h2>
        <p role="status">{bt(`${articles.length}개 문서`, `${articles.length} articles`)}</p>
      </div>
      {articles.length > 0 ? (
        <div className="manual-result-list">
          {articles.map((article) => <ResultCard key={article.id} article={article} query={query} onNavigate={onNavigate} />)}
        </div>
      ) : (
        <div className="manual-empty">
          <Search size={22} aria-hidden="true" />
          <h3>{bt("검색 결과가 없습니다", "No matching articles")}</h3>
          <p>{bt("짧은 기능 이름이나 다른 표현으로 찾아보세요.", "Try a shorter feature name or another word.")}</p>
          <div className="manual-chips" aria-label={bt("추천 검색어", "Suggested searches")}>
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => onPickQuery(suggestion)}>{suggestion}</button>
            ))}
          </div>
          <button type="button" className="manual-secondary" onClick={onReset}>{bt("전체 문서 보기", "Show all articles")}</button>
        </div>
      )}
    </section>
  );
}

/** 매뉴얼 첫 화면: 빠른 시작 4단계와 분류별 카드(예시 일러스트·문서 목록). */
export function ManualHomeView({ onNavigate }: { readonly onNavigate: () => void }) {
  const bt = useBilingual("StudioManualPage.home");
  return (
    <>
      <section className="manual-start" aria-labelledby="manual-start-title">
        <div className="manual-section-heading">
          <span className="manual-eyebrow">Quick start</span>
          <h2 id="manual-start-title">{bt("처음이라면, 한 컷부터.", "New here? Start with one panel.")}</h2>
          <p>{bt("도구를 전부 외우기보다 작은 작업 하나를 순서대로 완성해 보세요.", "Instead of memorizing every tool, finish one small task step by step.")}</p>
        </div>
        <ol className="manual-steps">
          {QUICK_START.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.id}>
                <Link to={manualArticleHref(step.id)} onClick={onNavigate}>
                  <span className="manual-step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <Icon size={20} className="manual-step-icon" aria-hidden="true" />
                  <strong>{bt(step.ko, step.en)}</strong>
                  <span>{bt(step.detailKo, step.detailEn)}</span>
                  <ArrowRight size={16} className="manual-step-arrow" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="manual-category-section" aria-labelledby="manual-categories-title">
        <div className="manual-section-heading">
          <span className="manual-eyebrow">Browse by topic</span>
          <h2 id="manual-categories-title">{bt("기능별 매뉴얼", "Guides by topic")}</h2>
          <p>{bt("분류를 고르면 관련 문서와 바로 열 수 있는 작업 공간을 함께 볼 수 있어요.", "Each topic lists its articles and the workspace you can open right away.")}</p>
        </div>
        <div className="manual-category-grid">
          {MANUAL_CATEGORIES.map((category) => {
            const articles = manualArticlesInCategory(category.id);
            return (
              <article key={category.id} className="manual-category-card" aria-labelledby={`manual-category-${category.id}`}>
                <div className="manual-category-art">
                  <img
                    src={`${ART_ROOT}/${category.art}-320.webp`}
                    width={320}
                    height={319}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="manual-category-icon" aria-hidden="true"><ManualCategoryIcon categoryId={category.id} size={18} /></span>
                </div>
                <div className="manual-category-body">
                  <h3 id={`manual-category-${category.id}`}>{bt(category.title, category.titleEn)}</h3>
                  <p>{bt(category.description, category.descriptionEn)} · {bt(`${articles.length}개 문서`, `${articles.length} articles`)}</p>
                  <ul>
                    {articles.map((article) => (
                      <li key={article.id}>
                        <Link to={manualArticleHref(article.id)} onClick={onNavigate} lang="ko">
                          {article.title}
                          <ChevronRight size={14} aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
