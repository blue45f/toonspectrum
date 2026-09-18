import { Image as ImageIcon, LoaderCircle } from "lucide-react";
import { Suspense, useEffect, useRef, useState, type ReactElement, type RefObject } from "react";

import { lazyRetry } from "@/shared/lib/lazy-retry";

import {
  readStudioAutosave,
  studioAutosaveKey,
  type StudioAutosavePayload,
} from "../studio-autosave";
import { readStudioProjectDocuments } from "../studio-project-document-reader";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import type { ThumbElement, ThumbPageLike } from "../studio-page-thumbs";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const MAX_PREVIEW_DOCUMENTS = 6;

const LazyStudioPageThumbnail = lazyRetry(
  () => import("../StudioPageThumbnails").then((module) => ({
    default: module.StudioPageThumbnail,
  })),
  "StudioProjectCardThumbnail",
);

type Locale = string;
const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("StudioProjectCardThumbnail", ko, en);;
type PreviewPhase = "idle" | "loading" | "ready" | "empty";

interface PreviewCandidate {
  readonly page: ThumbPageLike;
  readonly savedAt: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function thumbElements(value: unknown): ThumbElement[] {
  if (!Array.isArray(value)) return [];
  return value.filter((element): element is ThumbElement => {
    const item = record(element);
    return item !== null
      && typeof item.id === "string"
      && item.id.trim().length > 0
      && typeof item.type === "string"
      && item.type.trim().length > 0;
  });
}

function normalizePreviewPage(value: unknown, fallbackId: string): ThumbPageLike | null {
  const page = record(value);
  if (!page) return null;
  const elements = thumbElements(page.elements);
  if (elements.length === 0) return null;
  const rawGradient = Array.isArray(page.bgGrad)
    ? page.bgGrad.filter((color): color is string => typeof color === "string")
    : [];
  const canvasH = typeof page.canvasH === "number"
    && Number.isFinite(page.canvasH)
    && page.canvasH > 0
    ? page.canvasH
    : 1080;

  return {
    id: typeof page.id === "string" && page.id.trim() ? page.id : fallbackId,
    elements,
    bg: typeof page.bg === "string" && page.bg.trim() ? page.bg : "#ffffff",
    bgGrad: rawGradient.length >= 2 ? rawGradient.slice(0, 2) : null,
    canvasH,
    grade: page.grade,
  };
}

function studioProjectPreviewFromAutosave(
  payload: StudioAutosavePayload,
): PreviewCandidate | null {
  const currentIndex = payload.currentPageId
    ? payload.pagesList.findIndex((page) => page.id === payload.currentPageId)
    : -1;
  const pages = currentIndex >= 0
    ? [payload.pagesList[currentIndex], ...payload.pagesList.filter((_, index) => index !== currentIndex)]
    : payload.pagesList;

  for (let index = 0; index < pages.length; index += 1) {
    const page = normalizePreviewPage(pages[index], `preview-page-${index + 1}`);
    if (!page) continue;
    const savedAt = Date.parse(payload.savedAt);
    return {
      page,
      savedAt: Number.isFinite(savedAt) ? savedAt : 0,
    };
  }
  return null;
}

function newestCandidate(
  payloads: readonly (StudioAutosavePayload | null | undefined)[],
): PreviewCandidate | null {
  let newest: PreviewCandidate | null = null;
  for (const payload of payloads) {
    if (!payload) continue;
    const candidate = studioProjectPreviewFromAutosave(payload);
    if (candidate && (!newest || candidate.savedAt >= newest.savedAt)) newest = candidate;
  }
  return newest;
}

function studioProjectPreviewAutosaveKeys(
  storage: Storage,
  project: StudioProjectLibraryEntry,
  authUserId: string | null,
): readonly string[] {
  let documentIds: string[];
  try {
    const documents = readStudioProjectDocuments(storage, project.id).documents
      .filter((document) => document.status !== "trashed")
      .slice(0, MAX_PREVIEW_DOCUMENTS)
      .map((document) => document.id);
    documentIds = [
      ...(project.lastOpenedDocumentId ? [project.lastOpenedDocumentId] : []),
      ...documents,
      project.id,
    ];
  } catch {
    documentIds = [
      ...(project.lastOpenedDocumentId ? [project.lastOpenedDocumentId] : []),
      project.id,
    ];
  }

  const owners = authUserId ? [authUserId, null] as const : [null] as const;
  const keys = new Set<string>();
  for (const documentId of new Set(documentIds.filter(Boolean))) {
    for (const owner of owners) {
      keys.add(studioAutosaveKey({ userId: owner, workId: documentId }));
    }
  }
  return [...keys];
}

function localStorageOrNull(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function useNearViewport(): {
  readonly nearViewport: boolean;
  readonly rootRef: RefObject<HTMLDivElement | null>;
} {
  useBilingualI18nRevision();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [nearViewport, setNearViewport] = useState(
    () => typeof globalThis.IntersectionObserver !== "function",
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof globalThis.IntersectionObserver !== "function") return;
    const observer = new globalThis.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: "420px 0px" });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return { nearViewport, rootRef };
}

