import { apiFetch } from "@/platform/api";
import { CheckCircle2, Copy, ListChecks, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  decodePublicCollectionSnapshot,
  type PublicCollectionSnapshot,
} from "./public-list-share";

import type { Title } from "@/shared/lib/types";

import Link from "@/shared/navigation/router-link";
import { Container } from "@/shared/components/section";
import { TitleCard } from "@/shared/components/title-card";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { CollectionIcon } from "@/shared/components/visual-marks";
import { useDocumentTitle, useMetaRobots } from "@/shared/seo/use-document-title";
import { NOINDEX_PRIVATE_ROBOTS } from "@/shared/lib/seo-route-policy";
import { useApp } from "@/shared/lib/store";

const TITLE_CHUNK_SIZE = 70;

async function fetchSharedTitles(ids: readonly string[], signal: AbortSignal): Promise<Title[]> {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += TITLE_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + TITLE_CHUNK_SIZE));
  }
  const responses = await Promise.all(chunks.map(async (chunk) => {
    const response = await apiFetch(`/api/titles?ids=${encodeURIComponent(chunk.join(","))}`, { signal, cache: "no-store" });
    if (!response.ok) throw new Error(`shared titles unavailable: ${response.status}`);
    const payload = await response.json() as { items?: Title[] };
    return Array.isArray(payload.items) ? payload.items : [];
  }));
  const byId = new Map(responses.flat().map((title) => [title.id, title]));
  return ids.flatMap((id) => {
    const title = byId.get(id);
    return title ? [title] : [];
  });
}

export function PublicCollectionPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("snapshot") ?? "";
  const snapshot = useMemo<PublicCollectionSnapshot | null>(() => {
    try {
      return decodePublicCollectionSnapshot(token);
    } catch {
      return null;
    }
  }, [token]);
  useDocumentTitle(snapshot?.name ?? "공개 컬렉션");
  useMetaRobots(NOINDEX_PRIVATE_ROBOTS);
  const [titles, setTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(Boolean(snapshot));
  const [loadError, setLoadError] = useState(false);
  const [cloned, setCloned] = useState(false);
  const createCollection = useApp((state) => state.createCollection);
  const toggleInCollection = useApp((state) => state.toggleInCollection);

  useEffect(() => {
    if (!snapshot) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    setTitles([]);
    void fetchSharedTitles(snapshot.titleIds, controller.signal)
      .then(setTitles)
      .catch((cause: unknown) => {
        if ((cause as Error)?.name !== "AbortError") setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [snapshot]);

  const clone = () => {
    if (!snapshot || cloned) return;
    const id = createCollection(`${snapshot.name} 복사본`, snapshot.emoji);
    if (!id) return;
    for (const titleId of snapshot.titleIds) toggleInCollection(id, titleId);
    setCloned(true);
  };

  if (!snapshot) {
    return (
      <Container size="prose" className="py-14">
        <div role="alert" className="rounded-3xl border border-bad/35 bg-card p-8 text-center">
          <TriangleAlert className="mx-auto size-11 text-bad" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-black text-fg">공개 리스트를 열 수 없습니다</h1>
          <p className="mt-2 text-sm leading-6 text-fg-2">링크가 손상되었거나 지원하지 않는 형식입니다.</p>
          <Link href="/library?tab=collections" className={buttonClass({ className: "mt-6" })}>내 컬렉션 보기</Link>
        </div>
      </Container>
    );
  }

  return (
    <Container size="wide" className="py-8 sm:py-12">
      <header className="rounded-3xl border border-line bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-4">
            <CollectionIcon value={snapshot.emoji} size="lg" />
            <div className="min-w-0">
              <p className="eyebrow text-accent">PUBLIC COLLECTION SNAPSHOT</p>
              <h1 className="mt-2 break-words text-3xl font-black tracking-tight text-fg">{snapshot.name}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-2">{snapshot.description}</p>
              <p className="mt-3 text-xs text-fg-3">
                {snapshot.titleIds.length}편 · 공유 시점의 작품 구성이 링크에 고정된 스냅샷입니다. 원본 컬렉션의 이후 변경은 자동 반영되지 않습니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={clone}
            disabled={cloned}
            className={buttonClass({ className: "gap-2" })}
          >
            {cloned ? <CheckCircle2 size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {cloned ? "내 서재에 복제됨" : "내 컬렉션으로 복제"}
          </button>
        </div>
      </header>

      {loadError ? (
        <div role="alert" className="mt-6 rounded-2xl border border-warn/35 bg-warn/10 p-4 text-sm text-fg-2">일부 작품 정보를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</div>
      ) : null}

      {loading ? (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: Math.min(snapshot.titleIds.length, 10) }, (_, index) => <div key={index} className="skeleton aspect-[3/4] rounded-2xl" />)}
        </div>
      ) : titles.length > 0 ? (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {titles.map((title) => <TitleCard key={title.id} title={title} size="sm" />)}
        </div>
      ) : (
        <div className="mt-8 rounded-3xl border border-dashed border-line bg-card/50 p-12 text-center">
          <ListChecks className="mx-auto size-10 text-fg-3" aria-hidden="true" />
          <h2 className="mt-4 font-black text-fg">현재 카탈로그에서 확인할 수 있는 작품이 없습니다</h2>
          <p className="mt-2 text-sm text-fg-3">작품 식별자는 복제되며, 다시 카탈로그에 들어오면 내 컬렉션에서 확인할 수 있습니다.</p>
        </div>
      )}
    </Container>
  );
}
