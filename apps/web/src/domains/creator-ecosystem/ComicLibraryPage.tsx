import { BookMarked, LibraryBig, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CreatorEcosystemLayout } from "./CreatorEcosystemLayout";

import { api, getApiErrorMessage } from "@/infrastructure/api";
import { RESOURCE_LABELS } from "@/shared/lib/creator-resources";
import { useApp } from "@/shared/lib/store";

import type { CreatorResource, ResourceSearchResult } from "@/shared/lib/creator-resources";
import type {
  CollectionEditionType,
  CollectionOwnershipStatus,
  CollectionReadStatus,
} from "@/shared/lib/types";

type BookProvider = "kakao" | "openlibrary" | "googlebooks" | "openbd";

interface CollectionItem {
  id: string;
  isbn13: string;
  title: string;
  creator: string;
  publisher: string;
  volumeLabel: string;
  coverUrl: string;
  ownershipStatus: CollectionOwnershipStatus;
  readStatus: CollectionReadStatus;
  editionType: CollectionEditionType;
  lentTo: string;
  notes: string;
  sourceProvider: string;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
}

interface HoldingItem {
  libraryCode: string;
  name: string;
  address: string;
  telephone: string;
  homepage: string;
  latitude: string;
  longitude: string;
}

interface HoldingsResult {
  status: "ready" | "not_configured" | "unavailable";
  items: HoldingItem[];
  sourceUrl: string;
  message: string;
  fetchedAt?: string;
}

const INPUT = "min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-fg";
const BUTTON = "inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm font-bold hover:bg-raised disabled:opacity-50";

const OWNERSHIP_LABEL: Record<CollectionOwnershipStatus, string> = {
  owned: "소장",
  wanted: "구매 예정",
  borrowed: "빌림",
  lent: "빌려줌",
  sold: "판매",
  lost: "분실",
};

const READ_LABEL: Record<CollectionReadStatus, string> = {
  unread: "미독",
  reading: "읽는 중",
  read: "읽음",
};

const EDITION_LABEL: Record<CollectionEditionType, string> = {
  standard: "일반판",
  limited: "한정판",
  first: "초판",
  signed: "사인본",
  digital: "전자책",
};

function isbn13Of(value: string | undefined): string {
  if (!value) return "";
  const match = value.replace(/-/gu, " ").match(/(?:^|\s)(\d{13})(?:\s|$)/u);
  if (match) return match[1];
  const compact = value.replace(/\D/gu, "");
  return compact.length === 13 ? compact : "";
}

