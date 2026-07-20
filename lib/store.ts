import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import {
  MAX_COLLECTION_ID_LENGTH,
  normalizeCollectionClientId,
  normalizeCollectionEmoji,
  normalizeCollectionName,
} from "./collection-contract";
import {
  CollectionWriteThroughCoordinator,
  collectionAccountKey,
  collectionLaneKey,
  remapCollectionCommand,
  remapCollectionId,
  waitForCollectionMerge,
} from "./collection-write-through";
import { addRecentSearch, removeRecentSearch } from "./recent-searches";
import { toast } from "./toast-store";
import { deriveSavedTitleIds } from "./types";

import type {
  CollectionAuthFence,
  CollectionCommand,
  CollectionIdMap,
} from "./collection-write-through";
import type { ReadState, UserReview } from "./types";

// 로그인 시 변경을 DB API로 write-through (게스트는 localStorage만)
function apiPost(path: string, body: unknown, method = "POST") {
  if (typeof window === "undefined") return;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = useApp.getState().sessionToken;
  if (token) headers["x-user-id"] = token; // 서명 세션 토큰(서버가 검증해 실제 userId로 치환)
  fetch(path, { method, headers, body: JSON.stringify(body) }).catch(() => {});
}

export interface HydratePayload {
  ratings: Record<string, number>;
  reads: Record<string, ReadState>;
  subscriptions: Record<string, boolean>;
  reviews: Record<string, UserReview>;
  likedReviews: Record<string, boolean>;
  collections: Collection[];
  collectionIdMap?: CollectionIdMap;
}

export type RatingScale = "star" | "ten" | "hundred";

export interface Collection {
  id: string;
  name: string;
  emoji: string;
  titleIds: string[];
  createdAt: string;
}

export type CollectionRollback =
  | { kind: "create" }
  | { kind: "rename"; previousName: string; attemptedName: string }
  | { kind: "delete"; collection: Collection; index: number }
  | {
      kind: "set-item";
      titleId: string;
      previousIncluded: boolean;
      intendedIncluded: boolean;
    };

export interface CollectionOutboxEntry {
  mutationId: string;
  ownerId: string;
  command: CollectionCommand;
  rollback: CollectionRollback;
  recovery?: true;
}

export interface HydrateOptions {
  /** Collection revision captured before a server request started. */
  collectionRevision?: number;
  /** A request started while optimistic collection writes were still in flight. */
  preserveCollections?: boolean;
  /** Authenticated owner of a server snapshot. Omitted for an explicit local import. */
  ownerId?: string;
  /** Guest UUIDs remapped by the server because of an existing global ID collision. */
  collectionIdMap?: CollectionIdMap;
}

class CollectionRequestError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
    readonly status: number | null = null,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "CollectionRequestError";
  }
}

const collectionWriteThrough = new CollectionWriteThroughCoordinator();
const scheduledCollectionMutations = new Set<string>();
const COLLECTION_REQUEST_TIMEOUT_MS = 15_000;

function newClientCollectionId(): string {
  return globalThis.crypto.randomUUID();
}

function currentCollectionAuthFence(): CollectionAuthFence | null {
  const { userId, sessionToken, authGeneration } = useApp.getState();
  return userId && sessionToken
    ? { userId, sessionToken, generation: authGeneration }
    : null;
}

export function isCollectionAuthFenceCurrent(fence: CollectionAuthFence): boolean {
  const state = useApp.getState();
  return (
    state.userId === fence.userId &&
    state.sessionToken === fence.sessionToken &&
    state.authGeneration === fence.generation
  );
}

function isCollectionCommandResponse(
  command: CollectionCommand,
  payload: unknown
): boolean {
  if (!payload || typeof payload !== "object" || (payload as { ok?: unknown }).ok !== true) {
    return false;
  }
  const response = payload as Record<string, unknown>;
  if (response.id !== command.id) return false;
  if (command.action === "set-item") {
    return (
      response.titleId === command.titleId &&
      response.included === command.included
    );
  }
  return true;
}

