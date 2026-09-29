/**
 * 오프라인 아웃박스 — 오프라인에서 한 작업(메모·댓글·설정 변경 등)을
 * 로컬에 쌓아두었다가 온라인 복귀 시 순서대로 동기화한다.
 *
 * 충돌이 감지되면 `conflicted` 상태로 두고 UI에서 사용자가
 * "내 것 유지 / 서버 것 사용"을 선택하게 한다.
 *
 * 저장은 Storage 어댑터로 추상화: 브라우저에서는 localStorage,
 * 테스트에서는 인메모리 어댑터를 쓴다.
 */

export type PwaOutboxStatus = "queued" | "syncing" | "synced" | "failed" | "conflicted";

export interface PwaOutboxConflict {
  readonly localUpdatedAt: number;
  readonly remoteUpdatedAt: number;
  readonly remoteLabel?: string;
}

export interface PwaOutboxItem<T = unknown> {
  readonly id: string;
  /** 작업 종류: "note" | "comment" | "drawing-meta" | "setting" 등 */
  readonly kind: string;
  /** 사람이 읽을 수 있는 설명 ("에피소드 3 메모") */
  readonly label: string;
  readonly payload: T;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly attempts: number;
  readonly status: PwaOutboxStatus;
  readonly lastError?: string;
  readonly conflict?: PwaOutboxConflict;
}

export interface PwaOutboxStorage {
  load(): PwaOutboxItem[];
  save(items: readonly PwaOutboxItem[]): void;
}

export interface PwaOutboxSyncReport {
  readonly synced: number;
  readonly failed: number;
  readonly conflicted: number;
  readonly remaining: number;
}

