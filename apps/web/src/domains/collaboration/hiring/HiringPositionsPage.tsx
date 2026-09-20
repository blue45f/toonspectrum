import { useEffect, useState } from "react";

import { CREATOR_HIRING_MODELS, CREATOR_HIRING_ROLES, HIRING_FORMATS, HIRING_TOOLS } from "../../../../../../packages/contracts/src/creator-hiring";
import { CollabField, CollabNotice, collabButton, collabInput } from "../collaboration-ui";
import { compensationLabels, optionsOf } from "./hiring-form-values";
import { HiringTermsView } from "./HiringSlotEditor";

import type { HiringPositionPage } from "../../../../../../packages/contracts/src/creator-hiring";

import Link from "@/compat/router-link";
import { api, getApiErrorMessage } from "@/infrastructure/api";

export function HiringPublicPositions({ postId }: { postId?: string }) {
  const [filters, setFilters] = useState<Record<string, string>>({}), [after, setAfter] = useState<string | null>(null);
  const [page, setPage] = useState<HiringPositionPage | null>(null), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setPage(null); setError("");
    void api.get<HiringPositionPage>("/collaborations/hiring/positions", { signal: controller.signal, params: { ...filters, ...(postId ? { postId } : {}), ...(after ? { after } : {}) } })
      .then((result) => { if (!controller.signal.aborted) setPage(result); })
      .catch(async (e) => { const message = await getApiErrorMessage(e, "모집 조건을 불러오지 못했어요."); if (!controller.signal.aborted) setError(message); });
    return () => controller.abort();
  }, [filters, after, postId]);
  const choices = [
    ["role", "역할", CREATOR_HIRING_ROLES], ["model", "협업 형태", CREATOR_HIRING_MODELS],
    ["compensation", "보수 방식", compensationLabels], ["tool", "도구", optionsOf(HIRING_TOOLS)], ["format", "납품 형식", optionsOf(HIRING_FORMATS)],
  ] as const;
  return <section className="space-y-5" aria-label="공개 모집 조건">
    {!postId && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{choices.map(([key, label, options]) => <CollabField key={key} label={label}><select className={collabInput} value={filters[key] ?? ""} onChange={(e) => { const next = { ...filters }; if (e.target.value) next[key] = e.target.value; else delete next[key]; setAfter(null); setFilters(next); }}><option value="">전체</option>{Object.entries(options).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></CollabField>)}</div>}
    {error && <CollabNotice error>{error}</CollabNotice>}{!page && !error && <p role="status">공개된 모집 조건을 확인하고 있어요.</p>}
    {page?.items.length === 0 && <p>이 조건에 맞는 공개 모집 자리가 없어요.</p>}
    {page?.items.map((position) => <article key={position.id} className="space-y-3 rounded-xl border border-line bg-panel p-5"><h2 className="text-lg font-bold">{position.postTitle}</h2><p className="text-sm">1명 모집 · 조건 버전 {position.revision}</p><HiringTermsView terms={position.terms} /><Link className={collabButton} href={`/collaborate/${position.postId}`}>원래 공고에서 확인·지원</Link></article>)}
    {!postId && <div className="flex gap-3">{after && <button className={collabButton} onClick={() => setAfter(null)}>처음으로</button>}{page?.next && <button className={collabButton} onClick={() => setAfter(page.next)}>다음 30개</button>}</div>}
  </section>;
}
export function HiringPositionsPage() {
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8"><Link href="/collaborate" className="text-accent underline">협업 게시판</Link><h1 className="text-3xl font-bold">모집 조건으로 찾기</h1><p className="text-fg-3">공고의 각 모집 자리를 역할·도구·보수로 찾아보세요. 공개 중인 자리만 표시하며 기존 공고에서 지원합니다.</p><HiringPublicPositions /></main>;
}