async function sendCollectionCommand(
  fence: CollectionAuthFence,
  command: CollectionCommand
): Promise<void> {
  let response: Response;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutRequest = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new CollectionRequestError(
          "컬렉션 서버 응답 시간이 초과되었습니다.",
          true
        ));
      }, COLLECTION_REQUEST_TIMEOUT_MS);
    });
    response = await Promise.race([
      fetch("/api/me/collection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": fence.sessionToken,
        },
        body: JSON.stringify(command),
        signal: controller.signal,
      }),
      timeoutRequest,
    ]);
  } catch (error) {
    if (error instanceof CollectionRequestError) throw error;
    throw new CollectionRequestError("컬렉션 서버에 연결하지 못했습니다.", true, null, {
      cause: error,
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  if (!response.ok) {
    // Authentication failures are durable deferrals, not mutation rejection. A rotated token may
    // already be available for the coordinator's one retry; otherwise the outbox survives until
    // this owner signs in again.
    const transient =
      response.status === 401 ||
      response.status === 403 ||
      response.status === 408 ||
      response.status === 429 ||
      response.status >= 500;
    throw new CollectionRequestError(
      `컬렉션 요청이 실패했습니다. (${response.status})`,
      transient,
      response.status
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new CollectionRequestError("컬렉션 서버 응답을 확인할 수 없습니다.", false, response.status, {
      cause: error,
    });
  }
  if (!isCollectionCommandResponse(command, payload)) {
    throw new CollectionRequestError("컬렉션 서버 응답의 작업 식별자가 일치하지 않습니다.", false, response.status);
  }
}

function remapCollection(collection: Collection, idMap: CollectionIdMap): Collection {
  const id = remapCollectionId(collection.id, idMap);
  return id === collection.id ? collection : { ...collection, id };
}

function remapOutboxEntry(
  entry: CollectionOutboxEntry,
  idMap: CollectionIdMap
): CollectionOutboxEntry {
  const command = remapCollectionCommand(entry.command, idMap);
  const rollback = entry.rollback.kind === "delete"
    ? {
        ...entry.rollback,
        collection: remapCollection(entry.rollback.collection, idMap),
      }
    : entry.rollback;
  return command === entry.command && rollback === entry.rollback
    ? entry
    : { ...entry, command, rollback };
}

function applyCollectionRollback(
  collections: Collection[],
  command: CollectionCommand,
  rollback: CollectionRollback
): Collection[] {
  if (rollback.kind === "create") {
    return collections.some((collection) => collection.id === command.id)
      ? collections.filter((collection) => collection.id !== command.id)
      : collections;
  }

  if (rollback.kind === "rename") {
    const current = collections.find((collection) => collection.id === command.id);
    if (!current || current.name !== rollback.attemptedName) return collections;
    return collections.map((collection) =>
      collection.id === command.id
        ? { ...collection, name: rollback.previousName }
        : collection
    );
  }

  if (rollback.kind === "delete") {
    if (collections.some((collection) => collection.id === command.id)) return collections;
    const restored = [...collections];
    restored.splice(
      Math.min(Math.max(rollback.index, 0), restored.length),
      0,
      rollback.collection
    );
    return restored;
  }

  const current = collections.find((collection) => collection.id === command.id);
  if (!current) return collections;
  const currentlyIncluded = current.titleIds.includes(rollback.titleId);
  if (currentlyIncluded !== rollback.intendedIncluded) return collections;
  return collections.map((collection) => {
    if (collection.id !== command.id) return collection;
    return {
      ...collection,
      titleIds: rollback.previousIncluded
        ? [...collection.titleIds.filter((id) => id !== rollback.titleId), rollback.titleId]
        : collection.titleIds.filter((id) => id !== rollback.titleId),
    };
  });
}

function applyOptimisticCollectionCommand(
  collections: Collection[],
  command: CollectionCommand
): Collection[] {
  if (command.action === "create") {
    if (collections.some((collection) => collection.id === command.id)) return collections;
    return [
      ...collections,
      {
        id: command.id,
        name: command.name,
        emoji: command.emoji,
        titleIds: [],
        createdAt: new Date().toISOString(),
      },
    ];
  }
  if (command.action === "rename") {
    return collections.map((collection) =>
      collection.id === command.id ? { ...collection, name: command.name } : collection
    );
  }
  if (command.action === "delete") {
    return collections.filter((collection) => collection.id !== command.id);
  }
  return collections.map((collection) => {
    if (collection.id !== command.id) return collection;
    return {
      ...collection,
      titleIds: command.included
        ? [...collection.titleIds.filter((titleId) => titleId !== command.titleId), command.titleId]
        : collection.titleIds.filter((titleId) => titleId !== command.titleId),
    };
  });
}

function rebaseCollectionOutbox(
  serverCollections: Collection[],
  outbox: CollectionOutboxEntry[],
  ownerId: string
): Collection[] {
  return outbox
    .filter((entry) => entry.ownerId === ownerId)
    .reduce(
      (collections, entry) => applyOptimisticCollectionCommand(collections, entry.command),
      serverCollections
    );
}

function currentCollectionFenceForOwner(
  ownerId: string
): CollectionAuthFence | null {
  const state = useApp.getState();
  return state.userId === ownerId && state.sessionToken
    ? {
        userId: ownerId,
        sessionToken: state.sessionToken,
        generation: state.authGeneration,
      }
    : null;
}

function queueCollectionOutboxEntry(
  fence: CollectionAuthFence,
  entry: CollectionOutboxEntry
): void {
  if (scheduledCollectionMutations.has(entry.mutationId)) return;
  scheduledCollectionMutations.add(entry.mutationId);
  let resolvedEntry = entry;
  let mergeIdentityResolved = false;
  collectionWriteThrough.enqueue({
    accountKey: collectionAccountKey(fence),
    laneKey: collectionLaneKey(fence, entry.command.id),
    run: async () => {
      if (!mergeIdentityResolved) {
        let idMap: CollectionIdMap;
        try {
          idMap = await waitForCollectionMerge(entry.ownerId);
        } catch (error) {
          throw new CollectionRequestError(
            "게스트 컬렉션 병합이 끝나지 않아 변경을 보류했습니다.",
            true,
            null,
            { cause: error }
          );
        }
        resolvedEntry = remapOutboxEntry(entry, idMap);
        mergeIdentityResolved = true;
      }
      const activeFence = currentCollectionFenceForOwner(resolvedEntry.ownerId);
      if (!activeFence) {
        throw new CollectionRequestError(
          "해당 계정으로 다시 로그인할 때까지 컬렉션 변경을 보류합니다.",
          true
        );
      }
      await sendCollectionCommand(activeFence, resolvedEntry.command);
    },
    shouldRetry: (error) => error instanceof CollectionRequestError && error.transient,
    onSuccess: () => {
      scheduledCollectionMutations.delete(entry.mutationId);
      useApp.setState((state) => ({
        collectionOutbox: state.collectionOutbox.filter(
          (candidate) => candidate.mutationId !== entry.mutationId
        ),
      }));
    },
    onPermanentFailure: () => {
      scheduledCollectionMutations.delete(entry.mutationId);
      let rolledBack = false;
      useApp.setState((state) => {
        const collectionOutbox = state.collectionOutbox.filter(
          (candidate) => candidate.mutationId !== entry.mutationId
        );
        if (state.userId !== resolvedEntry.ownerId) return { collectionOutbox };
        const collections = applyCollectionRollback(
          state.collections,
          resolvedEntry.command,
          resolvedEntry.rollback
        );
        rolledBack = collections !== state.collections;
        return {
          collectionOutbox,
          ...(rolledBack
            ? {
                collections,
                collectionRevision: state.collectionRevision + 1,
              }
            : {}),
        };
      });
      if (useApp.getState().userId === resolvedEntry.ownerId) {
        toast(rolledBack
          ? "컬렉션 변경을 저장하지 못해 이전 상태로 되돌렸어요."
          : "컬렉션 변경을 저장하지 못했지만 더 최신인 로컬 상태는 유지했어요.");
      }
    },
    onTransientFailure: () => {
      scheduledCollectionMutations.delete(entry.mutationId);
      if (useApp.getState().userId === resolvedEntry.ownerId) {
        toast("컬렉션 변경을 이 기기의 동기화 대기열에 보관했어요. 연결이 복구되면 자동으로 다시 시도합니다.");
      }
    },
  });
}

export async function replayPendingCollectionWrites(
  fence: CollectionAuthFence
): Promise<void> {
  const entries = useApp.getState().collectionOutbox.filter(
    (entry) => entry.ownerId === fence.userId
  );
  for (const entry of entries) queueCollectionOutboxEntry(fence, entry);
  await collectionWriteThrough.waitForAccountIdle(collectionAccountKey(fence));
}

export function claimGuestCollectionsForOwner(fence: CollectionAuthFence): void {
  useApp.setState((state) => {
    const outbox = [...state.collectionOutbox];
    const hasCreate = new Set(
      outbox
        .filter((entry) => entry.ownerId === fence.userId && entry.command.action === "create")
        .map((entry) => entry.command.id)
    );
    const hasIncludedItem = new Set(
      outbox.flatMap((entry) =>
        entry.ownerId === fence.userId &&
        entry.command.action === "set-item" &&
        entry.command.included
          ? [`${entry.command.id}\u0000${entry.command.titleId}`]
          : []
      )
    );

    for (const collection of state.collections) {
      if (!hasCreate.has(collection.id)) {
        outbox.push({
          mutationId: newClientCollectionId(),
          ownerId: fence.userId,
          command: {
            action: "create",
            id: collection.id,
            name: normalizeCollectionName(collection.name),
            emoji: normalizeCollectionEmoji(collection.emoji),
          },
          rollback: { kind: "create" },
          recovery: true,
        });
        hasCreate.add(collection.id);
      }
      for (const rawTitleId of collection.titleIds) {
        const titleId = String(rawTitleId).trim().slice(0, MAX_COLLECTION_ID_LENGTH);
        const key = `${collection.id}\u0000${titleId}`;
        if (!titleId || hasIncludedItem.has(key)) continue;
        outbox.push({
          mutationId: newClientCollectionId(),
          ownerId: fence.userId,
          command: {
            action: "set-item",
            id: collection.id,
            titleId,
            included: true,
          },
          rollback: {
            kind: "set-item",
            titleId,
            previousIncluded: true,
            intendedIncluded: true,
          },
          recovery: true,
        });
        hasIncludedItem.add(key);
      }
    }

    return {
      libraryMergeOwnerId: fence.userId,
      collectionOutbox: outbox,
    };
  });
}

export function discardGuestCollectionRecovery(
  ownerId: string,
  mergedIdMap: CollectionIdMap
): void {
  const mergedClientIds = new Set(Object.keys(mergedIdMap));
  useApp.setState((state) => ({
    collectionOutbox: state.collectionOutbox.filter(
      (entry) =>
        entry.ownerId !== ownerId ||
        entry.recovery !== true ||
        !mergedClientIds.has(entry.command.id)
    ),
  }));
}

export function collectionMergeCollectionsForOwner(ownerId: string): Collection[] {
  const state = useApp.getState();
  return rebaseCollectionOutbox(state.collections, state.collectionOutbox, ownerId);
}

function appendOutboxEntry(
  outbox: CollectionOutboxEntry[],
  entry: CollectionOutboxEntry
): CollectionOutboxEntry[] {
  // Never drop an older create dependency merely to cap localStorage. Successful commands are
  // removed immediately, so this grows only while an account is offline and drains on reconnect.
  return [...outbox, entry];
}

function canonicalizeGuestCollections(collections: Collection[]): {
  collections: Collection[];
  idMap: CollectionIdMap;
} {
  const idMap: CollectionIdMap = {};
  for (const collection of collections) {
    const canonicalId = normalizeCollectionClientId(collection.id) ?? newClientCollectionId();
    if (canonicalId !== collection.id) idMap[collection.id] ??= canonicalId;
  }
  return {
    collections: Object.keys(idMap).length === 0
    ? collections
      : collections.map((collection) => remapCollection(collection, idMap)),
    idMap,
  };
}

function migrateGuestCollectionIds(collections: Collection[]): Collection[] {
  return canonicalizeGuestCollections(collections).collections;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isPersistedCollection(value: unknown): value is Collection {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.emoji === "string" &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.titleIds) &&
    value.titleIds.every((titleId) => typeof titleId === "string")
  );
}

function isPersistedCollectionCommand(value: unknown): value is CollectionCommand {
  if (!isRecord(value) || typeof value.action !== "string" || typeof value.id !== "string") {
    return false;
  }
  if (value.action === "create") {
    return typeof value.name === "string" && typeof value.emoji === "string";
  }
  if (value.action === "rename") return typeof value.name === "string";
  if (value.action === "delete") return true;
  return (
    value.action === "set-item" &&
    typeof value.titleId === "string" &&
    typeof value.included === "boolean"
  );
}

function isPersistedCollectionRollback(value: unknown): value is CollectionRollback {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "create") return true;
  if (value.kind === "rename") {
    return typeof value.previousName === "string" && typeof value.attemptedName === "string";
  }
  if (value.kind === "delete") {
    return (
      Number.isInteger(value.index) &&
      Number(value.index) >= 0 &&
      isPersistedCollection(value.collection)
    );
  }
  return (
    value.kind === "set-item" &&
    typeof value.titleId === "string" &&
    typeof value.previousIncluded === "boolean" &&
    typeof value.intendedIncluded === "boolean"
  );
}

function sanitizeCollectionOutbox(value: unknown): CollectionOutboxEntry[] {
  if (!Array.isArray(value)) return [];
  const seenMutationIds = new Set<string>();
  return value.filter((entry): entry is CollectionOutboxEntry => {
    if (
      !isRecord(entry) ||
      typeof entry.mutationId !== "string" ||
      typeof entry.ownerId !== "string" ||
      !isPersistedCollectionCommand(entry.command) ||
      !isPersistedCollectionRollback(entry.rollback) ||
      (entry.recovery !== undefined && entry.recovery !== true)
    ) {
      return false;
    }
    const matchingRollback = (
      (entry.command.action === "create" && entry.rollback.kind === "create") ||
      (entry.command.action === "rename" && entry.rollback.kind === "rename") ||
      (entry.command.action === "delete" && entry.rollback.kind === "delete") ||
      (entry.command.action === "set-item" && entry.rollback.kind === "set-item")
    );
    if (!matchingRollback || seenMutationIds.has(entry.mutationId)) return false;
    seenMutationIds.add(entry.mutationId);
    return true;
  });
}

interface AppState {
  ratings: Record<string, number>; // titleId -> 0.5~5
  reviews: Record<string, UserReview>; // titleId -> review
  reads: Record<string, ReadState>; // titleId -> 상태
  likedReviews: Record<string, boolean>; // reviewId -> liked
  subscriptions: Record<string, boolean>; // titleId -> 연재 알림 구독
  adultVerified: boolean; // 성인(만 19세+) — 생년월일 게이트로 설정(브라우저 저장)
  adultBirthdate: string | null; // 입력한 생년월일(ISO). 한번 입력하면 유지.
  ageGateOpen: boolean; // 연령 확인 모달 표시 여부
  collections: Collection[];
  collectionOutbox: CollectionOutboxEntry[]; // 계정별 서버 동기화 대기열(세션 토큰 미포함)
  recentlyViewed: string[]; // 최근 본 작품 titleId (최신순, 브라우저 저장)
  addRecentlyViewed: (titleId: string) => void;
  clearRecentlyViewed: () => void;
  recentSearches: string[]; // 최근 검색어(최신순, 브라우저 저장) — 검색 입력이 비었을 때 빠른 복귀
  addRecentSearch: (query: string) => void;
  removeRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  ratingScale: RatingScale;
  userId: string | null; // 로그인 사용자 (있으면 DB write-through)
  sessionToken: string | null; // 서명 세션 토큰(x-user-id 헤더로 전송)
  libraryOwnerId: string | null; // 서버 서재 snapshot 소유자(null이면 게스트 로컬 데이터)
  libraryMergeOwnerId: string | null; // 실패한 게스트 병합을 다른 계정으로 보내지 않는 durable claim
  authGeneration: number; // 계정 전환 뒤 늦은 응답이 새 계정 상태에 적용되지 않도록 하는 fence
  collectionRevision: number; // 낙관적 컬렉션 변경과 서버 hydrate의 순서를 비교하는 fence
  setSessionIdentity: (id: string | null, token: string | null) => void;
  hydrateFromServer: (data: HydratePayload, options?: HydrateOptions) => void;

  setRating: (titleId: string, rating: number) => void;
  clearRating: (titleId: string) => void;
  setRead: (titleId: string, state: ReadState | null) => void;
  upsertReview: (review: UserReview) => void;
  deleteReview: (titleId: string) => void;
  toggleLikeReview: (reviewId: string) => void;
  toggleSubscription: (titleId: string) => void;
  setAdultVerified: (v: boolean) => void;
  verifyAdultBirthdate: (iso: string) => boolean; // ≥19세면 true + 인증 저장
  openAgeGate: () => void;
  closeAgeGate: () => void;
  setRatingScale: (s: RatingScale) => void;

  createCollection: (name: string, emoji: string) => string;
  renameCollection: (id: string, name: string) => void;
  deleteCollection: (id: string) => void;
  toggleInCollection: (collectionId: string, titleId: string) => void;

  resetAll: () => void;
}

const seedCollections: Collection[] = [];

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      ratings: {},
      reviews: {},
      reads: {},
      likedReviews: {},
      subscriptions: {},
      adultVerified: false,
      adultBirthdate: null,
      ageGateOpen: false,
      collections: seedCollections,
      collectionOutbox: [],
      recentlyViewed: [],
      recentSearches: [],
      ratingScale: "star",
      userId: null,
      sessionToken: null,
      libraryOwnerId: null,
      libraryMergeOwnerId: null,
      authGeneration: 0,
      collectionRevision: 0,

      setSessionIdentity: (userId, sessionToken) =>
        set((state) => {
          if (state.userId === userId && state.sessionToken === sessionToken) return state;
          const claimedLibraryOwner = state.libraryOwnerId ?? state.libraryMergeOwnerId;
          const ownerChanged =
            (state.userId !== null && state.userId !== userId) ||
            (claimedLibraryOwner !== null && claimedLibraryOwner !== userId);
          return {
            userId,
            sessionToken,
            authGeneration: state.authGeneration + 1,
            ...(ownerChanged
              ? {
                  ratings: {},
                  reviews: {},
                  reads: {},
                  likedReviews: {},
                  subscriptions: {},
                  collections: [],
                  libraryOwnerId: null,
                  libraryMergeOwnerId: null,
                  collectionRevision: state.collectionRevision + 1,
                }
              : {}),
          };
        }),
      // 서버를 진실원천으로 교체(replace). 게스트 데이터는 로그인 시 /api/me/merge 가 먼저 서버로
      // 병합하므로 여기서 덮어써도 손실이 없고, 다른 기기에서의 삭제·변경도 정확히 반영된다.
      hydrateFromServer: (d, options) =>
        set((state) => {
          const idMap = options?.collectionIdMap ?? d.collectionIdMap ?? {};
          const collectionOutbox = options?.ownerId
            ? state.collectionOutbox.map((entry) =>
                entry.ownerId === options.ownerId
                  ? remapOutboxEntry(entry, idMap)
                  : entry
              )
            : state.collectionOutbox;
          const ownerOutbox = options?.ownerId
            ? collectionOutbox.filter((entry) => entry.ownerId === options.ownerId)
            : [];
          const revisionChanged =
            options?.collectionRevision !== undefined &&
            options.collectionRevision !== state.collectionRevision;
          const collections = options?.ownerId
            ? ownerOutbox.length > 0
              ? rebaseCollectionOutbox(d.collections, collectionOutbox, options.ownerId)
              : options.preserveCollections === true || revisionChanged
                ? state.collections.map((collection) => remapCollection(collection, idMap))
                : d.collections
            : migrateGuestCollectionIds(d.collections);
          return {
            ratings: d.ratings,
            reads: d.reads,
            subscriptions: d.subscriptions,
            reviews: d.reviews,
            likedReviews: d.likedReviews,
            ...(options?.ownerId
              ? { libraryOwnerId: options.ownerId, libraryMergeOwnerId: null }
              : {}),
            // Rebase optimistic commands over the authoritative snapshot. Preserving the entire
            // local array would hide pre-existing server collections during a guest merge.
            collections,
            collectionOutbox,
          };
        }),

      setRating: (titleId, rating) => {
        set((s) => ({ ratings: { ...s.ratings, [titleId]: rating } }));
        if (get().userId) apiPost("/api/me/rating", { titleId, value: rating });
      },
      clearRating: (titleId) => {
        set((s) => {
          const next = { ...s.ratings };
          delete next[titleId];
          return { ratings: next };
        });
        if (get().userId) apiPost("/api/me/rating", { titleId, value: null });
      },
      setRead: (titleId, state) => {
        set((s) => {
          const next = { ...s.reads };
          if (state === null) delete next[titleId];
          else next[titleId] = state;
          return { reads: next };
        });
        if (get().userId) apiPost("/api/me/read", { titleId, state });
      },
      upsertReview: (review) => {
        set((s) => ({
          reviews: { ...s.reviews, [review.titleId]: review },
          ratings: { ...s.ratings, [review.titleId]: review.rating },
        }));
        if (get().userId)
          apiPost("/api/me/review", {
            titleId: review.titleId,
            rating: review.rating,
            text: review.text,
            tags: review.tags,
            spoiler: review.spoiler,
          });
      },
      deleteReview: (titleId) => {
        set((s) => {
          const next = { ...s.reviews };
          delete next[titleId];
          return { reviews: next };
        });
        if (get().userId) apiPost("/api/me/review", { titleId }, "DELETE");
      },
      toggleLikeReview: (reviewId) => {
        set((s) => ({
          likedReviews: { ...s.likedReviews, [reviewId]: !s.likedReviews[reviewId] },
        }));
        if (get().userId) apiPost("/api/me/review-like", { reviewId });
      },
      toggleSubscription: (titleId) => {
        set((s) => ({
          subscriptions: { ...s.subscriptions, [titleId]: !s.subscriptions[titleId] },
        }));
        if (get().userId) apiPost("/api/me/subscription", { titleId });
      },
      setAdultVerified: (adultVerified) => set({ adultVerified }),
      openAgeGate: () => set({ ageGateOpen: true }),
      closeAgeGate: () => set({ ageGateOpen: false }),
      // 스팀식 자가 연령 확인 — 생년월일로 만 나이 계산, ≥19세면 인증(브라우저 persist). 신원확인 아님.
      verifyAdultBirthdate: (iso) => {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return false;
        const now = new Date();
        let age = now.getFullYear() - d.getFullYear();
        const m = now.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
        const ok = age >= 19;
        set((s) => ({ adultBirthdate: iso, adultVerified: ok, ageGateOpen: ok ? false : s.ageGateOpen }));
        return ok;
      },
      setRatingScale: (ratingScale) => set({ ratingScale }),

      createCollection: (name, emoji) => {
        const cleanName = normalizeCollectionName(name);
        if (!cleanName) return "";
        const id = newClientCollectionId();
        const cleanEmoji = normalizeCollectionEmoji(emoji);
        const fence = currentCollectionAuthFence();
        const outboxEntry: CollectionOutboxEntry | null = fence
          ? {
              mutationId: newClientCollectionId(),
              ownerId: fence.userId,
              command: { action: "create", id, name: cleanName, emoji: cleanEmoji },
              rollback: { kind: "create" },
            }
          : null;
        const revision = get().collectionRevision + 1;
        set((s) => ({
          collections: [
            ...s.collections,
            {
              id,
              name: cleanName,
              emoji: cleanEmoji,
              titleIds: [],
              createdAt: new Date().toISOString(),
            },
          ],
          collectionRevision: revision,
          ...(outboxEntry
            ? { collectionOutbox: appendOutboxEntry(s.collectionOutbox, outboxEntry) }
            : {}),
        }));
        if (fence && outboxEntry) queueCollectionOutboxEntry(fence, outboxEntry);
        return id;
      },
      addRecentlyViewed: (titleId) => {
        if (!titleId) return;
        set((s) => ({ recentlyViewed: [titleId, ...s.recentlyViewed.filter((id) => id !== titleId)].slice(0, 24) }));
      },
      clearRecentlyViewed: () => set({ recentlyViewed: [] }),
      // 최근 검색어 — 순수 헬퍼로 정규화·중복 제거·상한을 적용(부수효과 없음, 단위 테스트 가능).
      addRecentSearch: (query) =>
        set((s) => ({ recentSearches: addRecentSearch(s.recentSearches, query) })),
      removeRecentSearch: (query) =>
        set((s) => ({ recentSearches: removeRecentSearch(s.recentSearches, query) })),
      clearRecentSearches: () => set({ recentSearches: [] }),
      renameCollection: (id, name) => {
        const clean = normalizeCollectionName(name);
        const previous = get().collections.find((collection) => collection.id === id);
        if (!clean || !previous) return;
        if (previous.name === clean) return;
        const fence = currentCollectionAuthFence();
        const outboxEntry: CollectionOutboxEntry | null = fence
          ? {
              mutationId: newClientCollectionId(),
              ownerId: fence.userId,
              command: { action: "rename", id, name: clean },
              rollback: {
                kind: "rename",
                previousName: previous.name,
                attemptedName: clean,
              },
            }
          : null;
        const revision = get().collectionRevision + 1;
        set((s) => ({
          collections: s.collections.map((c) => (c.id === id ? { ...c, name: clean } : c)),
          collectionRevision: revision,
          ...(outboxEntry
            ? { collectionOutbox: appendOutboxEntry(s.collectionOutbox, outboxEntry) }
            : {}),
        }));
        if (fence && outboxEntry) queueCollectionOutboxEntry(fence, outboxEntry);
      },
      deleteCollection: (id) => {
        const index = get().collections.findIndex((collection) => collection.id === id);
        if (index < 0) return;
        const deleted = get().collections[index];
        if (!deleted) return;
        const fence = currentCollectionAuthFence();
        const outboxEntry: CollectionOutboxEntry | null = fence
          ? {
              mutationId: newClientCollectionId(),
              ownerId: fence.userId,
              command: { action: "delete", id },
              rollback: { kind: "delete", collection: deleted, index },
            }
          : null;
        const revision = get().collectionRevision + 1;
        set((s) => ({
          collections: s.collections.filter((c) => c.id !== id),
          collectionRevision: revision,
          ...(outboxEntry
            ? { collectionOutbox: appendOutboxEntry(s.collectionOutbox, outboxEntry) }
            : {}),
        }));
        if (fence && outboxEntry) queueCollectionOutboxEntry(fence, outboxEntry);
      },
      toggleInCollection: (collectionId, titleId) => {
        const previous = get().collections.find((collection) => collection.id === collectionId);
        if (!previous) return;
        const included = !previous.titleIds.includes(titleId);
        const fence = currentCollectionAuthFence();
        const outboxEntry: CollectionOutboxEntry | null = fence
          ? {
              mutationId: newClientCollectionId(),
              ownerId: fence.userId,
              command: {
                action: "set-item",
                id: collectionId,
                titleId,
                included,
              },
              rollback: {
                kind: "set-item",
                titleId,
                previousIncluded: !included,
                intendedIncluded: included,
              },
            }
          : null;
        const revision = get().collectionRevision + 1;
        set((s) => ({
          collections: s.collections.map((c) => {
            if (c.id !== collectionId) return c;
            return {
              ...c,
              titleIds: included
                ? [...c.titleIds.filter((t) => t !== titleId), titleId]
                : c.titleIds.filter((t) => t !== titleId),
            };
          }),
          collectionRevision: revision,
          ...(outboxEntry
            ? { collectionOutbox: appendOutboxEntry(s.collectionOutbox, outboxEntry) }
            : {}),
        }));
        if (fence && outboxEntry) queueCollectionOutboxEntry(fence, outboxEntry);
      },

      resetAll: () =>
        set({
          ratings: {},
          reviews: {},
          reads: {},
          likedReviews: {},
          subscriptions: {},
          collections: seedCollections,
          collectionOutbox: [],
          collectionRevision: get().collectionRevision + 1,
          recentlyViewed: [],
          recentSearches: [],
        }),
    }),
    {
      name: "toonspectrum-store",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        ratings: state.ratings,
        reviews: state.reviews,
        reads: state.reads,
        likedReviews: state.likedReviews,
        subscriptions: state.subscriptions,
        adultVerified: state.adultVerified,
        adultBirthdate: state.adultBirthdate,
        libraryOwnerId: state.libraryOwnerId,
        libraryMergeOwnerId: state.libraryMergeOwnerId,
        collections: state.collections,
        collectionOutbox: state.collectionOutbox,
        recentlyViewed: state.recentlyViewed,
        recentSearches: state.recentSearches,
        ratingScale: state.ratingScale,
      }),
      // Older v1 snapshots included auth fields because partialize was absent. Merge only the
      // intended local-library data so a stale token can never be revived from this second store.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AppState>;
        const libraryOwnerId =
          saved.libraryOwnerId ??
          (typeof saved.userId === "string" ? saved.userId : current.libraryOwnerId);
        const savedCollections = saved.collections ?? current.collections;
        const canonicalGuest = libraryOwnerId === null
          ? canonicalizeGuestCollections(savedCollections)
          : { collections: savedCollections, idMap: {} };
        const savedOutbox = sanitizeCollectionOutbox(saved.collectionOutbox).map((entry) =>
          remapOutboxEntry(entry, canonicalGuest.idMap)
        );
        return {
          ...current,
          ratings: saved.ratings ?? current.ratings,
          reviews: saved.reviews ?? current.reviews,
          reads: saved.reads ?? current.reads,
          likedReviews: saved.likedReviews ?? current.likedReviews,
          subscriptions: saved.subscriptions ?? current.subscriptions,
          adultVerified: saved.adultVerified ?? current.adultVerified,
          adultBirthdate: saved.adultBirthdate ?? current.adultBirthdate,
          libraryOwnerId,
          libraryMergeOwnerId:
            typeof saved.libraryMergeOwnerId === "string"
              ? saved.libraryMergeOwnerId
              : null,
          collections: canonicalGuest.collections,
          collectionOutbox: savedOutbox,
          recentlyViewed: saved.recentlyViewed ?? current.recentlyViewed,
          recentSearches: saved.recentSearches ?? current.recentSearches,
          ratingScale: saved.ratingScale ?? current.ratingScale,
          userId: null,
          sessionToken: null,
          authGeneration: 0,
          collectionRevision: 0,
        };
      },
    }
  )
);

