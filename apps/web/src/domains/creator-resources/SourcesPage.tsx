import { useState } from "react";
import { Link } from "react-router-dom";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import { ResourceLayout } from "./ResourceLayout";
import { RESOURCE_SOURCES } from "./sources";

const COMMERCIAL_STYLE: Record<string, string> = {
  "상업 핵심 후보": "border-good/30 bg-good/10 text-good",
  "조건부 상업 이용": "border-accent/30 bg-accent-soft text-accent",
  "계약 후 이용": "border-warn/30 bg-warn/10 text-warn",
  "비상업·내부 검토": "border-line bg-raised text-fg-2",
  "운영 제외": "border-danger/30 bg-danger/10 text-danger",
};

export function SourcesPage() {
  const [query, setQuery] = useState("");
  const [keylessOnly, setKeylessOnly] = useState(false);
  const normalized = query.toLocaleLowerCase().trim();
  const rows = RESOURCE_SOURCES.filter((source) => (!keylessOnly || source.freeKeyless === true) &&
    `${source.name} ${source.category} ${source.status} ${source.commercial} ${source.note}`
      .toLocaleLowerCase()
      .includes(normalized),
  );
  return <ResourceLayout title="데이터 출처·상업 이용 준비" intro="구현된 검색 어댑터, 신청 예정 API, 계약 검토 대상과 운영 제외 소스를 구분합니다. 연결 상태와 개별 자료 권리는 별도이며, 권리가 확인되지 않은 자료는 Studio 가져오기와 상업 활용을 차단합니다.">
    <section className="space-y-4 rounded-2xl border border-line bg-panel p-6">
      <h2 className="text-xl font-bold">서로 다른 데이터는 서로 다른 의미로 읽습니다</h2>
      <p className="leading-8 text-fg-2">도서관 대출, 작품 조회수, 검색 관심도, 매출, 산업 종사자 수는 서로 다른 지표입니다. 조사연도·발표일·단위·집계 범위가 다르면 합산하거나 하나의 인기 점수로 표시하지 않습니다.</p>
      <div className="flex flex-wrap gap-3">
        <Link className={`${RESOURCE_BUTTON} bg-accent-soft`} to="/research/open-creation">무료 창작 재료실 열기</Link>
        <Link className={RESOURCE_BUTTON} to="/research/packs">12개 장면 팩으로 연습하기</Link>
        <Link className={RESOURCE_BUTTON} to="/insights">기존 인사이트 보기</Link>
        <Link className={RESOURCE_BUTTON} to="/about/crawler">수집 정책 보기</Link>
        <Link className={RESOURCE_BUTTON} to="/copyright">저작권 안내</Link>
      </div>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="상업 이용 상태 설명">
      {Object.keys(COMMERCIAL_STYLE).map((label) => <div key={label} className={`rounded-xl border p-3 text-center text-xs font-semibold ${COMMERCIAL_STYLE[label]}`}>{label}</div>)}
    </section>
    <label htmlFor="resource-source-filter" className="block font-semibold">제공처·분야·상업 준비 상태 필터<input id="resource-source-filter" type="search" className={`${RESOURCE_INPUT} mt-2`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 글로벌 판본, 계약 후 이용, 3D" /></label>
    <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={keylessOnly} onChange={(event) => setKeylessOnly(event.target.checked)} />무료·키 없는 제공처만 보기 (연동 상태는 각 카드 확인)</label>
    <p className="text-sm leading-7 text-fg-2">이번 제작실에는 추가 신청이나 인증키가 필요하지 않습니다. 신청 예정·검토로 표시된 제공처는 승인되거나 연결된 상태가 아닙니다. 무료 API도 호출 한도와 자료별 이용조건이 있습니다.</p>
    <p role="status" className="text-sm text-fg-2">{rows.length}개 제공처</p>
    <div className="grid gap-4 md:grid-cols-2">{rows.map((source) => <article key={source.name} className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-accent">{source.category} · {source.status}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${COMMERCIAL_STYLE[source.commercial]}`}>{source.commercial}</span>
      </div>
      <h2 className="text-lg font-bold">{source.name}</h2><p className="flex-1 text-sm leading-7 text-fg-2">{source.note}</p>
      <a className={RESOURCE_BUTTON} href={source.url} target="_blank" rel="noopener noreferrer">공식 안내 확인 ↗</a>
    </article>)}</div>
  </ResourceLayout>;
}
