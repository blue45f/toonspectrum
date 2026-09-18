import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  CURATED_LEARNING_RESOURCES as LEARNING_RESOURCES,
  PRODUCTION_STEP_LABELS,
  RESOURCE_SOURCE_LABELS,
  filterLearningResources,
  type LearningResourceSource,
  type ProductionStep,
} from "./learning-resources";
import type { LearningLevel } from "./learning-paths";

type LearningResourceProvider = LearningResourceSource;
type LearningResourceCategory = ProductionStep;
type LearningResourceLevel = LearningLevel;

const LEARNING_RESOURCE_ACCESS_LABELS = {
  internal: "ToonStudio",
  embed: "임베드",
  "link-only": "외부 링크",
  "metadata-only": "메타데이터",
} as const;

const ACADEMY_DISCOVERY_CONTRACT = {
  youtube: { operations: ["search.list", "playlistItems.list", "videos.list"] },
  mcp: { tools: ["search_learning_resources", "get_learning_resource"] },
} as const;

const LEVEL_LABELS: Readonly<Record<LearningResourceLevel, string>> = {
  starter: "입문",
  growing: "중급",
  advanced: "심화",
};

function filterValue<T extends string>(value: string | null, allowed: readonly T[]): T | "all" {
  return value && allowed.includes(value as T) ? value as T : "all";
}
const PROVIDERS = Object.keys(RESOURCE_SOURCE_LABELS) as LearningResourceProvider[];
const CATEGORIES = Object.keys(PRODUCTION_STEP_LABELS) as LearningResourceCategory[];
const LEVELS: readonly LearningResourceLevel[] = ["starter", "growing", "advanced"];

function updateParam(params: URLSearchParams, key: string, value: string): URLSearchParams {
  const next = new URLSearchParams(params);
  if (!value || value === "all") next.delete(key);
  else next.set(key, value);
  return next;
}

