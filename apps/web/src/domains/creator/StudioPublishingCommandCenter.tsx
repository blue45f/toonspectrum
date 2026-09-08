import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Globe2,
  ImagePlus,
  Link2,
  Loader2,
  LockKeyhole,
  PenLine,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { buildStudioHref } from "./creator-studio-links";
import { confirmStudioDestructiveAction } from "./studio-destructive-action-preview";
import { studioDiscardLocalChangesRequest } from "./studio-destructive-command-catalog";
import { downscaleDataUrl, downscaleImageFile } from "./studio-image-utils";
import {
  getStudioSharedDocument,
  getStudioSharedDocumentMeta,
  isStudioSharedDocumentAccessError,
  isStudioSharedDocumentRevisionConflictError,
  updateStudioSharedDocument,
  type StudioSharedDocumentMeta,
} from "./studio-shared-document-client";
import {
  assertStudioUploadSourceBatch,
  inspectStudioUploadSourceImage,
  selectStudioUploadDecodedPixelLimit,
} from "./studio-upload-image-safety";
import {
  STUDIO_UPLOAD_ACTION_DOCK_CLASS,
  STUDIO_UPLOAD_CONTAINER_CLASS,
  STUDIO_UPLOAD_PAGE_CONTROL_CLASS,
  STUDIO_UPLOAD_PAGE_CONTROLS_CLASS,
  STUDIO_UPLOAD_PAGE_LIST_CLASS,
  STUDIO_UPLOAD_PAGE_ROW_CLASS,
} from "./studio-upload-layout";
import {
  advanceStudioUploadSharedMetaAfterSave,
  assertStudioUploadJsonPayloadSize,
  assertStudioUploadPublishScope,
  assertStudioUploadSharedMetaUnchanged,
  canEditStudioUploadSharedDocument,
  canPublishStudioUploadSharedDocument,
  captureStudioUploadPublishScope,
  isStudioUploadHydrationScopeCurrent,
  isStudioUploadPublishScopeCurrent,
  isStudioUploadPublishScopeInvalidatedError,
  isStudioUploadSharedAccessChangedError,
  isStudioUploadWorkspaceLocked,
  resolveStudioUploadActionLocks,
  resolveStudioUploadSharedCrdtSaveFence,
  resolveStudioUploadUpdateRevision,
  runStudioUploadPublishStages,
  shouldResetStudioUploadDraft,
  validateStudioUploadHydratedSharedDocument,
  validateStudioUploadSavedWork,
  type StudioUploadCurrentScope,
  type StudioUploadHydrationStatus,
  type StudioUploadPublishScope,
} from "./studio-upload-publish-safety";
import { resolveStudioUploadWorkId } from "./studio-upload-route";
import {
  parseStudioPublicationTags,
  suggestStudioPublicationSocialMetadata,
  validateStudioPublicationPreflight,
} from "./studio-publication-preflight";
import { StudioPublicationControls } from "./StudioPublicationControls";
import {
  StudioPublishContextBanner,
  type PublishContext,
} from "./StudioPublishContextBanner";

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  createDefaultCreatorPublicationDirective,
  markCreatorPublicationPublished,
  normalizeCreatorPublicationDirective,
  readCreatorPublicationDirective,
  resolveCreatorPublicationStatus,
  writeCreatorPublicationDirective,
  type CreatorPublicationDirective,
} from "@/shared/lib/creator-publication-contract";
import { cn } from "@/shared/lib/utils";
import { useSession } from "@/compat/auth-session-store";
import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import {
  getChallenge,
  getSeries,
} from "@/infrastructure/creator-client";

const MAX_PAGES = 40;

type UploadPage = {
  id: string;
  src: string;
  width: number;
  height: number;
  name: string;
};

type CommandStep = "content" | "distribution" | "review";
type SaveIntent = "draft" | "publish";

const COMMAND_STEPS: readonly {
  id: CommandStep;
  label: string;
  description: string;
}[] = [
  { id: "content", label: "원고", description: "이미지·작품 정보" },
  { id: "distribution", label: "게시 설정", description: "공개·예약·독자 정책" },
  { id: "review", label: "최종 확인", description: "미리보기·사전검사" },
];

