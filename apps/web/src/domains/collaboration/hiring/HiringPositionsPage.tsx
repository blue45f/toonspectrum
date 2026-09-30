import { BriefcaseBusiness } from "lucide-react";
import { useEffect, useState } from "react";

import { CREATOR_HIRING_MODELS, CREATOR_HIRING_ROLES, HIRING_FORMATS, HIRING_TOOLS } from "../../../../../../packages/contracts/src/creator-hiring";
import { CollabField, CollabNotice, collabButton, collabInput } from "../collaboration-ui";
import { compensationLabels, optionsOf } from "./hiring-form-values";
import { HiringTermsView } from "./HiringSlotEditor";
import { parseHiringPositionPage } from "./hiring-position-response";

import type { HiringPositionPage } from "../../../../../../packages/contracts/src/creator-hiring";

import Link from "@/shared/navigation/router-link";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { api, getApiErrorMessage } from "@/platform/api";

const SCOPE = "domains.collaboration.hiring.HiringPositionsPage";

const EN_CHOICE_LABELS: Record<string, string> = {
  "역할": "Role",
  "협업 형태": "Collaboration model",
  "보수 방식": "Compensation",
  "도구": "Tools",
  "납품 형식": "Delivery format",
};

const EN_OPTION_LABELS: Record<string, string> = {
  "글·각색": "Story · adaptation",
  "콘티": "Storyboards",
  "선화": "Line art",
  "밑색": "Flats",
  "채색·명암": "Coloring · shading",
  "배경": "Backgrounds",
  "3D 배치": "3D layout",
  "효과·보정": "Effects · cleanup",
  "식자": "Lettering",
  "검수": "Review",
  "번역·현지화": "Translation · localization",
  "제작 관리": "Production management",
  "어시스트": "Assistant",
  "고용": "Employment",
  "유급 작업 의뢰": "Paid task commission",
  "공동 창작": "Co-creation",
  "단기·부분 협업": "Short-term · partial collaboration",
  "유급": "Paid",
  "무급": "Unpaid",
  "수익 분배": "Revenue share",
  "기타": "Other",
};

export function HiringPublicPositions({ postId }: { postId?: string }) {
  // A parent change must not reuse the previous post's cursors or results.
  return <PublicPositionsContent key={postId ?? "all-posts"} postId={postId} />;
}

