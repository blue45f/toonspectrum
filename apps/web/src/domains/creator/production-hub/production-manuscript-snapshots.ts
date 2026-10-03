import type { StudioRevisionRecord } from "../project-graph/studio-project-graph-contract";

/**
 * 원클릭 버전 스냅샷의 로컬 캐시 (CT-1 서버 정본화 반영).
 * 스냅샷은 현재 HEAD revision의 참조(revisionId + rootGraphHash)를
 * 이름·메모와 함께 보존하는 기록이며, ProjectGraph의 불변 revision 이력을
 * 대체하지 않는다. 정본은 서버(studio_manuscript_snapshot)이고 이 테이블은
 * 오프라인 폴백·화면 동기화 캐시다 — 동기화는
 * production-manuscript-version-share-sync.ts가 맡는다.
 */
export interface ProductionManuscriptSnapshot {
  readonly id: string;
  readonly artifactId: string;
  /** 자동 생성 이름: v1, v2, ... */
  readonly name: string;
  readonly memo: string;
  readonly createdAt: string;
  /** 스냅샷 시점의 HEAD revision 참조 */
  readonly revisionId: string;
  readonly rootGraphHash: string;
  readonly revisionKind: StudioRevisionRecord["kind"];
  readonly revisionMessage: string | null;
}

export interface ProductionManuscriptSnapshotSource {
  readonly revisionId: string;
  readonly rootGraphHash: string;
  readonly revisionKind: StudioRevisionRecord["kind"];
  readonly revisionMessage: string | null;
}

const STORAGE_KEY = "toonstudio.manuscript-snapshots.v1";
const MAX_SNAPSHOTS_PER_ARTIFACT = 60;

type SnapshotTable = Record<string, readonly ProductionManuscriptSnapshot[]>;

function storageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readTable(): SnapshotTable {
  if (!storageAvailable()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const table: SnapshotTable = {};
    for (const [artifactId, entries] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      const snapshots = entries.filter((entry): entry is ProductionManuscriptSnapshot =>
        Boolean(entry)
        && typeof entry === "object"
        && typeof (entry as { id?: unknown }).id === "string"
        && typeof (entry as { name?: unknown }).name === "string"
        && typeof (entry as { revisionId?: unknown }).revisionId === "string"
        && typeof (entry as { createdAt?: unknown }).createdAt === "string");
      if (snapshots.length > 0) table[artifactId] = Object.freeze(snapshots);
    }
    return table;
  } catch {
    return {};
  }
}

function writeTable(table: SnapshotTable): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(table));
  } catch {
    // 저장 공간 부족 등에서는 조용히 무시하고 메모리 상태만 유지한다.
  }
}

function versionNumber(name: string): number | null {
  const match = /^v(\d+)$/u.exec(name.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function byNewest(
  left: ProductionManuscriptSnapshot,
  right: ProductionManuscriptSnapshot,
): number {
  return right.createdAt.localeCompare(left.createdAt)
    || (versionNumber(right.name) ?? 0) - (versionNumber(left.name) ?? 0)
    || right.id.localeCompare(left.id);
}

export function listProductionManuscriptSnapshots(
  artifactId: string,
): readonly ProductionManuscriptSnapshot[] {
  return Object.freeze([...(readTable()[artifactId] ?? [])].sort(byNewest));
}

export function nextProductionManuscriptSnapshotName(artifactId: string): string {
  const highest = listProductionManuscriptSnapshots(artifactId)
    .map((snapshot) => versionNumber(snapshot.name) ?? 0)
    .reduce((max, value) => Math.max(max, value), 0);
  return `v${highest + 1}`;
}

function newSnapshotId(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/gu, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `manuscript-snapshot-${Date.now().toString(36)}-${random}`;
}

/**
 * 현재 원고 상태의 참조를 한 번의 호출로 스냅샷으로 저장한다. 같은 revision을
 * 다시 찍어도 덮어쓰지 않고 새 버전을 추가한다.
 */
export function createProductionManuscriptSnapshot(
  artifactId: string,
  source: ProductionManuscriptSnapshotSource,
  memo = "",
): ProductionManuscriptSnapshot | null {
  if (!artifactId || !source.revisionId) return null;
  const table = readTable();
  const snapshot: ProductionManuscriptSnapshot = Object.freeze({
    id: newSnapshotId(),
    artifactId,
    name: nextProductionManuscriptSnapshotName(artifactId),
    memo: memo.trim().slice(0, 200),
    createdAt: new Date().toISOString(),
    revisionId: source.revisionId,
    rootGraphHash: source.rootGraphHash,
    revisionKind: source.revisionKind,
    revisionMessage: source.revisionMessage,
  });
  const next = [...(table[artifactId] ?? []), snapshot]
    .sort(byNewest)
    .slice(0, MAX_SNAPSHOTS_PER_ARTIFACT);
  writeTable({ ...table, [artifactId]: Object.freeze(next) });
  return snapshot;
}

/**
 * 서버 정본 스냅샷 목록을 로컬 캐시에 병합한다 (CT-1).
 * 같은 id는 서버 값으로 교체하고, 서버에 아직 없는 로컬 전용 스냅샷
 * (오프라인 생성·업로드 대기)은 보존한다. 반환값은 병합 뒤의 전체 목록이다.
 */
export function mergeProductionManuscriptSnapshots(
  artifactId: string,
  incoming: readonly ProductionManuscriptSnapshot[],
): readonly ProductionManuscriptSnapshot[] {
  const table = readTable();
  const local = table[artifactId] ?? [];
  const incomingIds = new Set(incoming.map((snapshot) => snapshot.id));
  const localOnly = local.filter((snapshot) => !incomingIds.has(snapshot.id));
  const merged = [...localOnly, ...incoming]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name, "ko"))
    .slice(-MAX_SNAPSHOTS_PER_ARTIFACT);
  table[artifactId] = merged;
  writeTable(table);
  return listProductionManuscriptSnapshots(artifactId);
}

export function updateProductionManuscriptSnapshotMemo(
  artifactId: string,
  snapshotId: string,
  memo: string,
): readonly ProductionManuscriptSnapshot[] {
  const table = readTable();
  const current = table[artifactId] ?? [];
  const next = current.map((snapshot) => snapshot.id === snapshotId
    ? { ...snapshot, memo: memo.trim().slice(0, 200) }
    : snapshot);
  writeTable({ ...table, [artifactId]: Object.freeze(next) });
  return listProductionManuscriptSnapshots(artifactId);
}

/** 같은 원고(artifact)의 두 스냅샷은 항상 겹치기 비교 대상이 될 수 있다. */
export function manuscriptSnapshotOverlayAllowed(
  left: ProductionManuscriptSnapshot,
  right: ProductionManuscriptSnapshot,
): boolean {
  return left.artifactId === right.artifactId && left.id !== right.id;
}
