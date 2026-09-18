import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useState } from "react";
import { Link } from "react-router-dom";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import { ResourceLayout } from "./ResourceLayout";
import { isFreeResourceSource, resourceSourceCostLabel, RESOURCE_SOURCES } from "./sources";

const COMMERCIAL_STYLE: Record<string, string> = {
  "상업 핵심 후보": "border-good/30 bg-good/10 text-good",
  "조건부 상업 이용": "border-accent/30 bg-accent-soft text-accent",
  "계약 후 이용": "border-warn/30 bg-warn/10 text-warn",
  "비상업·내부 검토": "border-line bg-raised text-fg-2",
  "운영 제외": "border-danger/30 bg-danger/10 text-danger",
};

function sourceCostStyle(label: string): string {
  if (label.startsWith("무료")) return "border-good/30 bg-good/10 text-good";
  if (label === "유료·계약 필요") return "border-warn/30 bg-warn/10 text-warn";
  if (label === "운영 제외") return "border-danger/30 bg-danger/10 text-danger";
  return "border-line bg-raised text-fg-2";
}

export function SourcesPage() {
  const [query, setQuery] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [keylessOnly, setKeylessOnly] = useState(false);
  const normalized = query.toLocaleLowerCase().trim();
  const rows = RESOURCE_SOURCES.filter((source) =>
    (!freeOnly || isFreeResourceSource(source))
    && (!keylessOnly || source.freeKeyless === true)
    && `${source.name} ${source.category} ${source.status} ${source.commercial} ${resourceSourceCostLabel(source)} ${source.note}`
      .toLocaleLowerCase()
      .includes(normalized),
  );
  return <ResourceLayout title={translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "데이터 출처·상업 이용 준비")} intro={translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "구현된 검색 어댑터, 신청 예정 API, 계약 검토 대상과 운영 제외 소스를 구분합니다. 연결 상태와 개별 자료 권리는 별도이며, 권리가 확인되지 않은 자료는 Studio 가져오기와 상업 활용을 차단합니다.")}>
    <section className="space-y-3 rounded-2xl border border-accent/30 bg-accent-soft p-6">
      <p className="text-xs font-semibold text-accent">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "무료 운영 · 공개 API 활용")}</p>
      <h2 className="text-xl font-bold">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "자료를 모으는 데서, 콘텐츠를 만드는 데까지")}</h2>
      <p className="text-sm leading-7 text-fg-2">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "시카고·클리블랜드 미술관 자료와 한국어 배경지식을 검색하고, 기존 저장 자료를 재료 보드로 연결하세요. 콘티·캐릭터·세계관·홍보 구성안·연습 과제·큐레이션 초안을 출처와 함께 만들 수 있습니다.")}</p>
      <p className="text-xs leading-6 text-fg-2">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "새 도구는 가입·API 키·유료 AI 없이 사용합니다. 호출 한도 초과 시 유료 전환하지 않습니다. 기존 호스팅·도메인·전송량 비용은 별도이며, 무료 공개 자료도 개별 이용조건을 확인해야 합니다.")}</p>
      <Link className={RESOURCE_BUTTON} to="/research/open-creation">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "무료 창작 재료실 열기")}</Link>
    </section>
    <section className="space-y-3 rounded-2xl border border-accent/30 bg-accent-soft p-6" aria-labelledby="material-atlas-entry"><h2 id="material-atlas-entry" className="text-xl font-bold">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "무료 소재를 장면 제작으로 연결하세요")}</h2><p className="text-sm leading-7 text-fg-2">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "Poly Haven·ambientCG의 확인된 소재 목록, 한글 검색, 8개 제작 가이드와 출처 내보내기. 추가 가입·API 키·유료 생성 없이 브라우저에서 사용합니다.")}</p><Link className={RESOURCE_BUTTON} to="/research/materials">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "무료 배경·소품 소재 도감 열기")}</Link></section>
    <section className="space-y-4 rounded-2xl border border-line bg-panel p-6">
      <h2 className="text-xl font-bold">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "서로 다른 데이터는 서로 다른 의미로 읽습니다")}</h2>
      <p className="leading-8 text-fg-2">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "도서관 대출, 작품 조회수, 검색 관심도, 매출, 산업 종사자 수는 서로 다른 지표입니다. 조사연도·발표일·단위·집계 범위가 다르면 합산하거나 하나의 인기 점수로 표시하지 않습니다.")}</p>
      <div className="flex flex-wrap gap-3">
        <Link className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "en", "{v0} bg-accent-soft"), { v0: String(RESOURCE_BUTTON) })} to="/research/open-creation">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "창작 재료실에서 제작 시작")}</Link>
        <Link className={RESOURCE_BUTTON} to="/research/packs">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "12개 장면 팩으로 연습하기")}</Link>
        <Link className={RESOURCE_BUTTON} to="/insights">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "기존 인사이트 보기")}</Link>
        <Link className={RESOURCE_BUTTON} to="/about/crawler">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "수집 정책 보기")}</Link>
        <Link className={RESOURCE_BUTTON} to="/copyright">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "저작권 안내")}</Link>
      </div>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label={translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "상업 이용 상태 설명")}>
      {Object.keys(COMMERCIAL_STYLE).map((label) => <div key={label} className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "en", "rounded-xl border p-3 text-center text-xs font-semibold {v0}"), { v0: String(COMMERCIAL_STYLE[label]) })}>{label}</div>)}
    </section>
    <label htmlFor="resource-source-filter" className="block font-semibold">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "제공처·분야·비용·상업 준비 상태 필터")}<input id="resource-source-filter" type="search" className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "en", "{v0} mt-2"), { v0: String(RESOURCE_INPUT) })} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "예: 무료, 글로벌 판본, 계약 후 이용, 3D")} /></label>
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={freeOnly} onChange={(event) => setFreeOnly(event.target.checked)} />{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "무료 제공처만 보기")}</label>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={keylessOnly} onChange={(event) => setKeylessOnly(event.target.checked)} />{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "가입·키 없는 제공처만 보기")}</label>
    </div>
    <p className="text-sm leading-7 text-fg-2">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "무료 표시는 API 이용료 기준입니다. 계정·키·승인, 호스팅·전송량, 개별 자료의 저작권·상업 이용 조건은 별도이며, 신청 예정·검토 제공처는 아직 연결된 상태가 아닙니다.")}</p>
    <p role="status" className="text-sm text-fg-2">{rows.length}{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "개 제공처")}</p>
    <div className="grid gap-4 md:grid-cols-2">{rows.map((source) => <article key={source.name} className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-accent">{source.category} · {source.status}</span>
        <span className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "en", "rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold {v0}"), { v0: String(sourceCostStyle(resourceSourceCostLabel(source))) })}>{resourceSourceCostLabel(source)}</span>
        <span className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "en", "rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold {v0}"), { v0: String(COMMERCIAL_STYLE[source.commercial]) })}>{source.commercial}</span>
      </div>
      <h2 className="text-lg font-bold">{source.name}</h2><p className="flex-1 text-sm leading-7 text-fg-2">{source.note}</p>
      <a className={RESOURCE_BUTTON} href={source.url} target="_blank" rel="noopener noreferrer">{translateCurrentStaticSourceText("domains.creator.resources.SourcesPage", "ko", "공식 안내 확인 ↗")}</a>
    </article>)}</div>
  </ResourceLayout>;
}
