import { BookMarked, LibraryBig, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CreatorEcosystemLayout } from "./CreatorEcosystemLayout";

import { api, getApiErrorMessage } from "@/platform/api";
import { RESOURCE_LABELS } from "@/shared/lib/creator-resources";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";

import type { CreatorResource, ResourceSearchResult } from "@/shared/lib/creator-resources";
import type {
  CollectionEditionType,
  CollectionOwnershipStatus,
  CollectionReadStatus,
} from "@/shared/lib/types";

const SCOPE = "domains.creator-ecosystem.ComicLibraryPage";

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

const OWNERSHIP_KO: Record<CollectionOwnershipStatus, string> = {
  owned: "소장",
  wanted: "구매 예정",
  borrowed: "빌림",
  lent: "빌려줌",
  sold: "판매",
  lost: "분실",
};
const OWNERSHIP_EN: Record<CollectionOwnershipStatus, string> = {
  owned: "Owned",
  wanted: "Want to buy",
  borrowed: "Borrowed",
  lent: "Lent out",
  sold: "Sold",
  lost: "Lost",
};
const READ_KO: Record<CollectionReadStatus, string> = {
  unread: "미독",
  reading: "읽는 중",
  read: "읽음",
};
const READ_EN: Record<CollectionReadStatus, string> = {
  unread: "Unread",
  reading: "Reading",
  read: "Read",
};
const EDITION_KO: Record<CollectionEditionType, string> = {
  standard: "일반판",
  limited: "한정판",
  first: "초판",
  signed: "사인본",
  digital: "전자책",
};
const EDITION_EN: Record<CollectionEditionType, string> = {
  standard: "Standard",
  limited: "Limited",
  first: "First edition",
  signed: "Signed",
  digital: "E-book",
};

function isbn13Of(value: string | undefined): string {
  if (!value) return "";
  const match = value.replace(/-/gu, " ").match(/(?:^|\s)(\d{13})(?:\s|$)/u);
  if (match) return match[1];
  const compact = value.replace(/\D/gu, "");
  return compact.length === 13 ? compact : "";
}

