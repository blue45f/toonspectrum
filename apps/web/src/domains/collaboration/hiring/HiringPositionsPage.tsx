import { useEffect, useState } from "react";

import { CREATOR_HIRING_MODELS, CREATOR_HIRING_ROLES, HIRING_FORMATS, HIRING_TOOLS } from "../../../../../../packages/contracts/src/creator-hiring";
import { CollabField, CollabNotice, collabButton, collabInput } from "../collaboration-ui";
import { compensationLabels, optionsOf } from "./hiring-form-values";
import { HiringTermsView } from "./HiringSlotEditor";
import { parseHiringPositionPage } from "./hiring-position-response";

import type { HiringPositionPage } from "../../../../../../packages/contracts/src/creator-hiring";

import Link from "@/compat/router-link";
import { api, getApiErrorMessage } from "@/infrastructure/api";

export function HiringPublicPositions({ postId }: { postId?: string }) {
  // A parent change must not reuse the previous post's cursors or results.
  return <PublicPositionsContent key={postId ?? "all-posts"} postId={postId} />;
}

function PublicPositionsContent({ postId }: { postId?: string }) {
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
      const message = await getApiErrorMessage(cause, "모집 조건을 불러오지 못했어요.");
      if (!controller.signal.aborted) setResult({ key: requestKey, page: null, error: message });
    });
    return () => controller.abort();
  }, [filters, after, postId, requestKey]);
  const choices = [
    ["role", "역할", CREATOR_HIRING_ROLES], ["model", "협업 형태", CREATOR_HIRING_MODELS],
    ["compensation", "보수 방식", compensationLabels], ["tool", "도구", optionsOf(HIRING_TOOLS)], ["format", "납품 형식", optionsOf(HIRING_FORMATS)],
  ] as const;
  function resetFilters() { setFilters({}); setCursors([null]); }
  const next = page?.next;
  const hasNext = Boolean(next && !cursors.includes(next));
  return <section className="space-y-5" aria-label="공개 모집 조건" aria-busy={loading}>
    {!postId && <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{choices.map(([key, label, options]) => <CollabField key={key} label={label}><select className={collabInput} value={filters[key] ?? ""} onChange={(event) => {
      const updated = { ...filters };
      if (event.target.value) updated[key] = event.target.value; else delete updated[key];
      setCursors([null]); setFilters(updated);
    }}><option value="">전체</option>{Object.entries(options).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></CollabField>)}</div>
      <button type="button" className={collabButton} disabled={!hasFilters} onClick={resetFilters}>검색 조건 초기화</button></div>}
    {error && <CollabNotice error>{error}<button type="button" className={`${collabButton} ml-3`} onClick={() => setRetry((value) => value + 1)}>다시 불러오기</button></CollabNotice>}
    {loading && <p role="status">공개된 모집 조건을 확인하고 있어요.</p>}
    {page && <p role="status" className="text-sm text-fg-3">{cursors.length}페이지 · 이 페이지 {page.items.length}개 · 한 번에 최대 30개</p>}
    {page?.items.length === 0 && <p>이 조건에 맞는 공개 모집 자리가 없어요.</p>}
    {page?.items.map((position) => <article key={position.id} className="space-y-3 rounded-xl border border-line bg-panel p-5"><h2 className="text-lg font-bold">{position.postTitle}</h2><p className="text-sm">1명 모집 · 조건 버전 {position.revision}</p><HiringTermsView terms={position.terms} /><Link className={collabButton} href={`/collaborate/${position.postId}`}>원래 공고에서 확인·지원</Link></article>)}
    {(cursors.length > 1 || hasNext) && <nav className="flex flex-wrap gap-3" aria-label="모집 조건 페이지 이동">
      <button type="button" className={collabButton} disabled={loading || cursors.length === 1} onClick={() => setCursors((values) => values.slice(0, -1))}>이전 페이지</button>
      {cursors.length > 1 && <button type="button" className={collabButton} disabled={loading} onClick={() => setCursors([null])}>처음으로</button>}
      <button type="button" className={collabButton} disabled={loading || !hasNext} onClick={() => { if (next && hasNext) setCursors((values) => [...values, next]); }}>다음 페이지</button>
    </nav>}
  </section>;
}

export function HiringPositionsPage() {
  return <div className="mx-auto max-w-5xl space-y-6 px-4 py-8"><Link href="/collaborate" className="text-accent underline">협업 게시판</Link><h1 className="text-3xl font-bold">모집 조건으로 찾기</h1><p className="text-fg-3">공고의 각 모집 자리를 역할·도구·보수로 찾아보세요. 공개 중인 자리만 표시하며 기존 공고에서 지원합니다.</p><HiringPublicPositions /></div>;
}
