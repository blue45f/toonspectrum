import { Link } from "react-router-dom";

import { RESOURCE_BUTTON } from "./navigation";
import { buildResearchCoverage } from "./research-dashboard";

import type { ResearchCoverageItem, ResearchWorkspaceSummary } from "./research-dashboard";

const STATUS_LABEL: Record<ResearchCoverageItem["status"], string> = {
  covered: "근거 확보",
  attention: "보완 필요",
  missing: "아직 없음",
};

function CoverageAction({ item }: { item: ResearchCoverageItem }) {
  if (item.href.startsWith("#")) return <a className={RESOURCE_BUTTON} href={item.href}>{item.action}</a>;
  return <Link className={RESOURCE_BUTTON} to={item.href}>{item.action}</Link>;
}

export function ResearchCoverageMap({ summary }: { summary: ResearchWorkspaceSummary }) {
  const coverage = buildResearchCoverage(summary);
  const covered = coverage.filter((item) => item.status === "covered").length;
  const attention = coverage.filter((item) => item.status === "attention").length;

  return <section className="space-y-5" aria-labelledby="research-coverage-title">
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-sm font-semibold text-accent">근거 공백 지도</p>
        <h2 id="research-coverage-title" className="mt-1 text-2xl font-bold">자료가 많은가보다 무엇이 비어 있는가</h2>
        <p className="mt-2 max-w-3xl leading-7 text-fg-2">저장한 자료와 직접 작성한 기획에서 확인되는 사실만 분류합니다. 자동 고증 점수나 권리 판정은 제공하지 않습니다.</p>
      </div>
      <p className="rounded-full border border-line bg-panel px-4 py-2 text-sm text-fg-2">근거 확보 {covered}/{coverage.length} · 보완 {attention}</p>
    </header>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {coverage.map((item) => <article key={item.id} className={`rounded-2xl border p-5 ${item.status === "attention" ? "border-accent bg-accent-soft" : item.status === "covered" ? "border-line bg-panel" : "border-line bg-canvas"}`}>
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-bold text-accent">{item.eyebrow}</p><h3 className="mt-2 text-lg font-bold">{item.label}</h3></div>
          <span className="shrink-0 rounded-full border border-line bg-panel px-2.5 py-1 text-xs font-semibold">{STATUS_LABEL[item.status]}</span>
        </div>
        <p className="mt-3 text-sm font-semibold">{item.evidence}</p>
        <p className="mt-2 min-h-12 text-sm leading-6 text-fg-2">{item.description}</p>
        <div className="mt-4"><CoverageAction item={item} /></div>
      </article>)}
    </div>
  </section>;
}