function PublicPositionsContent({ postId }: { postId?: string }) {
  const bt = useBilingual(SCOPE);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; page: HiringPositionPage | null; error: string } | null>(null);
  const after = cursors[cursors.length - 1];
  const requestKey = JSON.stringify([postId, filters, after, retry]);
  const current = result?.key === requestKey ? result : null;
  const page = current?.page ?? null;
  const error = current?.error ?? "";
  const loading = !current;
  const hasFilters = Object.keys(filters).length > 0;
  useEffect(() => {
    const controller = new AbortController();
    void api.get<unknown>("/collaborations/hiring/positions", {
      signal: controller.signal,
      timeout: 10000,
      retry: 0,
      params: { ...filters, ...(postId ? { postId } : {}), ...(after ? { after } : {}) },
    }).then((data) => {
      if (!controller.signal.aborted) setResult({ key: requestKey, page: parseHiringPositionPage(data), error: "" });
    }).catch(async (cause: unknown) => {
      const message = await getApiErrorMessage(cause, bt("모집 조건을 불러오지 못했어요.", "Couldn't load position listings."));
      if (!controller.signal.aborted) setResult({ key: requestKey, page: null, error: message });
    });
    return () => controller.abort();
  }, [filters, after, postId, requestKey, bt]);
  const choices = [
    ["role", "역할", CREATOR_HIRING_ROLES], ["model", "협업 형태", CREATOR_HIRING_MODELS],
    ["compensation", "보수 방식", compensationLabels], ["tool", "도구", optionsOf(HIRING_TOOLS)], ["format", "납품 형식", optionsOf(HIRING_FORMATS)],
  ] as const;
  const optionLabel = (ko: string) => bt(ko, EN_OPTION_LABELS[ko] ?? ko);
  function resetFilters() { setFilters({}); setCursors([null]); }
  const next = page?.next;
  const hasNext = Boolean(next && !cursors.includes(next));
  return <section className="space-y-5" aria-label={bt("공개 모집 조건", "Open positions")} aria-busy={loading}>
    {!postId && <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{choices.map(([key, label, options]) => <CollabField key={key} label={bt(label, EN_CHOICE_LABELS[label] ?? label)}><select className={collabInput} value={filters[key] ?? ""} onChange={(event) => {
      const updated = { ...filters };
      if (event.target.value) updated[key] = event.target.value; else delete updated[key];
      setCursors([null]); setFilters(updated);
    }}><option value="">{bt("전체", "All")}</option>{Object.entries(options).map(([value, name]) => <option key={value} value={value}>{optionLabel(String(name))}</option>)}</select></CollabField>)}</div>
      <button type="button" className={collabButton} disabled={!hasFilters} onClick={resetFilters}>{bt("검색 조건 초기화", "Reset filters")}</button></div>}
    {error && <CollabNotice error>{error}<button type="button" className={`${collabButton} ml-3`} onClick={() => setRetry((value) => value + 1)}>{bt("다시 불러오기", "Reload")}</button></CollabNotice>}
    {loading && <div role="status" aria-label={bt("모집 조건을 불러오는 중", "Loading positions")} className="grid gap-4 md:grid-cols-2" aria-hidden="true"><div className="skeleton h-44 rounded-xl" /><div className="skeleton h-44 rounded-xl" /></div>}
    {page && <p role="status" className="text-sm text-fg-3">{bt(`${cursors.length}페이지 · 이 페이지 ${page.items.length}개 · 한 번에 최대 30개`, `Page ${cursors.length} · ${page.items.length} items on this page · up to 30 per page`)}</p>}
    {page?.items.length === 0 && (
      <ActionableEmptyState
        icon={BriefcaseBusiness}
        art="search"
        title={bt("이 조건에 맞는 공개 모집 자리가 없어요.", "No open positions match these filters.")}
        description={bt("조건을 완화하거나 직접 공고를 올려 필요한 작업자를 찾아보세요.", "Try loosening the filters, or post your own gig to find the collaborator you need.")}
        primary={{ href: "/collaborate/new", label: bt("공고 등록하기", "Post a gig") }}
        secondary={{ href: "/collaborate/positions", label: bt("필터 초기화", "Reset filters") }}
      />
    )}
    {page?.items.map((position) => <article key={position.id} className="space-y-3 rounded-xl border border-line bg-panel p-5"><h2 className="text-lg font-bold">{position.postTitle}</h2><p className="text-sm">{bt(`1명 모집 · 조건 버전 ${position.revision}`, `Hiring 1 · terms v${position.revision}`)}</p><HiringTermsView terms={position.terms} /><Link className={collabButton} href={`/collaborate/${position.postId}`}>{bt("원래 공고에서 확인·지원", "View & apply on the original post")}</Link></article>)}
    {(cursors.length > 1 || hasNext) && <nav className="flex flex-wrap gap-3" aria-label={bt("모집 조건 페이지 이동", "Position pages")}>
      <button type="button" className={collabButton} disabled={loading || cursors.length === 1} onClick={() => setCursors((values) => values.slice(0, -1))}>{bt("이전 페이지", "Previous")}</button>
      {cursors.length > 1 && <button type="button" className={collabButton} disabled={loading} onClick={() => setCursors([null])}>{bt("처음으로", "First")}</button>}
      <button type="button" className={collabButton} disabled={loading || !hasNext} onClick={() => { if (next && hasNext) setCursors((values) => [...values, next]); }}>{bt("다음 페이지", "Next")}</button>
    </nav>}
  </section>;
}

export function HiringPositionsPage() {
  const bt = useBilingual(SCOPE);
  return <div className="mx-auto max-w-5xl space-y-6 px-4 py-8"><Link href="/collaborate" className="text-accent underline">{bt("협업 게시판", "Collaboration board")}</Link><h1 className="text-3xl font-bold">{bt("모집 조건으로 찾기", "Find by hiring terms")}</h1><p className="text-fg-3">{bt("공고의 각 모집 자리를 역할·도구·보수로 찾아보세요. 공개 중인 자리만 표시하며 기존 공고에서 지원합니다.", "Search open seats by role, tools, and compensation. Only public seats are shown; apply from the original post.")}</p><HiringPublicPositions /></div>;
}