export interface CollectionHydrationFence extends CollectionAuthFence {
  collectionRevision: number;
  preserveCollections: boolean;
}

export function captureCollectionHydrationFence(): CollectionHydrationFence | null {
  const fence = currentCollectionAuthFence();
  if (!fence) return null;
  return {
    ...fence,
    collectionRevision: useApp.getState().collectionRevision,
    preserveCollections:
      collectionWriteThrough.hasPending(collectionAccountKey(fence)) ||
      useApp.getState().collectionOutbox.some((entry) => entry.ownerId === fence.userId),
  };
}

// SSR/CSR 하이드레이션 가드 — persist 가 클라이언트에서 채워질 때까지 false.
// useSyncExternalStore 로 외부(persist) 상태를 구독 (effect 내 setState 없이 SSR 안전).
export function useHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useApp.persist.onFinishHydration(cb),
    () => useApp.persist.hasHydrated(),
    () => false
  );
}

// 파생 셀렉터 헬퍼 — '관심(want)'만 북마크로 간주
export function useIsBookmarked(titleId: string): boolean {
  return useApp((s) => s.reads[titleId] === "want");
}

// '내 찜·서재' = 사용자가 저장/구독/컬렉션에 담은 모든 작품 id 집합(하차 제외).
// 페이지 필터의 "내 찜만 보기"에 사용. 합집합 규칙은 @toonspectrum/core 의 순수
// deriveSavedTitleIds 로 추출돼 웹·토스가 공유한다(세 레코드 참조는 안정적이라 React Compiler가 메모이즈).
export function useSavedTitleIds(): Set<string> {
  const reads = useApp((s) => s.reads);
  const subscriptions = useApp((s) => s.subscriptions);
  const collections = useApp((s) => s.collections);
  return deriveSavedTitleIds(reads, subscriptions, collections);
}