export function LearningResourceHub() {
  const [params, setParams] = useSearchParams();
  useEffect(() => { document.title = "교육 자료 허브 · 툰스튜디오"; }, []);

  const query = (params.get("q") ?? "").slice(0, 160);
  const provider = filterValue(params.get("provider"), PROVIDERS);
  const category = filterValue(params.get("category"), CATEGORIES);
  const level = filterValue(params.get("level"), LEVELS);
  const resources = filterLearningResources(LEARNING_RESOURCES, { query, source: provider, step: category, level });

  const setFilter = (key: string, value: string, replace = false) => {
    setParams(updateParam(params, key, value), { replace });
  };
  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6" lang="ko">
      <header className="grid gap-8 rounded-[2rem] border border-line bg-panel p-6 shadow-sm lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)] lg:p-10">
        <div>
          <p className="text-xs font-black tracking-[.18em] text-accent">TOONSTUDIO ACADEMY / RESOURCE HUB</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-fg sm:text-5xl">웹툰을 만드는 모든 과정을,<br />배우고 바로 실습하세요.</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-fg-2">자체 강좌와 공공 교육기관, 공식 제작 가이드, YouTube 탐색 링크를 한곳에서 찾고 관련 ToonStudio 작업 화면으로 바로 이어갑니다.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="rounded-full bg-accent px-5 py-3 text-sm font-bold text-accent-contrast" to="/learn">내 학습 경로 보기</Link>
            <Link className="rounded-full border border-line px-5 py-3 text-sm font-bold text-fg hover:bg-raised" to="/learn/classroom">교육기관 활용 보기</Link>
          </div>
        </div>
        <aside className="rounded-3xl border border-line bg-raised/70 p-5">
          <p className="text-xs font-bold tracking-[.16em] text-fg-2">CONTENT POLICY</p>
          <h2 className="mt-2 text-xl font-black text-fg">원문은 원문 서비스에서</h2>
          <p className="mt-3 text-sm leading-6 text-fg-2">외부 영상·문서를 무단 복제하지 않습니다. 출처와 접근 방식을 표시하고, 학습 맥락과 실습 연결만 ToonStudio가 제공합니다.</p>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-fg-2">자료</dt><dd className="mt-1 text-2xl font-black text-fg">{LEARNING_RESOURCES.length}</dd></div>
            <div><dt className="text-fg-2">출처</dt><dd className="mt-1 text-2xl font-black text-fg">{new Set(LEARNING_RESOURCES.map((item) => item.provider)).size}</dd></div>
          </dl>
        </aside>
      </header>
      <section className="mt-8 rounded-3xl border border-line bg-panel p-5" aria-labelledby="resource-filter-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-black tracking-[.16em] text-accent">FIND A LESSON</p><h2 id="resource-filter-title" className="mt-1 text-2xl font-black text-fg">지금 필요한 기술로 찾기</h2></div>
          <p className="text-sm text-fg-2" role="status">검색 결과 {resources.length}개</p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-bold text-fg">검색
            <input className="mt-2 w-full rounded-xl border border-line bg-base px-3 py-2.5 font-normal" type="search" value={query} placeholder="콘티, 인체, 배경, 채색…" onChange={(event) => setFilter("q", event.currentTarget.value, true)} />
          </label>
          <label className="text-sm font-bold text-fg">출처
            <select className="mt-2 w-full rounded-xl border border-line bg-base px-3 py-2.5 font-normal" value={provider} onChange={(event) => setFilter("provider", event.currentTarget.value)}>
              <option value="all">전체 출처</option>{PROVIDERS.map((item) => <option key={item} value={item}>{RESOURCE_SOURCE_LABELS[item]}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold text-fg">주제
            <select className="mt-2 w-full rounded-xl border border-line bg-base px-3 py-2.5 font-normal" value={category} onChange={(event) => setFilter("category", event.currentTarget.value)}>
              <option value="all">전체 주제</option>{CATEGORIES.map((item) => <option key={item} value={item}>{PRODUCTION_STEP_LABELS[item]}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold text-fg">난이도
            <select className="mt-2 w-full rounded-xl border border-line bg-base px-3 py-2.5 font-normal" value={level} onChange={(event) => setFilter("level", event.currentTarget.value)}>
              <option value="all">전체 난이도</option>{LEVELS.map((item) => <option key={item} value={item}>{LEVEL_LABELS[item]}</option>)}
            </select>
          </label>
        </div>
      </section>
      {resources.length ? (
        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="교육 자료 목록">
          {resources.map((resource) => {
            const external = resource.url.startsWith("http");
            return (
              <article key={resource.id} className="flex min-h-80 flex-col rounded-3xl border border-line bg-panel p-5 shadow-sm">
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full bg-accent-soft px-3 py-1 text-accent">{RESOURCE_SOURCE_LABELS[resource.source]}</span>
                  <span className="rounded-full bg-raised px-3 py-1 text-fg-2">{PRODUCTION_STEP_LABELS[resource.steps[0] ?? "workflow"]}</span>
                  <span className="rounded-full bg-raised px-3 py-1 text-fg-2">{LEVEL_LABELS[resource.level]}</span>
                </div>
                <h2 className="mt-4 text-xl font-black leading-snug text-fg">{resource.title}</h2>
                <p className="mt-3 flex-1 text-sm leading-6 text-fg-2">{resource.summary}</p>
                <div className="mt-4 flex flex-wrap gap-2" aria-label="관련 역량">
                  {resource.skills.map((skill) => <span key={skill} className="rounded-lg border border-line px-2.5 py-1 text-xs text-fg-2">{skill}</span>)}
                </div>
                <div className="mt-5 border-t border-line pt-4 text-xs text-fg-2">
                  <p>{LEARNING_RESOURCE_ACCESS_LABELS[resource.rights]} · {resource.verified ? "검증됨" : "미검증"}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {external ? <a className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-accent-contrast" href={resource.url} target="_blank" rel="noopener noreferrer">원문 열기 ↗</a> : <Link className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-accent-contrast" to={resource.url}>강좌 열기 →</Link>}
                  {resource.practicePath && <Link className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-fg hover:bg-raised" to={resource.practicePath}>바로 실습 →</Link>}
                </div>
              </article>
            );
          })}
        </section>
      ) : <section className="mt-6 rounded-3xl border border-dashed border-line p-10 text-center"><h2 className="text-xl font-black text-fg">조건에 맞는 자료가 없습니다.</h2><button className="mt-4 rounded-full border border-line px-4 py-2 text-sm font-bold" type="button" onClick={() => setParams({})}>전체 자료 보기</button></section>}
      <section className="mt-10 grid gap-4 lg:grid-cols-3" aria-labelledby="academy-integration-title">
        <div className="lg:col-span-3"><p className="text-xs font-black tracking-[.16em] text-accent">DISCOVERY PIPELINE</p><h2 id="academy-integration-title" className="mt-1 text-2xl font-black text-fg">외부 강의를 안전하게 확장하는 구조</h2></div>
        <article className="rounded-3xl border border-line bg-panel p-5"><span className="text-xs font-black text-accent">01</span><h3 className="mt-2 text-lg font-black text-fg">YouTube Data API</h3><p className="mt-2 text-sm leading-6 text-fg-2">검색은 서버에서 수행하고 검증된 채널·재생목록은 주기 동기화합니다. 영상 파일 대신 ID와 최신 메타데이터를 관리하는 계약을 사용합니다.</p><p className="mt-4 text-xs text-fg-2">{ACADEMY_DISCOVERY_CONTRACT.youtube.operations.join(" · ")}</p></article>
        <article className="rounded-3xl border border-line bg-panel p-5"><span className="text-xs font-black text-accent">02</span><h3 className="mt-2 text-lg font-black text-fg">Academy Content MCP</h3><p className="mt-2 text-sm leading-6 text-fg-2">AI Tutor와 Studio가 특정 공급자 구현을 몰라도 같은 학습 자료 검색 계약을 호출할 수 있도록 MCP 도구 경계를 고정합니다.</p><p className="mt-4 text-xs text-fg-2">{ACADEMY_DISCOVERY_CONTRACT.mcp.tools.join(" · ")}</p></article>
        <article className="rounded-3xl border border-line bg-panel p-5"><span className="text-xs font-black text-accent">03</span><h3 className="mt-2 text-lg font-black text-fg">Learn → Practice</h3><p className="mt-2 text-sm leading-6 text-fg-2">자료마다 관련 Story Lab, Drawing, Poser 등 실습 목적지를 연결합니다. 교육 콘텐츠를 소비하는 데서 끝나지 않고 바로 결과물을 만들게 합니다.</p><Link className="mt-4 inline-block text-sm font-bold text-accent" to="/learn/studio">Studio 실습 과정 보기 →</Link></article>
      </section>

      <footer className="mt-10 border-t border-line pt-6 text-sm leading-6 text-fg-2">
        <p>외부 콘텐츠의 저작권과 이용 조건은 각 원문 제공자의 정책을 따릅니다. ToonStudio는 원문을 복제하지 않고 학습 목적의 메타데이터·링크·자체 분류와 실습 연결을 제공합니다.</p>
      </footer>
    </main>
  );
}