export function ComicLibraryPage() {
  const userId = useApp((state) => state.userId);
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<BookProvider>("kakao");
  const [searchResult, setSearchResult] = useState<ResourceSearchResult | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [region, setRegion] = useState("");
  const [holdings, setHoldings] = useState<HoldingsResult | null>(null);
  const [holdingsTitle, setHoldingsTitle] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadCollection = useCallback(async () => {
    if (!userId) return;
    try {
      const result = await api.get<{ items: CollectionItem[] }>("/creator-ecosystem/library/me");
      setItems(result.items);
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "내 서재를 불러오지 못했어요."));
    }
  }, [userId]);

  useEffect(() => {
    void loadCollection();
  }, [loadCollection]);

  async function searchBooks() {
    const q = query.trim();
    if (q.length < 2) {
      setError("검색어를 2자 이상 입력해 주세요.");
      return;
    }
    setBusy("search");
    setError("");
    setSearchResult(null);
    try {
      const result = await api.get<ResourceSearchResult>("/creator-resources/search", {
        params: { provider, q, page: 1 },
      });
      setSearchResult(result);
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "도서를 검색하지 못했어요."));
    } finally {
      setBusy("");
    }
  }

  async function addFromResource(resource: CreatorResource) {
    if (!userId) {
      setError("내 서재에 저장하려면 로그인해 주세요.");
      return;
    }
    setBusy(resource.id);
    setError("");
    try {
      await api.post("/creator-ecosystem/library/me/items", {
        isbn13: isbn13Of(resource.isbn),
        title: resource.title,
        creator: resource.creator,
        publisher: resource.credit,
        volumeLabel: "",
        coverUrl: resource.imageUrl ?? "",
        ownershipStatus: "owned",
        readStatus: "unread",
        editionType: "standard",
        lentTo: "",
        notes: "",
        sourceProvider: resource.provider,
        sourceUrl: resource.sourceUrl,
      });
      setNotice(`「${resource.title}」을 내 서재에 저장했습니다.`);
      await loadCollection();
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "내 서재에 저장하지 못했어요."));
    } finally {
      setBusy("");
    }
  }

  function updateLocal(id: string, patch: Partial<CollectionItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function saveItem(item: CollectionItem) {
    setBusy(item.id);
    setError("");
    try {
      const result = await api.patch<{ item: CollectionItem }>(
        `/creator-ecosystem/library/me/items/${item.id}`,
        {
          isbn13: item.isbn13,
          title: item.title,
          creator: item.creator,
          publisher: item.publisher,
          volumeLabel: item.volumeLabel,
          coverUrl: item.coverUrl,
          ownershipStatus: item.ownershipStatus,
          readStatus: item.readStatus,
          editionType: item.editionType,
          lentTo: item.lentTo,
          notes: item.notes,
          sourceProvider: item.sourceProvider,
          sourceUrl: item.sourceUrl,
        },
      );
      updateLocal(item.id, result.item);
      setNotice("서재 상태를 저장했습니다.");
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "서재 상태를 저장하지 못했어요."));
    } finally {
      setBusy("");
    }
  }

  async function removeItem(item: CollectionItem) {
    setBusy(item.id);
    try {
      await api.delete(`/creator-ecosystem/library/me/items/${item.id}`);
      setItems((current) => current.filter((value) => value.id !== item.id));
      setNotice(`「${item.title}」을 서재에서 제거했습니다.`);
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "서재에서 제거하지 못했어요."));
    } finally {
      setBusy("");
    }
  }

  async function findHoldings(item: CollectionItem) {
    if (!item.isbn13) {
      setError("도서관 소장 조회에는 ISBN-13이 필요해요.");
      return;
    }
    setBusy(`holding:${item.id}`);
    setError("");
    setHoldings(null);
    setHoldingsTitle(item.title);
    try {
      const result = await api.get<HoldingsResult>("/creator-ecosystem/library/holdings", {
        params: { isbn: item.isbn13, region: region || undefined },
      });
      setHoldings(result);
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "도서관 소장 정보를 조회하지 못했어요."));
    } finally {
      setBusy("");
    }
  }

  return (
    <CreatorEcosystemLayout
      title="만화 · 웹툰 라이브러리"
      intro="글로벌·국내 도서 검색 결과를 개인 서재로 저장하고, 권차·읽음·대여·한정판 상태를 관리합니다. ISBN-13이 있으면 도서관 정보나루의 소장 도서관 조회로 연결합니다."
    >
      {notice ? <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">{error}</p> : null}

      <section className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex items-center gap-2">
          <Search size={20} className="text-accent" aria-hidden="true" />
          <h2 className="text-xl font-black">만화 · 단행본 검색</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
          <select className={INPUT} value={provider} onChange={(event) => setProvider(event.target.value as BookProvider)}>
            <option value="kakao">카카오 도서 · 국내</option>
            <option value="openlibrary">Open Library · 글로벌</option>
            <option value="googlebooks">Google Books</option>
            <option value="openbd">openBD · 일본 ISBN</option>
          </select>
          <input
            className={INPUT}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void searchBooks(); }}
            placeholder={provider === "openbd" ? "일본 ISBN-10 또는 ISBN-13" : "작품명, 작가명, ISBN"}
          />
          <button className={`${BUTTON} bg-accent text-on-accent`} disabled={busy === "search"} onClick={() => void searchBooks()}>
            검색
          </button>
        </div>
        {searchResult ? (
          <p className="mt-3 text-xs leading-5 text-fg-3">
            {RESOURCE_LABELS[searchResult.provider]} · {searchResult.message}
          </p>
        ) : null}
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(searchResult?.items ?? []).map((resource) => (
            <article key={resource.id} className="overflow-hidden rounded-2xl border border-line">
              {resource.imageUrl ? (
                <img src={resource.imageUrl} alt="" className="h-48 w-full bg-raised object-contain p-3" loading="lazy" referrerPolicy="no-referrer" />
              ) : null}
              <div className="p-4">
                <h3 className="font-black">{resource.title}</h3>
                <p className="mt-1 text-xs text-fg-3">{resource.creator || "저자 확인"} · {resource.credit || "출판사 확인"}</p>
                {resource.isbn ? <p className="mt-2 text-xs text-fg-3">ISBN {resource.isbn}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <a className={BUTTON} href={resource.sourceUrl} target="_blank" rel="noopener noreferrer">원문</a>
                  <button className={BUTTON} disabled={busy === resource.id} onClick={() => void addFromResource(resource)}>
                    <BookMarked size={15} className="mr-1" aria-hidden="true" />내 서재
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <LibraryBig size={20} className="text-accent" aria-hidden="true" />
              <h2 className="text-xl font-black">내 서재</h2>
            </div>
            <p className="mt-2 text-sm text-fg-2">소장·읽음·대여·판본 상태를 계정에 저장합니다.</p>
          </div>
          <label className="w-full max-w-xs text-xs font-bold text-fg-3">
            도서관 지역코드 (선택)
            <input className={`${INPUT} mt-1`} value={region} onChange={(event) => setRegion(event.target.value)} placeholder="예: 11 (서울), 비우면 전체" />
          </label>
        </div>
        {!userId ? (
          <p className="mt-5 rounded-xl bg-raised p-4 text-sm text-fg-2">내 서재 저장은 로그인 후 사용할 수 있습니다.</p>
        ) : null}
        <div className="mt-5 space-y-4">
          {items.map((item) => (
            <article key={item.id} className="grid gap-4 rounded-2xl border border-line p-4 lg:grid-cols-[90px_1fr]">
              <div>
                {item.coverUrl ? <img src={item.coverUrl} alt="" className="h-32 w-full rounded-lg bg-raised object-contain" loading="lazy" /> : <div className="flex h-32 items-center justify-center rounded-lg bg-raised text-xs text-fg-3">표지 없음</div>}
              </div>
              <div>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-black">{item.title}</h3>
                    <p className="mt-1 text-xs text-fg-3">{item.creator || "저자 미입력"} · {item.publisher || "출판사 미입력"}</p>
                    {item.isbn13 ? <p className="mt-1 text-xs text-fg-3">ISBN-13 {item.isbn13}</p> : null}
                  </div>
                  <button className={BUTTON} disabled={busy === item.id} onClick={() => void removeItem(item)} aria-label="서재에서 제거">
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <select className={INPUT} value={item.ownershipStatus} onChange={(event) => updateLocal(item.id, { ownershipStatus: event.target.value as CollectionOwnershipStatus })}>
                    {Object.entries(OWNERSHIP_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <select className={INPUT} value={item.readStatus} onChange={(event) => updateLocal(item.id, { readStatus: event.target.value as CollectionReadStatus })}>
                    {Object.entries(READ_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <select className={INPUT} value={item.editionType} onChange={(event) => updateLocal(item.id, { editionType: event.target.value as CollectionEditionType })}>
                    {Object.entries(EDITION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <input className={INPUT} value={item.volumeLabel} onChange={(event) => updateLocal(item.id, { volumeLabel: event.target.value })} placeholder="권차 예: 12권" />
                  <input className={INPUT} value={item.lentTo} onChange={(event) => updateLocal(item.id, { lentTo: event.target.value })} placeholder="빌려준 사람 (선택)" />
                  <input className={`${INPUT} sm:col-span-2 lg:col-span-3`} value={item.notes} onChange={(event) => updateLocal(item.id, { notes: event.target.value })} placeholder="메모" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className={BUTTON} disabled={busy === item.id} onClick={() => void saveItem(item)}>상태 저장</button>
                  <button className={BUTTON} disabled={!item.isbn13 || busy === `holding:${item.id}`} onClick={() => void findHoldings(item)}>소장 도서관 찾기</button>
                  {item.sourceUrl ? <a className={BUTTON} href={item.sourceUrl} target="_blank" rel="noopener noreferrer">서지 원문</a> : null}
                </div>
              </div>
            </article>
          ))}
          {userId && !items.length ? <p className="text-sm text-fg-3">저장한 만화·단행본이 없습니다. 위 검색 결과에서 내 서재에 추가해 보세요.</p> : null}
        </div>
      </section>

      {holdings ? (
        <section className="rounded-2xl border border-line bg-panel p-5">
          <h2 className="text-xl font-black">「{holdingsTitle}」 소장 도서관</h2>
          <p className="mt-2 text-sm leading-6 text-fg-2">{holdings.message}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {holdings.items.map((library) => (
              <article key={library.libraryCode} className="rounded-xl border border-line p-4">
                <h3 className="font-black">{library.name}</h3>
                <p className="mt-1 text-xs leading-5 text-fg-3">{library.address}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  {library.telephone ? <span>{library.telephone}</span> : null}
                  {library.homepage?.startsWith("http") ? <a href={library.homepage} target="_blank" rel="noopener noreferrer" className="font-bold text-accent">도서관 홈페이지</a> : null}
                </div>
              </article>
            ))}
          </div>
          {!holdings.items.length ? (
            <p className="mt-4 text-sm text-fg-3">현재 조건에서 소장 도서관을 확인하지 못했습니다.</p>
          ) : null}
          <a href={holdings.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-accent">
            도서관 정보나루에서 확인
          </a>
        </section>
      ) : null}
    </CreatorEcosystemLayout>
  );
}
