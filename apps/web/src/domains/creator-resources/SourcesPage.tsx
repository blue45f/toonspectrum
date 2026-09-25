import { useState } from "react";
import { Link } from "react-router-dom";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import { OPEN_API_FEATURES } from "./open-api-features";
import { ResourceLayout } from "./ResourceLayout";
import {
  isFreeResourceSource, resourceSourceAuthLabel, resourceSourceCostLabel, resourceSourceImportLabel,
  resourceSourceIntegrationLabel, resourceSourceRightsLabel, RESOURCE_SOURCES,
} from "./sources";

const FEATURE_STATUS_STYLE: Record<string, string> = {
  "사용 가능": "border-good/30 bg-good/10 text-fg",
  "부분 사용": "border-accent/30 bg-accent-soft text-accent",
  "신청 준비": "border-accent/30 bg-accent-soft text-accent",
  "기술 검토": "border-line bg-raised text-fg-2",
  "OAuth 설계": "border-warn/30 bg-warn/10 text-warn",
};

const COMMERCIAL_STYLE: Record<string, string> = {
  "상업 핵심 후보": "border-good/30 bg-good/10 text-fg",
  "조건부 상업 이용": "border-accent/30 bg-accent-soft text-accent",
  "계약 후 이용": "border-warn/30 bg-warn/10 text-warn",
  "비상업·내부 검토": "border-line bg-raised text-fg-2",
  "운영 제외": "border-danger/30 bg-danger/10 text-danger",
};

function sourceCostStyle(label: string): string {
  if (label.startsWith("무료")) return "border-good/30 bg-good/10 text-fg";
  if (label === "유료·계약 필요") return "border-warn/30 bg-warn/10 text-warn";
  if (label === "운영 제외") return "border-danger/30 bg-danger/10 text-danger";
  return "border-line bg-raised text-fg-2";
}

