import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { LearningReferenceLayout } from "./LearningReferenceLayout";
import {
  EDUCATION_DELIVERY_LABELS,
  EDUCATION_GOAL_LABELS,
  EDUCATION_INSTITUTIONS,
  EDUCATION_KIND_LABELS,
  EDUCATION_REGIONS,
  filterEducationInstitutions,
  type EducationDelivery,
  type EducationGoal,
  type EducationInstitution,
  type EducationKind,
} from "./learning-reference-data";

const inputClass = "min-h-11 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const secondaryLinkClass = "inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 py-2 text-sm font-bold text-fg hover:bg-raised";

function hasOwn(record: object, key: string | null): key is string {
  return key !== null && Object.prototype.hasOwnProperty.call(record, key);
}

function educationKind(value: string | null): EducationKind | "all" {
  return hasOwn(EDUCATION_KIND_LABELS, value) ? value as EducationKind : "all";
}

function educationDelivery(value: string | null): EducationDelivery | "all" {
  return hasOwn(EDUCATION_DELIVERY_LABELS, value) ? value as EducationDelivery : "all";
}

function educationGoal(value: string | null): EducationGoal | "all" {
  return hasOwn(EDUCATION_GOAL_LABELS, value) ? value as EducationGoal : "all";
}

function educationRegion(value: string | null): typeof EDUCATION_REGIONS[number] | "all" {
  return value && (EDUCATION_REGIONS as readonly string[]).includes(value)
    ? value as typeof EDUCATION_REGIONS[number]
    : "all";
}

function compactDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${year}.${Number(month)}.${Number(day)}.`;
}

function EducationCard({
  institution,
  selected,
  comparisonFull,
  onToggle,
}: {
  readonly institution: EducationInstitution;
  readonly selected: boolean;
  readonly comparisonFull: boolean;
  readonly onToggle: () => void;
}) {
  const headingId = `education-${institution.id}`;
  return (
    <article className={`flex h-full flex-col rounded-3xl border bg-panel p-6 ${selected ? "border-accent ring-1 ring-accent" : "border-line"}`} aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">{EDUCATION_KIND_LABELS[institution.kind]}</span>
        <span className="text-xs text-fg-2">확인 {compactDate(institution.verifiedAt)}</span>
      </div>
      <h3 id={headingId} className="mt-4 text-xl font-bold">{institution.name}</h3>
      <p className="mt-2 text-sm font-semibold text-fg-2">{institution.location} · {institution.delivery.map((item) => EDUCATION_DELIVERY_LABELS[item]).join("·")}</p>
      <p className="mt-4 leading-7 text-fg-2">{institution.summary}</p>

      <div className="mt-5">
        <h4 className="text-sm font-bold">주요 분야</h4>
        <div className="mt-2 flex flex-wrap gap-2">
          {institution.focus.map((focus) => <span key={focus} className="rounded-full border border-line bg-raised px-3 py-1 text-xs font-semibold">{focus}</span>)}
        </div>
      </div>

      <div className="mt-5">
        <h4 className="text-sm font-bold">찾는 목적</h4>
        <div className="mt-2 flex flex-wrap gap-2">
          {institution.goals.map((goal) => <span key={goal} className="rounded-full border border-line px-3 py-1 text-xs text-fg-2">{EDUCATION_GOAL_LABELS[goal]}</span>)}
        </div>
      </div>

      <p className="mt-5 rounded-2xl bg-canvas p-4 text-sm leading-6 text-fg-2"><strong className="text-fg">비용:</strong> {institution.costLabel}</p>

      <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
        <a
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-bold text-on-accent hover:bg-accent-2"
          href={institution.officialUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`${institution.name} 공식 홈페이지 새 창에서 열기`}
        >
          공식 정보 확인 ↗
        </a>
        <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold ${comparisonFull && !selected ? "cursor-not-allowed opacity-50" : "hover:bg-raised"}`}>
          <input
            type="checkbox"
            checked={selected}
            disabled={comparisonFull && !selected}
            aria-label={`${institution.name} 비교 ${selected ? "제외" : "추가"}`}
            onChange={onToggle}
          />
          비교
        </label>
      </div>
      <p className="mt-3 text-xs leading-5 text-fg-2">출처: {institution.sourceLabel}</p>
    </article>
  );
}