function uid() {
  return `publish-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function initialDirective(): CreatorPublicationDirective {
  return createDefaultCreatorPublicationDirective(browserTimeZone());
}

function publicationActionLabel(
  directive: CreatorPublicationDirective,
  editing: boolean,
): string {
  if (directive.visibility === "private") return "비공개로 저장";
  if (directive.mode === "scheduled") return editing ? "게시 예약 변경" : "게시 예약";
  return editing ? "수정사항 게시" : "작품 게시";
}

function visibilityLabel(directive: CreatorPublicationDirective): string {
  if (directive.visibility === "unlisted") return "링크 공개";
  if (directive.visibility === "private") return "비공개";
  return "전체 공개";
}

function scheduleLabel(directive: CreatorPublicationDirective): string {
  if (directive.visibility === "private") return "게시하지 않고 초안 유지";
  if (directive.mode === "immediate") return "확인 즉시 공개";
  if (!directive.scheduledAt) return "예약 시각 미입력";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: directive.timeZone,
    }).format(new Date(directive.scheduledAt));
  } catch {
    return directive.scheduledAt;
  }
}

export interface StudioPublishingCommandCenterProps {
  readonly workId?: string | null;
}

export function StudioPublishingCommandCenter({
  workId: routeWorkId,
}: StudioPublishingCommandCenterProps = {}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: session } = useSession();
  const authUserId = session?.user?.id ?? null;
  const loggedIn = authUserId !== null;
  const workId = resolveStudioUploadWorkId(routeWorkId, params.get("id"));
  const routeSeriesId = params.get("seriesId");
  const routeChallengeId = params.get("challengeId");
  const routeTitleId = params.get("titleId");
  useDocumentTitle(workId ? "게시 설정 및 수정" : "게시 명령 센터");

  const [step, setStep] = useState<CommandStep>("content");
  const [pages, setPages] = useState<UploadPage[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [directive, setDirective] = useState<CreatorPublicationDirective>(initialDirective);
  const [baseDoc, setBaseDoc] = useState<Record<string, unknown>>({});
  const [linkedSeriesId, setLinkedSeriesId] = useState<string | null>(routeSeriesId);
  const [linkedChallengeId, setLinkedChallengeId] = useState<string | null>(routeChallengeId);
  const [linkedTitleId, setLinkedTitleId] = useState<string | null>(routeTitleId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [publishContext, setPublishContext] = useState<PublishContext>({});
  const [hydrationStatus, setHydrationStatus] = useState<StudioUploadHydrationStatus>(
    workId ? "loading" : "ready",
  );
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [hydrationAttempt, setHydrationAttempt] = useState(0);
  const [workRevision, setWorkRevision] = useState<number | undefined>();
  const [hydratedScope, setHydratedScope] = useState<StudioUploadPublishScope | null>(null);
  const [sharedMeta, setSharedMeta] = useState<StudioSharedDocumentMeta | null>(null);
  const mountedRef = useRef(false);
  const currentScopeRef = useRef<StudioUploadCurrentScope>({ authUserId, workId });
  const committedScopeRef = useRef<StudioUploadCurrentScope>({ authUserId, workId });
  const publishAbortRef = useRef<AbortController | null>(null);
  const publishRequestIdRef = useRef(0);
  currentScopeRef.current = { authUserId, workId };

  const currentScope = { authUserId, workId };
  const hydrationScopeCurrent = isStudioUploadHydrationScopeCurrent(
    hydratedScope,
    currentScope,
  );
  const hydrating = Boolean(
    workId &&
      (hydrationStatus === "loading" ||
        (hydrationStatus === "ready" && !hydrationScopeCurrent)),
  );
  const workspaceLocked = isStudioUploadWorkspaceLocked({
    workId,
    currentScope,
    hydratedScope,
    hydrationStatus,
    saving,
    loadingFiles,
  });
  const { mutationLocked, publishLocked } = resolveStudioUploadActionLocks({
    workId,
    workspaceLocked,
    meta: sharedMeta,
  });
  const policyEditable = !workId || canPublishStudioUploadSharedDocument(sharedMeta);
  const tags = useMemo(() => parseStudioPublicationTags(tagsText), [tagsText]);
  const preflight = useMemo(
    () =>
      validateStudioPublicationPreflight({
        title,
        description,
        tags,
        pages,
        directive,
        challengeLinked: Boolean(linkedChallengeId),
        seriesLinked: Boolean(linkedSeriesId),
      }),
    [description, directive, linkedChallengeId, linkedSeriesId, pages, tags, title],
  );

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      publishRequestIdRef.current += 1;
      publishAbortRef.current?.abort();
      publishAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  useLayoutEffect(() => {
    const nextScope = { authUserId, workId };
    const previousScope = committedScopeRef.current;
    const resetDraft = shouldResetStudioUploadDraft(previousScope, nextScope);
    const adoptingGuestDraft =
      previousScope.authUserId === null &&
      previousScope.workId === null &&
      nextScope.authUserId !== null &&
      nextScope.workId === null;
    committedScopeRef.current = nextScope;
    publishRequestIdRef.current += 1;
    publishAbortRef.current?.abort();
    publishAbortRef.current = null;
    setSaving(false);
    setLoadingFiles(false);
    if (resetDraft) {
      setStep("content");
      setPages([]);
      setTitle("");
      setDescription("");
      setTagsText("");
      setDirective(initialDirective());
      setBaseDoc({});
      setLinkedSeriesId(workId ? null : routeSeriesId);
      setLinkedChallengeId(workId ? null : routeChallengeId);
      setLinkedTitleId(workId ? null : routeTitleId);
      setError(null);
      setSuccessMessage(null);
      setDirty(false);
      setHydrationError(null);
      setWorkRevision(undefined);
      setHydratedScope(null);
      setSharedMeta(null);
      setHydrationStatus(workId ? "loading" : "ready");
    } else if (adoptingGuestDraft) {
      setError(null);
    }
  }, [authUserId, routeChallengeId, routeSeriesId, routeTitleId, workId]);

  useEffect(() => {
    if (!workId) {
      setHydrationStatus("ready");
      setHydrationError(null);
      setWorkRevision(undefined);
      setHydratedScope(null);
      setSharedMeta(null);
      return;
    }
    setStep("content");
    setPages([]);
    setTitle("");
    setDescription("");
    setTagsText("");
    setDirective(initialDirective());
    setBaseDoc({});
    setWorkRevision(undefined);
    setHydratedScope(null);
    setSharedMeta(null);
    setHydrationStatus("loading");
    setHydrationError(null);
    setSuccessMessage(null);
    if (!authUserId) {
      setHydrationStatus("error");
      setHydrationError("기존 작품을 열려면 참여 권한이 있는 계정으로 로그인해 주세요.");
      return;
    }
    const controller = new AbortController();
    const scope = captureStudioUploadPublishScope(authUserId, workId);
    void getStudioSharedDocument(workId, controller.signal)
      .then((shared) => {
        if (
          controller.signal.aborted ||
          !isStudioUploadPublishScopeCurrent(
            scope,
            currentScopeRef.current,
            mountedRef.current,
          )
        ) {
          return;
        }
        const loadedRevision = validateStudioUploadHydratedSharedDocument(shared, scope);
        const loadedDoc = isRecord(shared.document.doc) ? shared.document.doc : {};
        const pageMeta = Array.isArray(loadedDoc.pageMeta)
          ? (loadedDoc.pageMeta as Array<{
              width?: unknown;
              height?: unknown;
              name?: unknown;
            }>)
          : [];
        const loadedPages = shared.document.pages.map((src, index) => {
          const meta = pageMeta[index];
          return {
            id: uid(),
            src,
            width: Math.max(1, Number(meta?.width) || 1),
            height: Math.max(1, Number(meta?.height) || 1),
            name:
              typeof meta?.name === "string" && meta.name.trim()
                ? meta.name
                : `${index + 1}페이지`,
          };
        });
        const existingDirective = readCreatorPublicationDirective(loadedDoc);
        const suggested = suggestStudioPublicationSocialMetadata(
          shared.document.title,
          shared.document.description,
        );
        const loadedDirective = existingDirective ??
          normalizeCreatorPublicationDirective({
            ...initialDirective(),
            ...suggested,
          });
        const { document: _document, ...meta } = shared;
        setPages(loadedPages);
        setTitle(shared.document.title);
        setDescription(shared.document.description);
        setTagsText(shared.document.tags.join(", "));
        setDirective(loadedDirective);
        setBaseDoc(loadedDoc);
        setLinkedSeriesId(shared.document.seriesId);
        setLinkedChallengeId(shared.document.challengeId);
        setLinkedTitleId(shared.document.titleId);
        setWorkRevision(loadedRevision);
        setHydratedScope(scope);
        setSharedMeta(meta);
        setDirty(false);
        setHydrationStatus("ready");
        setHydrationError(null);
      })
      .catch((cause) => {
        if (
          controller.signal.aborted ||
          !isStudioUploadPublishScopeCurrent(
            scope,
            currentScopeRef.current,
            mountedRef.current,
          )
        ) {
          return;
        }
        setHydrationStatus("error");
        setHydrationError(
          cause instanceof Error ? cause.message : "작품을 불러오지 못했습니다.",
        );
      });
    return () => controller.abort();
  }, [authUserId, hydrationAttempt, workId]);

  useEffect(() => {
    if (
      !workId ||
      !authUserId ||
      hydrationStatus !== "ready" ||
      saving ||
      !sharedMeta ||
      !hydratedScope ||
      !isStudioUploadHydrationScopeCurrent(hydratedScope, currentScopeRef.current)
    ) {
      return;
    }
    const expectedMeta = sharedMeta;
    const scope = hydratedScope;
    let generation = 0;
    let activeController: AbortController | null = null;
    const failClosed = (message: string) => {
      setWorkRevision(undefined);
      setHydratedScope(null);
      setSharedMeta(null);
      setHydrationStatus("error");
      setHydrationError(message);
    };
    const revalidate = async () => {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      const requestGeneration = generation + 1;
      generation = requestGeneration;
      try {
        const fresh = await getStudioSharedDocumentMeta(workId, controller.signal);
        if (
          controller.signal.aborted ||
          requestGeneration !== generation ||
          !isStudioUploadPublishScopeCurrent(
            scope,
            currentScopeRef.current,
            mountedRef.current,
          )
        ) {
          return;
        }
        assertStudioUploadSharedMetaUnchanged(expectedMeta, fresh);
      } catch (cause) {
        if (
          controller.signal.aborted ||
          requestGeneration !== generation ||
          !isStudioUploadPublishScopeCurrent(
            scope,
            currentScopeRef.current,
            mountedRef.current,
          )
        ) {
          return;
        }
        failClosed(
          cause instanceof Error
            ? cause.message
            : "공동 문서 권한을 다시 확인하지 못했습니다. 작품을 다시 불러와 주세요.",
        );
      }
    };
    const onFocus = () => void revalidate();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void revalidate();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      generation += 1;
      activeController?.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [authUserId, hydratedScope, hydrationStatus, saving, sharedMeta, workId]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    async function loadContext() {
      const next: PublishContext = {};
      if (linkedSeriesId) {
        try {
          const series = await getSeries(linkedSeriesId, controller.signal);
          if (!alive) return;
          const maxEpisode = series.episodeList.reduce(
            (maximum, episode) => Math.max(maximum, episode.episodeNo ?? 0),
            0,
          );
          next.series = {
            id: series.id,
            title: series.title,
            nextEpisodeNo: maxEpisode + 1,
          };
        } catch {
          // Context is informative; save remains available when the banner request fails.
        }
      }
      if (linkedChallengeId) {
        try {
          const challenge = await getChallenge(linkedChallengeId, controller.signal);
          if (!alive) return;
          next.challenge = {
            id: challenge.id,
            title: challenge.title,
            theme: challenge.theme,
          };
        } catch {
          // Context is informative; server validation remains authoritative.
        }
      }
      if (alive) setPublishContext(next);
    }
    void loadContext();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [linkedChallengeId, linkedSeriesId]);

  function markChanged() {
    setDirty(true);
    setError(null);
    setSuccessMessage(null);
  }

  async function onPickImages(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (mutationLocked || files.length === 0) return;
    if (pages.length + files.length > MAX_PAGES) {
      setError(`이미지는 최대 ${MAX_PAGES}장까지 올릴 수 있어요.`);
      return;
    }
    try {
      assertStudioUploadSourceBatch(files);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "이미지 원본 크기를 확인하지 못했습니다.",
      );
      return;
    }
    setLoadingFiles(true);
    setError(null);
    setSuccessMessage(null);
    const fileScope = { authUserId, workId };
    const isFileScopeCurrent = () =>
      mountedRef.current &&
      currentScopeRef.current.authUserId === fileScope.authUserId &&
      currentScopeRef.current.workId === fileScope.workId;
    try {
      const next: UploadPage[] = [];
      const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
      const maximumPixels = selectStudioUploadDecodedPixelLimit({
        coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
        deviceMemoryGb: navigatorWithMemory.deviceMemory,
      });
      for (const file of files) {
        await inspectStudioUploadSourceImage(file, maximumPixels);
        if (!isFileScopeCurrent()) return;
        const scaled = await downscaleImageFile(file, 1600, 0.88);
        if (!isFileScopeCurrent()) return;
        next.push({
          id: uid(),
          src: scaled.src,
          width: scaled.width,
          height: scaled.height,
          name: file.name,
        });
      }
      if (!isFileScopeCurrent()) return;
      setPages((current) => [...current, ...next]);
      markChanged();
      if (!title.trim() && next[0]) {
        const base = next[0].name.replace(/\.[^.]+$/u, "").trim();
        if (base) setTitle(base.slice(0, 80));
      }
    } catch (cause) {
      if (isFileScopeCurrent()) {
        setError(cause instanceof Error ? cause.message : "이미지를 불러오지 못했습니다.");
      }
    } finally {
      if (isFileScopeCurrent()) setLoadingFiles(false);
    }
  }

  function movePage(id: string, direction: -1 | 1) {
    if (mutationLocked) return;
    setPages((current) => {
      const index = current.findIndex((page) => page.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
    markChanged();
  }

  function removePage(id: string) {
    if (mutationLocked) return;
    setPages((current) => current.filter((page) => page.id !== id));
    markChanged();
  }

  function completeSocialMetadata(
    source: CreatorPublicationDirective,
  ): CreatorPublicationDirective {
    const suggested = suggestStudioPublicationSocialMetadata(title, description);
    return normalizeCreatorPublicationDirective({
      ...source,
      socialTitle: source.socialTitle || suggested.socialTitle,
      socialDescription: source.socialDescription || suggested.socialDescription,
      canonicalSlug: source.canonicalSlug || suggested.canonicalSlug,
    });
  }

  function openDistribution() {
    if (policyEditable) {
      const completed = completeSocialMetadata(directive);
      if (JSON.stringify(completed) !== JSON.stringify(directive)) {
        setDirective(completed);
        markChanged();
      }
    }
    setStep("distribution");
  }

  function openReview() {
    if (policyEditable) {
      const completed = completeSocialMetadata(directive);
      if (JSON.stringify(completed) !== JSON.stringify(directive)) {
        setDirective(completed);
        markChanged();
      }
    }
    setStep("review");
  }

  async function handleSave(intent: SaveIntent) {
    if (publishAbortRef.current || saving) return;
    if (intent === "publish" && !preflight.canPublish) {
      setError("게시 사전검사의 오류를 해결한 뒤 다시 확인해 주세요.");
      setStep("distribution");
      return;
    }
    let publishScope: StudioUploadPublishScope;
    try {
      publishScope = captureStudioUploadPublishScope(authUserId, workId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "로그인 후 저장할 수 있어요.");
      return;
    }
    let baseRevision: number | undefined;
    try {
      baseRevision = resolveStudioUploadUpdateRevision(
        publishScope,
        hydratedScope,
        hydrationStatus,
        workRevision,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "기존 작품을 다시 불러와 주세요.");
      return;
    }
    const sharedMetaSnapshot = sharedMeta;
    if (publishScope.workId) {
      if (!sharedMetaSnapshot || !canEditStudioUploadSharedDocument(sharedMetaSnapshot)) {
        setError("현재 역할은 공동 원고를 저장할 수 없습니다.");
        return;
      }
      if (intent === "publish" && !canPublishStudioUploadSharedDocument(sharedMetaSnapshot)) {
        setError("공개 범위와 게시 상태는 작품 소유자만 변경할 수 있습니다.");
        return;
      }
    }
    if (!title.trim() || pages.length === 0) {
      setError(!title.trim() ? "작품 제목을 입력해 주세요." : "이미지를 1장 이상 추가해 주세요.");
      setStep("content");
      return;
    }

    const pageSnapshot = pages.map((page) => ({ ...page }));
    const titleSnapshot = title.trim();
    const descriptionSnapshot = description.trim();
    const tagsSnapshot = parseStudioPublicationTags(tagsText);
    const storedDirective = readCreatorPublicationDirective(baseDoc);
    const ownerControlsPolicy = !publishScope.workId || sharedMetaSnapshot?.role === "owner";
    let directiveSnapshot = ownerControlsPolicy ? directive : storedDirective;
    const requestedStatus = intent === "draft" ? "draft" : "published";
    let effectiveStatus = requestedStatus;
    if (directiveSnapshot) {
      effectiveStatus = resolveCreatorPublicationStatus(
        requestedStatus,
        directiveSnapshot,
      );
      if (
        intent === "publish" &&
        effectiveStatus === "published" &&
        directiveSnapshot.publishedAt === null
      ) {
        directiveSnapshot = markCreatorPublicationPublished(directiveSnapshot);
      }
    }
    const publishSeriesId = linkedSeriesId;
    const publishChallengeId = linkedChallengeId;
    const publishTitleId = linkedTitleId;
    const baseDocument = {
      ...baseDoc,
      format: "upload",
      pageMeta: pageSnapshot.map((page) => ({
        width: page.width,
        height: page.height,
        name: page.name,
      })),
    };
    const documentSnapshot = directiveSnapshot
      ? writeCreatorPublicationDirective(baseDocument, directiveSnapshot)
      : baseDocument;
    const controller = new AbortController();
    const requestId = publishRequestIdRef.current + 1;
    publishRequestIdRef.current = requestId;
    publishAbortRef.current = controller;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const pageImages = pageSnapshot.map((page) => page.src);
      const saved = await runStudioUploadPublishStages({
        scope: publishScope,
        currentScope: () => currentScopeRef.current,
        mounted: () => mountedRef.current,
        signal: controller.signal,
        downscale: () => downscaleDataUrl(pageImages[0] ?? "", 480),
        loadClient: async () =>
          publishScope.workId
            ? ({
                kind: "shared" as const,
                getMeta: getStudioSharedDocumentMeta,
                update: updateStudioSharedDocument,
              })
            : ({
                kind: "create" as const,
                module: await import("@/infrastructure/creator-client"),
              }),
        mutate: async (client, cover, signal) => {
          const editableContent = {
            title: titleSnapshot,
            description: descriptionSnapshot,
            tags: tagsSnapshot,
            cover,
            pages: pageImages,
            doc: documentSnapshot,
          };
          if (publishScope.workId) {
            if (
              client.kind !== "shared" ||
              baseRevision === undefined ||
              !sharedMetaSnapshot
            ) {
              throw new Error("공동 문서 저장 범위를 확인하지 못했어요.");
            }
            const fresh = await client.getMeta(publishScope.workId, signal);
            assertStudioUploadPublishScope(
              publishScope,
              currentScopeRef.current,
              mountedRef.current,
              signal,
            );
            assertStudioUploadSharedMetaUnchanged(sharedMetaSnapshot, fresh);
            if (!canEditStudioUploadSharedDocument(fresh)) {
              throw new Error("공동 문서 편집 권한이 변경되었습니다.");
            }
            if (intent === "publish" && !canPublishStudioUploadSharedDocument(fresh)) {
              throw new Error("공개 범위와 게시 상태는 작품 소유자만 변경할 수 있습니다.");
            }
            const patch = {
              baseRevision,
              crdtServerSequence: resolveStudioUploadSharedCrdtSaveFence(fresh),
              ...editableContent,
              ...(fresh.role === "owner"
                ? {
                    status: effectiveStatus,
                    ...(publishTitleId ? { titleId: publishTitleId } : {}),
                  }
                : {}),
            };
            assertStudioUploadJsonPayloadSize(patch);
            const response = await client.update(
              publishScope.workId,
              fresh.role,
              patch,
              signal,
            );
            return {
              workId: response.workId,
              revision: response.revision,
              updatedAt: response.updatedAt,
            };
          }
          if (client.kind !== "create") {
            throw new Error("새 작품 게시 클라이언트를 확인하지 못했어요.");
          }
          const payload = {
            ...editableContent,
            format: "upload" as const,
            titleId: publishTitleId ?? undefined,
            status: requestedStatus,
            seriesId: publishSeriesId ?? undefined,
            challengeId: publishChallengeId ?? undefined,
          };
          assertStudioUploadJsonPayloadSize(payload);
          const work = await client.module.createWork(payload, signal);
          return {
            workId: work.id,
            revision: validateStudioUploadSavedWork(work, publishScope, undefined),
            updatedAt: undefined,
          };
        },
      });
      assertStudioUploadPublishScope(
        publishScope,
        currentScopeRef.current,
        mountedRef.current,
        controller.signal,
      );
      if (saved.revision !== undefined) setWorkRevision(saved.revision);
      setBaseDoc(documentSnapshot);
      if (ownerControlsPolicy && directiveSnapshot) setDirective(directiveSnapshot);
      setDirty(false);
      if (publishScope.workId && sharedMetaSnapshot && saved.updatedAt) {
        const nextMeta = advanceStudioUploadSharedMetaAfterSave(sharedMetaSnapshot, {
          workId: saved.workId,
          revision: saved.revision ?? sharedMetaSnapshot.revision,
          updatedAt: saved.updatedAt,
        });
        setSharedMeta(nextMeta);
        if (
          sharedMetaSnapshot.role === "owner" &&
          intent === "publish" &&
          effectiveStatus === "published"
        ) {
          navigate(`/create/${saved.workId}`);
          return;
        }
        const revision = saved.revision ?? sharedMetaSnapshot.revision;
        const message =
          intent === "draft"
            ? `초안을 revision ${revision}로 안전하게 저장했습니다.`
            : directiveSnapshot?.visibility === "private"
              ? `비공개 원고를 revision ${revision}로 저장했습니다.`
              : directiveSnapshot?.mode === "scheduled"
                ? `${scheduleLabel(directiveSnapshot)} 예약을 revision ${revision}에 저장했습니다.`
                : `공동 변경사항을 revision ${revision}로 저장했습니다.`;
        setSuccessMessage(message);
      } else {
        navigate(`/create/${saved.workId}`);
      }
    } catch (cause) {
      if (
        !controller.signal.aborted &&
        !isStudioUploadPublishScopeInvalidatedError(cause) &&
        isStudioUploadPublishScopeCurrent(
          publishScope,
          currentScopeRef.current,
          mountedRef.current,
        )
      ) {
        if (
          publishScope.workId &&
          (isStudioUploadSharedAccessChangedError(cause) ||
            isStudioSharedDocumentAccessError(cause) ||
            isStudioSharedDocumentRevisionConflictError(cause))
        ) {
          setWorkRevision(undefined);
          setHydratedScope(null);
          setSharedMeta(null);
          setHydrationStatus("error");
          setHydrationError(
            cause instanceof Error
              ? cause.message
              : "공동 문서 권한 또는 버전이 변경되었습니다. 다시 불러와 주세요.",
          );
          setError(null);
        } else {
          setError(cause instanceof Error ? cause.message : "저장에 실패했어요.");
        }
      }
    } finally {
      if (publishAbortRef.current === controller) publishAbortRef.current = null;
      if (
        requestId === publishRequestIdRef.current &&
        isStudioUploadPublishScopeCurrent(
          publishScope,
          currentScopeRef.current,
          mountedRef.current,
        )
      ) {
        setSaving(false);
      }
    }
  }

  const currentStepIndex = COMMAND_STEPS.findIndex((candidate) => candidate.id === step);
  const primaryDisabled =
    !loggedIn ||
    publishLocked ||
    saving ||
    loadingFiles ||
    (step === "review" && !preflight.canPublish);
  const cover = pages[0]?.src ?? null;

  return (
    <Container size="wide" className={STUDIO_UPLOAD_CONTAINER_CLASS}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link
          href="/create"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-fg-3 transition-colors hover:text-fg"
        >
          <ArrowLeft size={15} />
          창작 게시판
        </Link>
        {!workId && (
          <Link
            href={buildStudioHref({
              seriesId: linkedSeriesId,
              challengeId: linkedChallengeId,
              titleId: linkedTitleId,
            })}
            className={buttonClass({
              size: "sm",
              variant: "outline",
              className: "ml-auto min-h-11 gap-1.5",
            })}
          >
            <PenLine size={14} />
            컷툰 스튜디오로 전환
          </Link>
        )}
      </div>

      <header className="mb-5 overflow-hidden rounded-2xl border border-line bg-panel/50 p-5 surface-hl sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-accent">PUBLISH COMMAND CENTER</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {workId ? "게시 설정 및 작품 수정" : "게시 명령 센터"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-2">
              원고 준비부터 공개 범위, 예약 시각, 독자 정책, 공유 카드와 최종 사전검사까지 한 흐름에서 확인합니다.
            </p>
          </div>
          <div className="grid min-w-40 grid-cols-2 gap-2 rounded-xl border border-line bg-canvas/65 p-2 text-center text-xs">
            <span className="rounded-lg bg-card/70 px-2 py-2 text-fg-3">
              페이지 <strong className="numeral block text-base text-fg">{pages.length}</strong>
            </span>
            <span className="rounded-lg bg-card/70 px-2 py-2 text-fg-3">
              검사 오류 <strong className={cn("numeral block text-base", preflight.errors.length ? "text-bad" : "text-good")}>{preflight.errors.length}</strong>
            </span>
          </div>
        </div>
      </header>

      <StudioPublishContextBanner context={publishContext} />

      {!loggedIn && (
        <div className="mb-4 rounded-xl border border-line bg-card/60 px-3 py-2 text-sm text-fg-2">
          이미지와 게시 설정을 미리 준비할 수 있지만, 서버 저장과 게시는 로그인 후 가능합니다.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad" role="alert">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mb-4 rounded-xl border border-good/40 bg-good/10 px-3 py-2 text-sm text-good" role="status" aria-live="polite">
          {successMessage}
        </div>
      )}
      {hydrating && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-line bg-card/60 px-3 py-2 text-sm text-fg-2" role="status" aria-busy="true">
          <Loader2 size={14} className="animate-spin motion-reduce:animate-none" />
          기존 작품과 게시 정책을 불러오는 중…
        </div>
      )}
      {workId && hydrationStatus === "error" && (
        <div className="mb-4 rounded-xl border border-bad/40 bg-bad/10 px-3 py-3" role="alert">
          <p className="text-sm font-semibold text-fg">게시 작업공간을 열지 못했어요</p>
          <p className="mt-1 text-sm leading-relaxed text-fg-2">
            {hydrationError ?? "작품을 다시 불러와 주세요."}
          </p>
          {dirty && (
            <p className="mt-2 text-xs leading-relaxed text-warn">
              화면의 미저장 변경은 보존되어 있습니다. 다시 불러오면 서버 원고로 교체됩니다.
            </p>
          )}
          <button
            type="button"
            disabled={!loggedIn || saving}
            className={buttonClass({ size: "sm", variant: "outline", className: "mt-3 min-h-11 gap-1.5" })}
            onClick={() => {
              void (async () => {
                if (dirty && !(await confirmStudioDestructiveAction(studioDiscardLocalChangesRequest()))) return;
                setHydrationAttempt((attempt) => attempt + 1);
              })();
            }}
          >
            <RefreshCw size={14} /> 다시 불러오기
          </button>
        </div>
      )}

      <nav aria-label="게시 단계" className="mb-5 grid gap-2 sm:grid-cols-3">
        {COMMAND_STEPS.map((candidate, index) => {
          const active = candidate.id === step;
          const complete = index < currentStepIndex;
          return (
            <button
              key={candidate.id}
              type="button"
              disabled={workspaceLocked}
              aria-current={active ? "step" : undefined}
              onClick={() => setStep(candidate.id)}
              className={cn(
                "flex min-h-16 items-center gap-3 rounded-xl border px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-60",
                active
                  ? "border-accent/60 bg-accent/10"
                  : "border-line bg-card/35 hover:border-accent/30 hover:bg-card/60",
              )}
            >
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border text-xs font-bold", active || complete ? "border-accent/50 bg-accent/15 text-accent" : "border-line text-fg-3")}>{complete ? <Check size={14} /> : index + 1}</span>
              <span>
                <span className="block text-sm font-semibold text-fg">{candidate.label}</span>
                <span className="block text-xs text-fg-3">{candidate.description}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {step === "content" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-line bg-panel/35 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <div>
                <h2 className="text-base font-bold text-fg">원고 이미지</h2>
                <p className="mt-1 text-xs text-fg-3">PNG·JPG·WebP, 최대 {MAX_PAGES}장 · 첫 이미지가 표지가 됩니다.</p>
              </div>
              <label className={cn(buttonClass({ size: "sm", variant: "outline", className: "ml-auto min-h-11 gap-1.5" }), mutationLocked && "pointer-events-none opacity-60")}>
                {loadingFiles ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                이미지 추가
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="sr-only"
                  disabled={mutationLocked}
                  onChange={onPickImages}
                />
              </label>
            </div>

            {pages.length === 0 ? (
              <label className={cn("mt-4 flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-canvas/35 px-6 text-center transition-colors hover:border-accent/45 hover:bg-accent/5", mutationLocked && "pointer-events-none opacity-60")}>
                <span className="grid size-12 place-items-center rounded-2xl bg-accent/10 text-accent"><Upload size={22} /></span>
                <span className="mt-3 text-sm font-semibold text-fg">완성 원고를 선택하세요</span>
                <span className="mt-1 max-w-sm text-xs leading-relaxed text-fg-3">디코딩 픽셀 수와 원본 배치 크기를 먼저 검사한 뒤 게시용 해상도로 안전하게 변환합니다.</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="sr-only"
                  disabled={mutationLocked}
                  onChange={onPickImages}
                />
              </label>
            ) : (
              <ol className={cn("mt-4", STUDIO_UPLOAD_PAGE_LIST_CLASS)}>
                {pages.map((page, index) => (
                  <li key={page.id} className={STUDIO_UPLOAD_PAGE_ROW_CLASS}>
                    <span className="numeral grid size-8 shrink-0 place-items-center rounded-lg bg-raised text-xs font-bold text-fg-2">{index + 1}</span>
                    <img src={page.src} alt="" className="h-20 w-14 shrink-0 rounded-lg border border-line object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{page.name}</span>
                      <span className="numeral mt-1 block text-xs text-fg-3">{page.width} × {page.height}px</span>
                    </span>
                    <span className={STUDIO_UPLOAD_PAGE_CONTROLS_CLASS}>
                      <button type="button" className={STUDIO_UPLOAD_PAGE_CONTROL_CLASS} disabled={mutationLocked || index === 0} onClick={() => movePage(page.id, -1)} aria-label={`${index + 1}번째 이미지를 위로 이동`}><ArrowUp size={14} /></button>
                      <button type="button" className={STUDIO_UPLOAD_PAGE_CONTROL_CLASS} disabled={mutationLocked || index === pages.length - 1} onClick={() => movePage(page.id, 1)} aria-label={`${index + 1}번째 이미지를 아래로 이동`}><ArrowDown size={14} /></button>
                      <button type="button" className={cn(STUDIO_UPLOAD_PAGE_CONTROL_CLASS, "text-bad")} disabled={mutationLocked} onClick={() => removePage(page.id)} aria-label={`${index + 1}번째 이미지 삭제`}><Trash2 size={14} /></button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-panel/35 p-4 sm:p-5">
            <h2 className="text-base font-bold text-fg">작품 정보</h2>
            <p className="mt-1 text-xs leading-relaxed text-fg-3">독자가 탐색 화면에서 작품을 이해하는 데 필요한 기본 정보를 작성합니다.</p>
            <div className="mt-4 space-y-3">
              <label className="block text-xs text-fg-2">
                제목 <span className="text-bad">*</span>
                <input
                  value={title}
                  maxLength={120}
                  disabled={mutationLocked}
                  onChange={(event) => { setTitle(event.target.value); markChanged(); }}
                  className="mt-1 h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-fg outline-none focus:border-accent/55 focus-visible:ring-2 focus-visible:ring-accent/35 disabled:opacity-60"
                  placeholder="작품 제목"
                />
              </label>
              <label className="block text-xs text-fg-2">
                작품 소개
                <textarea
                  value={description}
                  maxLength={1000}
                  rows={5}
                  disabled={mutationLocked}
                  onChange={(event) => { setDescription(event.target.value); markChanged(); }}
                  className="mt-1 w-full resize-y rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent/55 focus-visible:ring-2 focus-visible:ring-accent/35 disabled:opacity-60"
                  placeholder="장르, 분위기, 이번 화의 내용을 소개해 주세요."
                />
                <span className="numeral mt-1 block text-right text-[0.7rem] text-fg-3">{description.length}/1000</span>
              </label>
              <label className="block text-xs text-fg-2">
                태그 · 최대 8개
                <input
                  value={tagsText}
                  disabled={mutationLocked}
                  onChange={(event) => { setTagsText(event.target.value); markChanged(); }}
                  className="mt-1 h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-fg outline-none focus:border-accent/55 focus-visible:ring-2 focus-visible:ring-accent/35 disabled:opacity-60"
                  placeholder="일상, 코미디, 로맨스"
                />
              </label>
            </div>
          </section>
        </div>
      )}

      {step === "distribution" && (
        <div>
          {!policyEditable && (
            <div className="mb-4 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-fg-2">
              공동 편집자는 원고를 저장할 수 있지만 공개 범위·예약·독자 정책은 소유자만 변경할 수 있습니다.
            </div>
          )}
          <StudioPublicationControls
            directive={directive}
            title={title}
            description={description}
            cover={cover}
            preflight={preflight}
            disabled={mutationLocked || !policyEditable}
            onChange={(next) => { setDirective(next); markChanged(); }}
          />
        </div>
      )}

      {step === "review" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-line bg-panel/35 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <div>
                <p className="eyebrow text-accent">READER PREVIEW</p>
                <h2 className="mt-1 text-lg font-bold text-fg">독자 화면 최종 미리보기</h2>
              </div>
              <span className="ml-auto rounded-full border border-line bg-card/60 px-2.5 py-1 text-xs text-fg-3">
                {directive.readingMode === "vertical" ? "세로 스크롤" : directive.readingDirection === "rtl" ? "페이지 · 우→좌" : "페이지 · 좌→우"}
              </span>
            </div>
            <div className="mt-4 rounded-2xl border border-line bg-canvas p-3 sm:p-5">
              <div className="mx-auto max-w-[720px] overflow-hidden rounded-xl bg-black/5">
                {pages.length === 0 ? (
                  <div className="grid min-h-80 place-items-center text-sm text-fg-3">표시할 원고가 없습니다.</div>
                ) : directive.readingMode === "vertical" ? (
                  pages.map((page) => <img key={page.id} src={page.src} alt={`${title || "작품"} ${page.name}`} className="block h-auto w-full" />)
                ) : (
                  <div className="relative">
                    <img src={pages[0].src} alt={`${title || "작품"} 첫 페이지`} className="block h-auto w-full" />
                    <span className="absolute bottom-3 right-3 rounded-full bg-black/65 px-2.5 py-1 text-xs text-white">1 / {pages.length}</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-line bg-panel/35 p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-fg"><ShieldCheck size={15} className="text-accent" /> 게시 요약</h2>
              <dl className="mt-3 divide-y divide-line text-sm">
                <div className="flex items-start gap-3 py-2.5"><dt className="w-20 shrink-0 text-fg-3">공개 범위</dt><dd className="flex items-center gap-1.5 font-medium text-fg">{directive.visibility === "public" ? <Globe2 size={13} /> : directive.visibility === "unlisted" ? <Link2 size={13} /> : <LockKeyhole size={13} />}{visibilityLabel(directive)}</dd></div>
                <div className="flex items-start gap-3 py-2.5"><dt className="w-20 shrink-0 text-fg-3">공개 시점</dt><dd className="font-medium text-fg">{scheduleLabel(directive)}</dd></div>
                <div className="flex items-start gap-3 py-2.5"><dt className="w-20 shrink-0 text-fg-3">댓글</dt><dd className="font-medium text-fg">{directive.comments === "open" ? "허용" : "새 댓글 차단"}</dd></div>
                <div className="flex items-start gap-3 py-2.5"><dt className="w-20 shrink-0 text-fg-3">리믹스</dt><dd className="font-medium text-fg">{directive.allowRemix ? "허용" : "차단"}</dd></div>
                <div className="flex items-start gap-3 py-2.5"><dt className="w-20 shrink-0 text-fg-3">독자 등급</dt><dd className="font-medium text-fg">{directive.contentRating === "all" ? "전체 이용" : directive.contentRating === "teen" ? "청소년 주의" : "성인 대상"}</dd></div>
              </dl>
            </section>
            <section className={cn("rounded-2xl border p-4", preflight.errors.length ? "border-bad/40 bg-bad/5" : preflight.warnings.length ? "border-warn/40 bg-warn/5" : "border-good/40 bg-good/5")}>
              <h2 className="flex items-center gap-2 text-sm font-bold text-fg"><Eye size={15} className={preflight.errors.length ? "text-bad" : "text-good"} /> 최종 사전검사</h2>
              <p className="mt-2 text-xs leading-relaxed text-fg-2">오류 {preflight.errors.length}건 · 경고 {preflight.warnings.length}건</p>
              {preflight.issues.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {preflight.issues.slice(0, 8).map((issue) => <li key={`${issue.code}:${issue.path}`} className={cn("text-xs leading-relaxed", issue.severity === "error" ? "text-bad" : "text-fg-2")}>• {issue.message}</li>)}
                </ul>
              ) : (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-good"><Check size={13} /> 게시 가능한 상태입니다.</p>
              )}
            </section>
          </aside>
        </div>
      )}

      <div className={cn("mt-5", STUDIO_UPLOAD_ACTION_DOCK_CLASS)}>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-fg-3">
          {dirty ? <span className="inline-flex items-center gap-1.5 text-warn"><span className="size-2 rounded-full bg-warn" /> 저장되지 않은 변경</span> : <span className="inline-flex items-center gap-1.5 text-good"><Check size={13} /> 현재 revision 저장됨</span>}
          {sharedMeta && <span className="hidden sm:inline">· 역할 {sharedMeta.role}</span>}
        </div>
        <button
          type="button"
          disabled={!loggedIn || mutationLocked || saving || pages.length === 0 || !title.trim()}
          className={buttonClass({ size: "sm", variant: "outline", className: "min-h-11 gap-1.5" })}
          onClick={() => void handleSave("draft")}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          초안 저장
        </button>
        {step !== "content" && (
          <button type="button" disabled={workspaceLocked} className={buttonClass({ size: "sm", variant: "ghost", className: "min-h-11 gap-1" })} onClick={() => setStep(step === "review" ? "distribution" : "content")}><ChevronLeft size={15} /> 이전</button>
        )}
        {step === "content" && (
          <button type="button" disabled={workspaceLocked} className={buttonClass({ size: "sm", variant: "solid", className: "min-h-11 gap-1.5" })} onClick={openDistribution}>게시 설정 <ArrowRight size={15} /></button>
        )}
        {step === "distribution" && (
          <button type="button" disabled={workspaceLocked} className={buttonClass({ size: "sm", variant: "solid", className: "min-h-11 gap-1.5" })} onClick={openReview}>최종 확인 <ChevronRight size={15} /></button>
        )}
        {step === "review" && (
          <button type="button" disabled={primaryDisabled} className={buttonClass({ size: "sm", variant: "solid", className: "min-h-11 gap-1.5" })} onClick={() => void handleSave("publish")}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : directive.mode === "scheduled" ? <CalendarClock size={14} /> : <Send size={14} />}
            {publicationActionLabel(directive, Boolean(workId))}
          </button>
        )}
      </div>
    </Container>
  );
}