function PreviewLoading({ locale: _locale }: { readonly locale: Locale }) {
  useBilingualI18nRevision();
  return (
    <div className="grid h-full place-items-center bg-panel/70 text-fg-3">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {bi("최근 작업 불러오는 중", "Loading recent work")}
      </div>
    </div>
  );
}

function PreviewEmpty({ locale: _locale }: { readonly locale: Locale }) {
  useBilingualI18nRevision();
  return (
    <div className="grid h-full place-items-center bg-panel/70 px-5 text-center text-fg-3">
      <div>
        <ImageIcon size={22} className="mx-auto" aria-hidden="true" />
        <p className="mt-2 text-xs font-semibold">
          {bi("작업을 시작하면 미리보기가 표시됩니다.", "A preview appears after you start working.")}
        </p>
      </div>
    </div>
  );
}

export function StudioProjectCardThumbnail({
  authUserId,
  locale,
  project,
}: {
  readonly authUserId: string | null;
  readonly locale: Locale;
  readonly project: StudioProjectLibraryEntry;
}): ReactElement {
  useBilingualI18nRevision();
  const { nearViewport, rootRef } = useNearViewport();
  const [preview, setPreview] = useState<PreviewCandidate | null>(null);
  const [phase, setPhase] = useState<PreviewPhase>("idle");
  const [storedThumbnailFailed, setStoredThumbnailFailed] = useState(false);

  useEffect(() => {
    setStoredThumbnailFailed(false);
  }, [project.thumbnailUrl]);

  useEffect(() => {
    if (!nearViewport) return;
    const storage = localStorageOrNull();
    if (!storage) {
      setPhase("empty");
      return;
    }

    let disposed = false;
    setPreview(null);
    setPhase("loading");
    const keys = studioProjectPreviewAutosaveKeys(storage, project, authUserId);
    const browserPayloads = keys.map((key) => readStudioAutosave(storage, key)?.payload ?? null);
    const browserCandidate = newestCandidate(browserPayloads);
    if (browserCandidate) {
      setPreview(browserCandidate);
      setPhase("ready");
    }

    void import("../studio-autosave-sqlite-store")
      .then(({ acquireStudioAutosaveSqliteStore }) => acquireStudioAutosaveSqliteStore())
      .then(async (store) => {
        const rows = await Promise.all(keys.map(async (key) => {
          try {
            const row = await store.read(key);
            return row?.state === "snapshot" ? row.payload : null;
          } catch {
            return null;
          }
        }));
        if (disposed) return;
        const durableCandidate = newestCandidate([...browserPayloads, ...rows]);
        setPreview(durableCandidate);
        setPhase(durableCandidate ? "ready" : "empty");
      })
      .catch(() => {
        if (!disposed) setPhase(browserCandidate ? "ready" : "empty");
      });

    return () => {
      disposed = true;
    };
  }, [authUserId, nearViewport, project]);

  const storedThumbnail = project.thumbnailUrl && !storedThumbnailFailed
    ? project.thumbnailUrl
    : null;
  const previewLabel = formatI18nTemplate(String(bi("{value0} 최근 작업 미리보기", "Recent work preview for {value0}")), { value0: project.title });

  return (
    <div
      ref={rootRef}
      className="relative -mx-4 -mt-4 mb-4 aspect-[16/10] overflow-hidden border-b border-line bg-panel/70"
      data-project-preview-state={preview ? "autosave" : storedThumbnail ? "stored" : phase}
    >
      {preview ? (
        <div role="img" aria-label={previewLabel} className="h-full w-full bg-white">
          <Suspense fallback={<PreviewLoading locale={locale} />}>
            <LazyStudioPageThumbnail
              page={preview.page}
              className="!h-full !rounded-none !border-0 bg-white"
            />
          </Suspense>
        </div>
      ) : storedThumbnail ? (
        <img
          src={storedThumbnail}
          alt={previewLabel}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setStoredThumbnailFailed(true)}
        />
      ) : phase === "idle" || phase === "loading" ? (
        <PreviewLoading locale={locale} />
      ) : (
        <PreviewEmpty locale={locale} />
      )}
      {preview || storedThumbnail ? (
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full border border-white/20 bg-black/65 px-2 py-1 text-[0.62rem] font-black text-white shadow-sm backdrop-blur-sm">
          {preview
            ? bi("최근 자동 저장", "Latest autosave")
            : bi("프로젝트 미리보기", "Project preview")}
        </span>
      ) : null}
    </div>
  );
}