const MAX_ATTEMPTS = 5;

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `outbox-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function createMemoryOutboxStorage(
  initial: readonly PwaOutboxItem[] = [],
): PwaOutboxStorage {
  let items: PwaOutboxItem[] = [...initial];
  return {
    load: () => [...items],
    save: (next) => {
      items = [...next];
    },
  };
}

const OUTBOX_STORAGE_KEY = "toonstudio:pwa-offline-outbox:v1";

export function createLocalStorageOutboxStorage(key = OUTBOX_STORAGE_KEY): PwaOutboxStorage {
  return {
    load: () => {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as PwaOutboxItem[];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
    save: (items) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(items));
      } catch {
        // 저장 실패는 조용히 무시 — 메모리 상태는 유지된다.
      }
    },
  };
}

export class PwaOfflineOutbox {
  private readonly storage: PwaOutboxStorage;
  private readonly now: () => number;
  private listeners = new Set<() => void>();

  constructor(storage: PwaOutboxStorage, now: () => number = Date.now) {
    this.storage = storage;
    this.now = now;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private persist(items: readonly PwaOutboxItem[]): void {
    this.storage.save(items);
    this.emit();
  }

  list(): PwaOutboxItem[] {
    return this.storage.load();
  }

  pending(): PwaOutboxItem[] {
    return this.storage
      .load()
      .filter(
        (item) =>
          item.status === "queued" ||
          (item.status === "failed" && item.attempts < MAX_ATTEMPTS),
      );
  }

  enqueue<T>(kind: string, label: string, payload: T): PwaOutboxItem<T> {
    const at = this.now();
    const item: PwaOutboxItem<T> = {
      id: createId(),
      kind,
      label,
      payload,
      createdAt: at,
      updatedAt: at,
      attempts: 0,
      status: "queued",
    };
    this.persist([...this.storage.load(), item]);
    return item;
  }

  remove(id: string): void {
    this.persist(this.storage.load().filter((item) => item.id !== id));
  }

  /** 충돌 해결: "mine"이면 다시 큐에 넣고, "theirs"면 항목을 버린다. */
  resolveConflict(id: string, strategy: "mine" | "theirs"): void {
    const items = this.storage.load();
    const target = items.find((item) => item.id === id);
    if (!target || target.status !== "conflicted") return;
    if (strategy === "theirs") {
      this.persist(items.filter((item) => item.id !== id));
      return;
    }
    const at = this.now();
    this.persist(
      items.map((item) =>
        item.id === id
          ? { ...item, status: "queued" as const, conflict: undefined, updatedAt: at, attempts: 0 }
          : item,
      ),
    );
  }

  /**
   * 대기 중인 항목을 순서대로 동기화한다.
   * - syncOne이 성공하면 synced로 표시하고 목록에서 제거한다.
   * - PwaOutboxConflictError를 던지면 conflicted로 둔다.
   * - 그 외 오류는 failed로 두고 attempts를 올린다 (5회 초과 시에도 보관).
   */
  async syncAll(
    syncOne: (item: PwaOutboxItem) => Promise<void>,
    onProgress?: (done: number, total: number) => void,
  ): Promise<PwaOutboxSyncReport> {
    const queue = this.pending();
    let synced = 0;
    let failed = 0;
    let conflicted = 0;

    for (const [index, item] of queue.entries()) {
      const syncing: PwaOutboxItem = { ...item, status: "syncing", updatedAt: this.now() };
      this.persist(
        this.storage.load().map((entry) => (entry.id === item.id ? syncing : entry)),
      );
      try {
        await syncOne({ ...syncing });
        synced += 1;
        this.persist(this.storage.load().filter((entry) => entry.id !== item.id));
      } catch (error) {
        if (error instanceof PwaOutboxConflictError) {
          conflicted += 1;
          const at = this.now();
          this.persist(
            this.storage.load().map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: "conflicted" as const,
                    updatedAt: at,
                    conflict: {
                      localUpdatedAt: entry.updatedAt,
                      remoteUpdatedAt: error.remoteUpdatedAt,
                      remoteLabel: error.remoteLabel,
                    },
                  }
                : entry,
            ),
          );
        } else {
          failed += 1;
          const attempts = item.attempts + 1;
          this.persist(
            this.storage.load().map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: "failed" as const,
                    attempts,
                    updatedAt: this.now(),
                    lastError: error instanceof Error ? error.message : String(error),
                  }
                : entry,
            ),
          );
        }
      }
      onProgress?.(index + 1, queue.length);
      if (attemptsExceeded(item)) break;
    }

    const remaining = this.pending().length + this.storage.load()
      .filter((item) => item.status === "conflicted").length;
    return { synced, failed, conflicted, remaining };
  }
}

function attemptsExceeded(item: PwaOutboxItem): boolean {
  return item.attempts + 1 >= MAX_ATTEMPTS;
}

/** syncOne이 충돌을 알릴 때 던지는 오류. */
export class PwaOutboxConflictError extends Error {
  readonly remoteUpdatedAt: number;
  readonly remoteLabel?: string;

  constructor(remoteUpdatedAt: number, remoteLabel?: string) {
    super("outbox-conflict");
    this.name = "PwaOutboxConflictError";
    this.remoteUpdatedAt = remoteUpdatedAt;
    this.remoteLabel = remoteLabel;
  }
}

/** 앱 전역에서 공유하는 브라우저 아웃박스 (지연 생성). */
let browserOutbox: PwaOfflineOutbox | null = null;

export function getBrowserPwaOfflineOutbox(): PwaOfflineOutbox {
  if (!browserOutbox) {
    browserOutbox = new PwaOfflineOutbox(createLocalStorageOutboxStorage());
  }
  return browserOutbox;
}

/** 동기화 상태 변화를 앱 전역에 알리는 이벤트. */
export const PWA_OUTBOX_SYNC_EVENT = "toonstudio:outbox-sync";

export type PwaOutboxSyncPhase = "started" | "progress" | "finished";

export function dispatchPwaOutboxSyncEvent(
  phase: PwaOutboxSyncPhase,
  detail?: { done?: number; total?: number; report?: PwaOutboxSyncReport },
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PWA_OUTBOX_SYNC_EVENT, { detail: { phase, ...detail } }));
}