export function SourcesPage() {
  const [query, setQuery] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [keylessOnly, setKeylessOnly] = useState(false);
  const [liveOnly, setLiveOnly] = useState(false);
  const [directImportOnly, setDirectImportOnly] = useState(false);
  const normalized = query.toLocaleLowerCase().trim();
  const rows = RESOURCE_SOURCES.filter((source) =>
    (!freeOnly || isFreeResourceSource(source))
    && (!keylessOnly || source.freeKeyless === true)
    && (!liveOnly || resourceSourceIntegrationLabel(source) === "운영 연결")
    && (!directImportOnly || resourceSourceImportLabel(source) === "Studio 직접 가져오기")
    && `${source.name} ${source.category} ${source.status} ${source.commercial} ${resourceSourceCostLabel(source)} ${resourceSourceIntegrationLabel(source)} ${resourceSourceAuthLabel(source)} ${resourceSourceRightsLabel(source)} ${resourceSourceImportLabel(source)} ${source.note}`
      .toLocaleLowerCase()
      .includes(normalized),
  );
  return <ResourceLayout title="데이터 출처·상업 이용 준비" intro="구현된 검색 어댑터, 신청 예정 API, 계약 검토 대상과 운영 제외 소스를 구분합니다. 연결 상태와 개별 자료 권리는 별도이며, 권리가 확인되지 않은 자료는 Studio 가져오기와 상업 활용을 차단합니다.">
    <section className="space-y-3 rounded-2xl border border-accent/30 bg-accent-soft p-6">
      <p className="text-xs font-semibold text-accent">무료 운영 · 공개 API 활용</p>
      <h2 className="text-xl font-bold">자료를 모으는 데서, 콘텐츠를 만드는 데까지</h2>
      <p className="text-sm leading-7 text-fg-2">시카고·클리블랜드 미술관 자료와 한국어 배경지식을 검색하고, 기존 저장 자료를 재료 보드로 연결하세요. 콘티·캐릭터·세계관·홍보 구성안·연습 과제·큐레이션 초안을 출처와 함께 만들 수 있습니다.</p>
      <p className="text-xs leading-6 text-fg-2">키 없는 제공처는 가입·API 키·유료 AI 없이 사용합니다. 무료 키가 필요한 제공처는 서버에 설정되기 전 호출하지 않으며, 한도 초과 시 유료 전환하지 않습니다. 기존 호스팅·도메인·전송량 비용은 별도이며, 무료 공개 자료도 개별 이용조건을 확인해야 합니다.</p>
      <Link className={RESOURCE_BUTTON} to="/research/open-creation">무료 창작 재료실 열기</Link>
    </section>
    <section className="space-y-4 rounded-2xl border border-line bg-panel p-6" aria-labelledby="live-open-api-searches">
      <div><p className="text-xs font-semibold text-accent">LIVE · KEYLESS OPEN API</p><h2 id="live-open-api-searches" className="mt-2 text-xl font-bold">가입 없이 바로 쓰는 새 레퍼런스 검색</h2></div>
      <p className="text-sm leading-7 text-fg-2">ambientCG의 CC0 제작 소재, NASA·V&A·Rijksmuseum 레퍼런스, GBIF 생물, Internet Archive, MET Norway, 국가유산 메타데이터를 같은 저장 보드와 출처 내보내기 흐름으로 연결했습니다.</p>
      <div className="flex flex-wrap gap-2">
        <Link className={`${RESOURCE_BUTTON} bg-accent-soft`} to="/research/material-assets">ambientCG 소재</Link>
        <Link className={RESOURCE_BUTTON} to="/research/space-assets">NASA 이미지</Link>
        <Link className={RESOURCE_BUTTON} to="/research/vam">V&A 소장품</Link>
        <Link className={RESOURCE_BUTTON} to="/research/rijksmuseum">Rijksmuseum</Link>
        <Link className={RESOURCE_BUTTON} to="/research/open-data">공개 데이터 창작실</Link>
      </div>
    </section>
    <section className="space-y-3 rounded-2xl border border-accent/30 bg-accent-soft p-6" aria-labelledby="material-atlas-entry"><h2 id="material-atlas-entry" className="text-xl font-bold">무료 소재를 장면 제작으로 연결하세요</h2><p className="text-sm leading-7 text-fg-2">Poly Haven·ambientCG의 확인된 소재 목록, 한글 검색, 8개 제작 가이드와 출처 내보내기. 추가 가입·API 키·유료 생성 없이 브라우저에서 사용합니다.</p><Link className={RESOURCE_BUTTON} to="/research/materials">무료 배경·소품 소재 도감 열기</Link></section>
    <section className="space-y-4 rounded-2xl border border-line bg-panel p-6">
      <h2 className="text-xl font-bold">서로 다른 데이터는 서로 다른 의미로 읽습니다</h2>
      <p className="leading-8 text-fg-2">도서관 대출, 작품 조회수, 검색 관심도, 매출, 산업 종사자 수는 서로 다른 지표입니다. 조사연도·발표일·단위·집계 범위가 다르면 합산하거나 하나의 인기 점수로 표시하지 않습니다.</p>
      <div className="flex flex-wrap gap-3">
        <Link className={`${RESOURCE_BUTTON} bg-accent-soft`} to="/research/open-creation">창작 재료실에서 제작 시작</Link>
        <Link className={RESOURCE_BUTTON} to="/research/packs">12개 장면 팩으로 연습하기</Link>
        <Link className={RESOURCE_BUTTON} to="/insights">기존 인사이트 보기</Link>
        <Link className={RESOURCE_BUTTON} to="/about/crawler">수집 정책 보기</Link>
        <Link className={RESOURCE_BUTTON} to="/copyright">저작권 안내</Link>
      </div>
    </section>
    <section className="space-y-5" aria-labelledby="open-api-feature-map">
      <header><p className="text-sm font-semibold text-accent">API 활용 기능 지도</p><h2 id="open-api-feature-map" className="mt-1 text-2xl font-bold">추가 콘텐츠가 실제 제작 흐름으로 이어지는 위치</h2><p className="mt-2 max-w-3xl leading-7 text-fg-2">사용 가능한 기능과 계정·승인·OAuth가 필요한 기능을 분리했습니다. 준비 상태 카드는 구현 완료를 가장하지 않으며, 연결 전에는 원문 탐색과 설계 근거만 제공합니다.</p></header>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {OPEN_API_FEATURES.map((feature) => <article key={feature.title} className="flex flex-col rounded-2xl border border-line bg-panel p-5">
          <div className="flex items-start justify-between gap-3"><h3 className="font-bold">{feature.title}</h3><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${FEATURE_STATUS_STYLE[feature.status]}`}>{feature.status}</span></div>
          <p className="mt-3 text-sm leading-6 text-fg-2">{feature.description}</p>
          <p className="mt-3 text-xs font-semibold text-fg">연결 제공처 · {feature.providers}</p>
          {feature.route && <Link className={`${RESOURCE_BUTTON} mt-4 self-start bg-accent-soft`} to={feature.route}>기능 열기</Link>}
        </article>)}
      </div>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="상업 이용 상태 설명">
      {Object.keys(COMMERCIAL_STYLE).map((label) => <div key={label} className={`rounded-xl border p-3 text-center text-xs font-semibold ${COMMERCIAL_STYLE[label]}`}>{label}</div>)}
    </section>
    <label htmlFor="resource-source-filter" className="block font-semibold">제공처·분야·비용·상업 준비 상태 필터<input id="resource-source-filter" type="search" className={`${RESOURCE_INPUT} mt-2`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 무료, 글로벌 판본, 계약 후 이용, 3D" /></label>
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={freeOnly} onChange={(event) => setFreeOnly(event.target.checked)} />무료 제공처만 보기</label>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={keylessOnly} onChange={(event) => setKeylessOnly(event.target.checked)} />가입·키 없는 제공처만 보기</label>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={liveOnly} onChange={(event) => setLiveOnly(event.target.checked)} />실제 검색 연결만 보기</label>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={directImportOnly} onChange={(event) => setDirectImportOnly(event.target.checked)} />Studio 직접 가져오기 후보만 보기</label>
    </div>
    <p className="text-sm leading-7 text-fg-2">무료 표시는 API 이용료 기준입니다. 계정·키·승인, 호스팅·전송량, 개별 자료의 저작권·상업 이용 조건은 별도이며, 신청 예정·검토 제공처는 아직 연결된 상태가 아닙니다.</p>
    <p role="status" className="text-sm text-fg-2">{rows.length}개 제공처</p>
    <div className="grid gap-4 md:grid-cols-2">{rows.map((source) => <article key={source.name} className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-accent">{source.category} · {source.status}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${sourceCostStyle(resourceSourceCostLabel(source))}`}>{resourceSourceCostLabel(source)}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${COMMERCIAL_STYLE[source.commercial]}`}>{source.commercial}</span>
        <span className="rounded-full border border-line bg-raised px-2 py-0.5 text-[0.68rem] font-semibold text-fg-2">{resourceSourceIntegrationLabel(source)}</span>
      </div>
      <h2 className="text-lg font-bold">{source.name}</h2><p className="flex-1 text-sm leading-7 text-fg-2">{source.note}</p>
      <dl className="grid grid-cols-1 gap-2 rounded-xl bg-raised p-3 text-xs text-fg-2 sm:grid-cols-3">
        <div><dt className="font-semibold text-fg">인증</dt><dd>{resourceSourceAuthLabel(source)}</dd></div>
        <div><dt className="font-semibold text-fg">권리 판정</dt><dd>{resourceSourceRightsLabel(source)}</dd></div>
        <div><dt className="font-semibold text-fg">제품 반입</dt><dd>{resourceSourceImportLabel(source)}</dd></div>
      </dl>
      {source.termsReviewedAt && <p className="text-[0.68rem] text-fg-3">약관·기술 검토 기준일 {source.termsReviewedAt}</p>}
      <div className="flex flex-wrap gap-2">{source.productRoute && <Link className={`${RESOURCE_BUTTON} bg-accent-soft`} to={source.productRoute}>기능 열기</Link>}<a className={RESOURCE_BUTTON} href={source.url} target="_blank" rel="noopener noreferrer">공식 안내 확인 ↗</a></div>
    </article>)}</div>
  </ResourceLayout>;
}