function ComparisonTable({ institutions, onClear }: { readonly institutions: readonly EducationInstitution[]; readonly onClear: () => void }) {
  return (
    <section className="rounded-3xl border border-accent bg-panel p-5 sm:p-7" aria-labelledby="education-compare-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[.14em] text-accent">COMPARE</p>
          <h2 id="education-compare-title" className="mt-2 text-2xl font-bold">선택한 교육기관 비교</h2>
        </div>
        <button className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-bold hover:bg-raised" type="button" onClick={onClear}>비교 비우기</button>
      </div>
      {institutions.length < 2 ? (
        <p className="mt-5 rounded-2xl bg-accent-soft p-4 text-sm leading-7 text-fg-2">한 곳을 더 선택하면 유형·방식·목적·비용 안내를 나란히 비교할 수 있습니다.</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-left text-sm">
            <caption className="sr-only">선택한 웹툰 교육기관 비교표</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-line bg-canvas p-3 font-bold">비교 항목</th>
                {institutions.map((institution) => <th key={institution.id} scope="col" className="border-b border-line bg-canvas p-3 text-base font-bold">{institution.name}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row" className="border-b border-line p-3 font-semibold">유형</th>{institutions.map((item) => <td key={item.id} className="border-b border-line p-3">{EDUCATION_KIND_LABELS[item.kind]}</td>)}</tr>
              <tr><th scope="row" className="border-b border-line p-3 font-semibold">지역</th>{institutions.map((item) => <td key={item.id} className="border-b border-line p-3">{item.location}</td>)}</tr>
              <tr><th scope="row" className="border-b border-line p-3 font-semibold">수업 방식</th>{institutions.map((item) => <td key={item.id} className="border-b border-line p-3">{item.delivery.map((value) => EDUCATION_DELIVERY_LABELS[value]).join(" · ")}</td>)}</tr>
              <tr><th scope="row" className="border-b border-line p-3 font-semibold">교육 목적</th>{institutions.map((item) => <td key={item.id} className="border-b border-line p-3">{item.goals.map((value) => EDUCATION_GOAL_LABELS[value]).join(" · ")}</td>)}</tr>
              <tr><th scope="row" className="border-b border-line p-3 font-semibold">주요 분야</th>{institutions.map((item) => <td key={item.id} className="border-b border-line p-3">{item.focus.join(" · ")}</td>)}</tr>
              <tr><th scope="row" className="p-3 font-semibold">비용 안내</th>{institutions.map((item) => <td key={item.id} className="p-3">{item.costLabel}</td>)}</tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function EducationDirectoryPage() {
  const [params, setParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);

  useEffect(() => { document.title = "웹툰 교육기관 찾기 · 툰스튜디오"; }, []);

  const query = (params.get("q") ?? "").slice(0, 120);
  const kind = educationKind(params.get("kind"));
  const region = educationRegion(params.get("region"));
  const delivery = educationDelivery(params.get("delivery"));
  const goal = educationGoal(params.get("goal"));
  const institutions = filterEducationInstitutions({ query, kind, region, delivery, goal });
  const institutionMap = new Map<string, EducationInstitution>(
    EDUCATION_INSTITUTIONS.map((institution) => [institution.id, institution] as const),
  );
  const selectedInstitutions = selectedIds
    .map((id) => institutionMap.get(id))
    .filter((institution): institution is EducationInstitution => Boolean(institution));
  const comparisonFull = selectedIds.length >= 3;

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: key === "q" });
  }

  function toggleComparison(id: string) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : current.length < 3 ? [...current, id] : current);
  }

  return (
    <LearningReferenceLayout
      eyebrow="WEBTOON EDUCATION DIRECTORY"
      title="목표와 지역에 맞는 웹툰 교육 찾기"
      intro="대학·전문대학, 사설 학원, 공공·온라인 교육을 같은 기준으로 찾아보고 최대 3곳까지 비교할 수 있습니다. 순위나 추천 광고가 아닌 공식 정보 확인을 위한 출발점입니다."
      actions={(
        <>
          <a className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-bold text-on-accent hover:bg-accent-2" href="#education-search">조건으로 찾기</a>
          <Link className={secondaryLinkClass} to="/learn/careers">직무부터 알아보기</Link>
          <Link className={secondaryLinkClass} to="/learn/process">제작 과정 보기</Link>
        </>
      )}
    >
      <aside className="rounded-3xl border border-line bg-accent-soft p-6 sm:p-7" aria-labelledby="education-policy-title">
        <p className="text-xs font-bold tracking-[.14em] text-accent">INFORMATION POLICY</p>
        <h2 id="education-policy-title" className="mt-2 text-xl font-bold">기관의 우열을 평가하지 않고, 공식 페이지로 확인할 사실만 정리합니다.</h2>
        <p className="mt-3 leading-7 text-fg-2">
          학과명·모집 전형·수강료·운영 과정은 바뀔 수 있습니다. 이 페이지는 자동 크롤링이나 사용자 별점을 사용하지 않으며, 등록일 이후의 최신 일정과 비용은 반드시 각 기관의 공식 홈페이지에서 다시 확인해야 합니다.
        </p>
      </aside>

      <section id="education-search" className="scroll-mt-24 rounded-3xl border border-line bg-panel p-6 sm:p-8" aria-labelledby="education-search-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[.14em] text-accent">FIND A PROGRAM</p>
            <h2 id="education-search-title" className="mt-2 text-2xl font-bold">교육기관 검색·필터</h2>
          </div>
          <button className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-bold hover:bg-raised" type="button" onClick={() => setParams({})}>검색 조건 초기화</button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="xl:col-span-2">기관·과정 검색
            <input className={`${inputClass} mt-2`} type="search" maxLength={120} value={query} placeholder="기관명, 콘티, 입시, 채색…" onChange={(event) => setFilter("q", event.currentTarget.value.slice(0, 120))} />
          </label>
          <label>기관 유형
            <select className={`${inputClass} mt-2`} value={kind} onChange={(event) => setFilter("kind", event.currentTarget.value)}>
              <option value="all">전체 유형</option>
              {Object.entries(EDUCATION_KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>지역
            <select className={`${inputClass} mt-2`} value={region} onChange={(event) => setFilter("region", event.currentTarget.value)}>
              <option value="all">전체 지역</option>
              {EDUCATION_REGIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label>수업 방식
            <select className={`${inputClass} mt-2`} value={delivery} onChange={(event) => setFilter("delivery", event.currentTarget.value)}>
              <option value="all">전체 방식</option>
              {Object.entries(EDUCATION_DELIVERY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="xl:col-start-4">교육 목적
            <select className={`${inputClass} mt-2`} value={goal} onChange={(event) => setFilter("goal", event.currentTarget.value)}>
              <option value="all">전체 목적</option>
              {Object.entries(EDUCATION_GOAL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-5 text-sm text-fg-2" role="status" aria-live="polite">
          등록된 {EDUCATION_INSTITUTIONS.length}곳 중 <strong className="text-fg">{institutions.length}곳</strong> 표시 · 비교 선택 {selectedIds.length}/3
        </p>
      </section>

      {selectedIds.length > 0 && <ComparisonTable institutions={selectedInstitutions} onClear={() => setSelectedIds([])} />}

      <section aria-labelledby="education-results-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[.14em] text-accent">DIRECTORY</p>
            <h2 id="education-results-title" className="mt-2 text-3xl font-bold">교육기관 정보</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-fg-2">현재 목록은 전체 기관을 포괄하지 않는 초기 선별 목록입니다. 공식 출처 확인일은 2026년 9월 16일이며 상세 전형·일정·비용은 공식 홈페이지가 최종 기준입니다.</p>
        </div>

        {institutions.length ? (
          <div className="mt-7 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {institutions.map((institution) => (
              <EducationCard
                key={institution.id}
                institution={institution}
                selected={selectedIds.includes(institution.id)}
                comparisonFull={comparisonFull}
                onToggle={() => toggleComparison(institution.id)}
              />
            ))}
          </div>
        ) : (
          <div className="mt-7 rounded-3xl border border-dashed border-line bg-panel p-8 text-center">
            <h3 className="text-xl font-bold">일치하는 기관이 없습니다.</h3>
            <p className="mt-3 text-fg-2">검색어를 줄이거나 지역·목적 필터를 초기화해 보세요.</p>
            <button className="mt-5 min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-bold hover:bg-raised" type="button" onClick={() => setParams({})}>전체 기관 보기</button>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-line bg-panel p-6 sm:p-8" aria-labelledby="education-check-title">
        <p className="text-xs font-bold tracking-[.14em] text-accent">BEFORE ENROLLMENT</p>
        <h2 id="education-check-title" className="mt-2 text-2xl font-bold">등록 전에 직접 확인할 다섯 가지</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[
            ["목표", "입시·데뷔·취미·취업 중 커리큘럼의 최종 결과가 내 목적과 같은가"],
            ["결과물", "수료할 때 완성할 포트폴리오·단편·기획서가 구체적인가"],
            ["피드백", "강사 피드백의 빈도와 1인당 수강 인원은 어떻게 되는가"],
            ["비용", "재료·장비·추가 특강을 포함한 전체 비용과 환불 기준은 무엇인가"],
            ["일정", "통학·온라인 환경과 과제량을 포함해 끝까지 지속할 수 있는가"],
          ].map(([title, description]) => (
            <article key={title} className="rounded-2xl border border-line bg-canvas p-5">
              <h3 className="font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-fg-2">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </LearningReferenceLayout>
  );
}