export function ComicLibraryPage() {
  const bt = useBilingual(SCOPE);
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
      setError(await getApiErrorMessage(cause, bt("내 서재를 불러오지 못했어요.", "Couldn't load your library.")));
    }
  }, [userId, bt]);

  useEffect(() => {
    void loadCollection();
  }, [loadCollection]);

  async function searchBooks() {
    const q = query.trim();
    if (q.length < 2) {
      setError(bt("검색어를 2자 이상 입력해 주세요.", "Enter at least 2 characters to search."));
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
      setError(await getApiErrorMessage(cause, bt("도서를 검색하지 못했어요.", "Couldn't search books.")));
    } finally {
      setBusy("");
    }
  }

  async function addFromResource(resource: CreatorResource) {
    if (!userId) {
      setError(bt("내 서재에 저장하려면 로그인해 주세요.", "Sign in to save to your library."));
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
      setNotice(bt(`「${resource.title}」을 내 서재에 저장했습니다.`, `Saved "${resource.title}" to your library.`));
      await loadCollection();
    } catch (cause) {
      setError(await getApiErrorMessage(cause, bt("내 서재에 저장하지 못했어요.", "Couldn't save to your library.")));
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
      setNotice(bt("서재 상태를 저장했습니다.", "Saved the library status."));
    } catch (cause) {
      setError(await getApiErrorMessage(cause, bt("서재 상태를 저장하지 못했어요.", "Couldn't save the library status.")));
    } finally {
      setBusy("");
    }
  }

  async function removeItem(item: CollectionItem) {
    setBusy(item.id);
    try {
      await api.delete(`/creator-ecosystem/library/me/items/${item.id}`);
      setItems((current) => current.filter((value) => value.id !== item.id));
      setNotice(bt(`「${item.title}」을 서재에서 제거했습니다.`, `Removed "${item.title}" from your library.`));
    } catch (cause) {
      setError(await getApiErrorMessage(cause, bt("서재에서 제거하지 못했어요.", "Couldn't remove from your library.")));
    } finally {
      setBusy("");
    }
  }

  async function findHoldings(item: CollectionItem) {
    if (!item.isbn13) {
      setError(bt("도서관 소장 조회에는 ISBN-13이 필요해요.", "Library holdings lookup needs an ISBN-13."));
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
      setError(await getApiErrorMessage(cause, bt("도서관 소장 정보를 조회하지 못했어요.", "Couldn't look up library holdings.")));
    } finally {
      setBusy("");
    }
  }

  return (
    <CreatorEcosystemLayout
      title={bt("만화 · 웹툰 라이브러리", "Comics · webtoon library")}
      intro={bt(
        "글로벌·국내 도서 검색 결과를 개인 서재로 저장하고, 권차·읽음·대여·한정판 상태를 관리합니다. ISBN-13이 있으면 도서관 정보나루의 소장 도서관 조회로 연결합니다.",
        "Save global and domestic book search results to a personal library and track volumes, reading, lending, and limited editions. With an ISBN-13 you can look up holdings via the national library data service.",
      )}
    >
      {notice ? <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">{error}</p> : null}

      <section id="comic-search" className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex items-center gap-2">
          <Search size={20} className="text-accent" aria-hidden="true" />
          <h2 className="text-xl font-black">{bt("만화 · 단행본 검색", "Search comics & books")}</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
          <select className={INPUT} value={provider} aria-label={bt("도서 검색 제공자", "Book search provider")} onChange={(event) => setProvider(event.target.value as BookProvider)}>
            <option value="kakao">{bt("카카오 도서 · 국내", "Kakao Books · Korea")}</option>
            <option value="openlibrary">{bt("Open Library · 글로벌", "Open Library · global")}</option>
            <option value="googlebooks">Google Books</option>
            <option value="openbd">{bt("openBD · 일본 ISBN", "openBD · Japan ISBN")}</option>
          </select>
          <input
            className={INPUT}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void searchBooks(); }}
            placeholder={provider === "openbd" ? bt("일본 ISBN-10 또는 ISBN-13", "Japan ISBN-10 or ISBN-13") : bt("작품명, 작가명, ISBN", "Title, author, or ISBN")}
          />
          <button className={`${BUTTON} bg-accent text-on-accent`} disabled={busy === "search"} onClick={() => void searchBooks()}>
            {bt("검색", "Search")}
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
                <p className="mt-1 text-xs text-fg-3">{resource.creator || bt("저자 확인", "Author unknown")} · {resource.credit || bt("출판사 확인", "Publisher unknown")}</p>
                {resource.isbn ? <p className="mt-2 text-xs text-fg-3">ISBN {resource.isbn}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <a className={BUTTON} href={resource.sourceUrl} target="_blank" rel="noopener noreferrer">{bt("원문", "Source")}</a>
                  <button className={BUTTON} disabled={busy === resource.id} onClick={() => void addFromResource(resource)}>
                    <BookMarked size={15} className="mr-1" aria-hidden="true" />{bt("내 서재", "My library")}
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
              <h2 className="text-xl font-black">{bt("내 서재", "My library")}</h2>
            </div>
            <p className="mt-2 text-sm text-fg-2">{bt("소장·읽음·대여·판본 상태를 계정에 저장합니다.", "Ownership, reading, lending, and edition status saved to your account.")}</p>
          </div>
          <label className="w-full max-w-xs text-xs font-bold text-fg-3">
            {bt("도서관 지역코드 (선택)", "Library region code (optional)")}
            <input className={`${INPUT} mt-1`} value={region} onChange={(event) => setRegion(event.target.value)} placeholder={bt("예: 11 (서울), 비우면 전체", "E.g. 11 (Seoul); blank = all")} />
          </label>
        </div>
        {!userId ? (
          <p className="mt-5 rounded-xl bg-raised p-4 text-sm text-fg-2">{bt("내 서재 저장은 로그인 후 사용할 수 있습니다.", "Saving to your library needs sign-in.")}</p>
        ) : null}
        <div className="mt-5 space-y-4">
          {items.map((item) => (
            <article key={item.id} className="grid gap-4 rounded-2xl border border-line p-4 lg:grid-cols-[90px_1fr]">
              <div>
                {item.coverUrl ? <img src={item.coverUrl} alt="" className="h-32 w-full rounded-lg bg-raised object-contain" loading="lazy" /> : <div className="flex h-32 items-center justify-center rounded-lg bg-raised text-xs text-fg-3">{bt("표지 없음", "No cover")}</div>}
              </div>
              <div>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-black">{item.title}</h3>
                    <p className="mt-1 text-xs text-fg-3">{item.creator || bt("저자 미입력", "No author")} · {item.publisher || bt("출판사 미입력", "No publisher")}</p>
                    {item.isbn13 ? <p className="mt-1 text-xs text-fg-3">ISBN-13 {item.isbn13}</p> : null}
                  </div>
                  <button className={BUTTON} disabled={busy === item.id} onClick={() => void removeItem(item)} aria-label={bt("서재에서 제거", "Remove from library")}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <select className={INPUT} value={item.ownershipStatus} aria-label={bt("소장 상태", "Ownership status")} onChange={(event) => updateLocal(item.id, { ownershipStatus: event.target.value as CollectionOwnershipStatus })}>
                    {Object.entries(OWNERSHIP_KO).map(([value, label]) => <option key={value} value={value}>{bt(label, OWNERSHIP_EN[value as CollectionOwnershipStatus])}</option>)}
                  </select>
                  <select className={INPUT} value={item.readStatus} aria-label={bt("읽음 상태", "Reading status")} onChange={(event) => updateLocal(item.id, { readStatus: event.target.value as CollectionReadStatus })}>
                    {Object.entries(READ_KO).map(([value, label]) => <option key={value} value={value}>{bt(label, READ_EN[value as CollectionReadStatus])}</option>)}
                  </select>
                  <select className={INPUT} value={item.editionType} aria-label={bt("판본", "Edition")} onChange={(event) => updateLocal(item.id, { editionType: event.target.value as CollectionEditionType })}>
                    {Object.entries(EDITION_KO).map(([value, label]) => <option key={value} value={value}>{bt(label, EDITION_EN[value as CollectionEditionType])}</option>)}
                  </select>
                  <input className={INPUT} value={item.volumeLabel} onChange={(event) => updateLocal(item.id, { volumeLabel: event.target.value })} placeholder={bt("권차 예: 12권", "Volume, e.g. 12")} />
                  <input className={INPUT} value={item.lentTo} onChange={(event) => updateLocal(item.id, { lentTo: event.target.value })} placeholder={bt("빌려준 사람 (선택)", "Lent to (optional)")} />
                  <input className={`${INPUT} sm:col-span-2 lg:col-span-3`} value={item.notes} onChange={(event) => updateLocal(item.id, { notes: event.target.value })} placeholder={bt("메모", "Notes")} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className={BUTTON} disabled={busy === item.id} onClick={() => void saveItem(item)}>{bt("상태 저장", "Save status")}</button>
                  <button className={BUTTON} disabled={!item.isbn13 || busy === `holding:${item.id}`} onClick={() => void findHoldings(item)}>{bt("소장 도서관 찾기", "Find holding libraries")}</button>
                  {item.sourceUrl ? <a className={BUTTON} href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{bt("서지 원문", "Bibliographic source")}</a> : null}
                </div>
              </div>
            </article>
          ))}
          {userId && !items.length ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line bg-canvas/60 px-6 py-12 text-center">
              <span className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-on-accent shadow-lg">
                <LibraryBig size={28} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-lg font-black">{bt("저장한 만화·단행본이 없어요", "Your library is empty")}</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-fg-2">
                  {bt("위 검색 결과에서 마음에 드는 작품을 내 서재에 추가해 보세요.", "Add books you like from the search results above.")}
                </p>
              </div>
              <a href="#comic-search" className={`${BUTTON} bg-accent text-on-accent`}>
                <Plus size={16} className="mr-1" aria-hidden="true" />
                {bt("도서 검색하러 가기", "Search books")}
              </a>
            </div>
          ) : null}
        </div>
      </section>

      {holdings ? (
        <section className="rounded-2xl border border-line bg-panel p-5">
          <h2 className="text-xl font-black">{bt(`「${holdingsTitle}」 소장 도서관`, `Libraries holding "${holdingsTitle}"`)}</h2>
          <p className="mt-2 text-sm leading-6 text-fg-2">{holdings.message}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {holdings.items.map((library) => (
              <article key={library.libraryCode} className="rounded-xl border border-line p-4">
                <h3 className="font-black">{library.name}</h3>
                <p className="mt-1 text-xs leading-5 text-fg-3">{library.address}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  {library.telephone ? <span>{library.telephone}</span> : null}
                  {library.homepage?.startsWith("http") ? <a href={library.homepage} target="_blank" rel="noopener noreferrer" className="font-bold text-accent">{bt("도서관 홈페이지", "Library website")}</a> : null}
                </div>
              </article>
            ))}
          </div>
          {!holdings.items.length ? (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-canvas/60 px-6 py-8 text-center">
              <span className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-on-accent">
                <Search size={22} aria-hidden="true" />
              </span>
              <p className="text-sm leading-6 text-fg-2">{bt("현재 조건에서 소장 도서관을 확인하지 못했습니다.", "No holding libraries found under the current conditions.")}</p>
              <a href={holdings.sourceUrl} target="_blank" rel="noopener noreferrer" className={`${BUTTON} border-accent text-accent`}>
                {bt("도서관 정보나루에서 직접 확인", "Check on the national library service")}
              </a>
            </div>
          ) : null}
          <a href={holdings.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-accent">
            {bt("도서관 정보나루에서 확인", "Open on the national library service")}
          </a>
        </section>
      ) : null}
    </CreatorEcosystemLayout>
  );
}
