import { Image as ImageIcon, LoaderCircle } from "lucide-react";
import { Suspense, useEffect, useRef, useState, type ReactElement, type RefObject } from "react";

import { useBilingual, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";

import type { StudioAutosavePayload, studioAutosaveKey } from "../studio-autosave";
import { readStudioProjectDocuments } from "../studio-project-document-reader";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import { studioProjectFormatProfile } from "../studio-project-format-catalog";
import { StudioProjectFormatVisual } from "./StudioProjectFormatPreview";
import { useResolvedStudioProjectThumbnailUrl } from "./useStudioProjectThumbnailUrl";
import type { ThumbElement, ThumbPageLike } from "../studio-page-thumbs";

const MAX_PREVIEW_DOCUMENTS = 6;

const LazyStudioPageThumbnail = lazyRetry(
  () => import("../StudioPageThumbnails").then((module) => ({
    default: module.StudioPageThumbnail,
  })),
  "StudioProjectCardThumbnail",
);

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
  autosaveKey: typeof studioAutosaveKey,
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
      keys.add(autosaveKey({ userId: owner, workId: documentId }));
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

interface ProjectPreviewLoad {
  /** 브라우저 자동저장(localStorage)에서 바로 읽은 후보. */
  readonly browser: Promise<PreviewCandidate | null>;
  /** SQLite 내구 저장본까지 합친 최종 후보. */
  readonly durable: Promise<PreviewCandidate | null>;
}

/**
 * 작품 홈은 같은 작품을 로비(최근 작업)와 목록에서 동시에 그린다. 동시에 시작한 해석만 짧게
 * 공유해 큰 자동저장 본문을 두 번 파싱하지 않고, 오래된 미리보기를 재사용하지는 않는다.
 */
const PREVIEW_SHARE_WINDOW_MS = 2_000;
const sharedPreviewLoads = new Map<string, { readonly startedAt: number; readonly load: ProjectPreviewLoad }>();

function previewLoadKey(project: StudioProjectLibraryEntry, authUserId: string | null): string {
  return JSON.stringify([
    project.id,
    project.updatedAt,
    project.lastOpenedAt,
    project.lastOpenedDocumentId,
    authUserId,
  ]);
}

function startProjectPreviewLoad(
  storage: Storage,
  project: StudioProjectLibraryEntry,
  authUserId: string | null,
): ProjectPreviewLoad {
  // 자동저장 해석기(3D 스테이지 정규화 포함)는 미리보기가 필요할 때만 불러와 목록 첫 화면을 막지 않는다.
  const browserRead = import("../studio-autosave").then(({ readStudioAutosave, studioAutosaveKey: autosaveKey }) => {
    const keys = studioProjectPreviewAutosaveKeys(storage, project, authUserId, autosaveKey);
    return { keys, payloads: keys.map((key) => readStudioAutosave(storage, key)?.payload ?? null) };
  });
  const browser = browserRead.then(({ payloads }) => newestCandidate(payloads));
  const durable = browserRead.then(async ({ keys, payloads }) => {
    try {
      const { acquireStudioAutosaveSqliteStore } = await import("../studio-autosave-sqlite-store");
      const store = await acquireStudioAutosaveSqliteStore();
      const rows = await Promise.all(keys.map(async (key) => {
        try {
          const row = await store.read(key);
          return row?.state === "snapshot" ? row.payload : null;
        } catch {
          return null;
        }
      }));
      return newestCandidate([...payloads, ...rows]);
    } catch {
      return newestCandidate(payloads);
    }
  });
  return { browser, durable };
}

function loadProjectPreview(
  storage: Storage,
  project: StudioProjectLibraryEntry,
  authUserId: string | null,
): ProjectPreviewLoad {
  const now = Date.now();
  for (const [key, entry] of sharedPreviewLoads) {
    if (now - entry.startedAt >= PREVIEW_SHARE_WINDOW_MS) sharedPreviewLoads.delete(key);
  }
  const key = previewLoadKey(project, authUserId);
  const shared = sharedPreviewLoads.get(key);
  if (shared) return shared.load;
  const load = startProjectPreviewLoad(storage, project, authUserId);
  sharedPreviewLoads.set(key, { startedAt: now, load });
  return load;
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

function PreviewLoading({ locale: _locale }: { readonly locale: string }) {
  const bt = useBilingual("StudioProjectCardThumbnail.loading");
  return (
    <div className="grid h-full place-items-center bg-panel/70 text-fg-3">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {bt("최근 작업 불러오는 중", "Loading recent work")}
      </div>
    </div>
  );
}

function PreviewEmpty({
  locale,
  project,
}: {
  readonly locale: string;
  readonly project: StudioProjectLibraryEntry;
}) {
  const bt = useBilingual("StudioProjectCardThumbnail.empty");
  const formatProfile = project.definition
    ? studioProjectFormatProfile(project.definition.format)
    : null;
  if (formatProfile) {
    return (
      <div className="relative h-full bg-panel/70 p-3 text-center text-fg-3">
        <StudioProjectFormatVisual
          profile={formatProfile}
          className="mx-auto h-full max-w-sm bg-card/70"
        />
        <span className="absolute inset-x-3 bottom-3 rounded-lg bg-card/90 px-2 py-1.5 text-[0.68rem] font-bold text-fg-2 shadow-sm">
          {locale.startsWith("ko") ? formatProfile.titleKo : formatProfile.titleEn}
        </span>
      </div>
    );
  }
  return (
    <div className="grid h-full place-items-center bg-panel/70 px-5 text-center text-fg-3">
      <div>
        <ImageIcon size={22} className="mx-auto" aria-hidden="true" />
        <p className="mt-2 text-xs font-semibold">
          {bt("작업을 시작하면 미리보기가 표시됩니다.", "A preview appears after you start working.")}
        </p>
      </div>
    </div>
  );
}

export type StudioProjectCardThumbnailVariant = "card" | "cover";

const VARIANT_FRAME_CLASS: Readonly<Record<StudioProjectCardThumbnailVariant, string>> = {
  card: "relative -mx-4 -mt-4 mb-4 aspect-[16/10] overflow-hidden border-b border-line bg-panel/70",
  cover: "relative h-full w-full overflow-hidden bg-panel/70",
};

export function StudioProjectCardThumbnail({
  authUserId,
  locale,
  project,
  variant = "card",
}: {
  readonly authUserId: string | null;
  readonly locale: string;
  readonly project: StudioProjectLibraryEntry;
  /** `cover`는 이미 이름이 있는 링크 안에서 쓰는 장식용 표지다(보조기기에는 링크 이름만 전달). */
  readonly variant?: StudioProjectCardThumbnailVariant;
}): ReactElement {
  const bt = useBilingual("StudioProjectCardThumbnail");
  const { nearViewport, rootRef } = useNearViewport();
  const [preview, setPreview] = useState<PreviewCandidate | null>(null);
  const [phase, setPhase] = useState<PreviewPhase>("idle");
  const [storedThumbnailFailed, setStoredThumbnailFailed] = useState(false);
  const decorative = variant === "cover";

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
    // 목록 새로고침(포커스·저장 이벤트) 때 이미 그린 미리보기를 지우지 않고 새 결과로 교체한다.
    setPhase((current) => (current === "ready" ? current : "loading"));
    const load = loadProjectPreview(storage, project, authUserId);
    load.browser.then((candidate) => {
      if (disposed || !candidate) return;
      setPreview(candidate);
      setPhase("ready");
    }, () => undefined);
    load.durable.then((candidate) => {
      if (disposed) return;
      setPreview(candidate);
      setPhase(candidate ? "ready" : "empty");
    }, () => {
      if (!disposed) setPhase("empty");
    });

    return () => {
      disposed = true;
    };
  }, [authUserId, nearViewport, project]);

  const resolvedThumbnailUrl = useResolvedStudioProjectThumbnailUrl(project.thumbnailUrl);
  const storedThumbnail = resolvedThumbnailUrl && !storedThumbnailFailed
    ? resolvedThumbnailUrl
    : null;
  const previewLabel = bt(`${project.title} 최근 작업 미리보기`, `Recent work preview for ${project.title}`);

  return (
    <div
      ref={rootRef}
      data-studio-project-thumbnail={variant}
      aria-hidden={decorative || undefined}
      className={VARIANT_FRAME_CLASS[variant]}
      data-project-preview-state={preview ? "autosave" : storedThumbnail ? "stored" : phase}
    >
      {preview ? (
        <div
          role={decorative ? undefined : "img"}
          aria-label={decorative ? undefined : previewLabel}
          className="h-full w-full bg-white"
        >
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
          alt={decorative ? "" : previewLabel}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setStoredThumbnailFailed(true)}
        />
      ) : phase === "idle" || phase === "loading" ? (
        <PreviewLoading locale={locale} />
      ) : (
        <PreviewEmpty locale={locale} project={project} />
      )}
      {!decorative && (preview || storedThumbnail) ? (
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full border border-white/20 bg-black/65 px-2 py-1 text-[0.62rem] font-black text-white shadow-sm backdrop-blur-sm">
          {preview
            ? bt("최근 자동 저장", "Latest autosave")
            : bt("프로젝트 미리보기", "Project preview")}
        </span>
      ) : null}
    </div>
  );
}
