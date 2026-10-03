import { useCallback, useEffect, useRef } from "react";

import {
  listProductionManuscriptSnapshots,
  mergeProductionManuscriptSnapshots,
  type ProductionManuscriptSnapshot,
} from "./production-manuscript-snapshots";
import {
  listVersionShareLinks,
  mergeVersionShareLinks,
  type VersionShareLink,
} from "./one-click-version-share-model";
import {
  createServerManuscriptSnapshot,
  createServerVersionShare,
  fetchServerManuscriptSnapshots,
  fetchServerVersionShares,
  revokeServerVersionShare,
  updateServerManuscriptSnapshotMemo,
  type ServerManuscriptSnapshot,
  type ServerVersionShareLink,
} from "./production-manuscript-version-share-api";

/**
 * CT-1 클라이언트 동기화: 서버 정본 ↔ 로컬 캐시.
 *
 * 원칙:
 * - 읽기는 서버가 정본이다. 서버 목록을 받아 로컬 캐시에 병합하고,
 *   서버에 없는 로컬 전용 기록(오프라인 생성)은 업로드해서 정본에 올린다.
 * - 서버 호출이 실패하면(미로그인·오프라인·서버에 없는 아티팩트) 조용히
 *   로컬 전용 모드로 남는다 — 기존 로컬 동작이 그대로 유지된다.
 * - 메모처럼 로컬에서만 바뀌는 값은 병합 전에 서버로 밀어 넣어 유실을 막는다.
 * - 로컬에서 회수한 링크는 서버에도 회수를 전파한다.
 */

const MIGRATED_KEY = "toonstudio.manuscript-version-share.migrated.v1";

const REVISION_KINDS: readonly ProductionManuscriptSnapshot["revisionKind"][] = [
  "autosave",
  "checkpoint",
  "submission",
  "review-snapshot",
  "approved",
  "release",
];

function markMigrated(artifactId: string): void {
  try {
    const raw = globalThis.localStorage?.getItem(MIGRATED_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    parsed[artifactId] = new Date().toISOString();
    globalThis.localStorage?.setItem(MIGRATED_KEY, JSON.stringify(parsed));
  } catch {
    // 표시는 정보용이라 실패를 무시한다.
  }
}

/** 서버가 돌려준 revision 종류 문자열을 로컬 종류 타입으로 좁힌다. 모르는 종류면 null. */
export function toProductionRevisionKind(
  kind: string,
): ProductionManuscriptSnapshot["revisionKind"] | null {
  return REVISION_KINDS.find((candidate) => candidate === kind) ?? null;
}

export function serverSnapshotToLocal(
  server: ServerManuscriptSnapshot,
): ProductionManuscriptSnapshot | null {
  const kind = toProductionRevisionKind(server.revisionKind);
  if (!kind) return null;
  return {
    id: server.id,
    artifactId: server.artifactId,
    name: server.name,
    memo: server.memo,
    createdAt: server.createdAt,
    revisionId: server.revisionId,
    rootGraphHash: server.rootGraphHash,
    revisionKind: kind,
    revisionMessage: server.revisionMessage,
  };
}

export function serverShareToLocal(server: ServerVersionShareLink): VersionShareLink {
  const createdAtMs = new Date(server.createdAt).getTime();
  const expiresAtMs = server.expiresAt ? new Date(server.expiresAt).getTime() : null;
  const expiresInDays = expiresAtMs === null
    ? 0
    : Math.max(0, Math.round((expiresAtMs - createdAtMs) / 86_400_000));
  return {
    id: server.id,
    artifactId: server.artifactId,
    snapshotId: server.snapshotId,
    snapshotName: server.snapshotName,
    // 서버는 원문 토큰을 돌려주지 않는다 — 접미사만으로 마스킹 표시한다.
    token: "",
    url: `/share/version/…${server.tokenSuffix}`,
    settings: {
      permission: server.permission,
      expiresInDays,
      watermark: server.watermark,
      password: server.hasPassword ? "••••" : "",
    },
    createdAt: server.createdAt,
    expiresAt: server.expiresAt,
    revoked: server.revokedAt !== null,
  };
}

export interface ManuscriptVersionShareSyncResult {
  readonly snapshots: readonly ProductionManuscriptSnapshot[];
  readonly links: readonly VersionShareLink[];
}

const inFlight = new Map<string, Promise<ManuscriptVersionShareSyncResult | null>>();

async function runSync(
  artifactId: string,
): Promise<ManuscriptVersionShareSyncResult | null> {
  let serverSnapshots: ServerManuscriptSnapshot[];
  let serverShares: ServerVersionShareLink[];
  try {
    [serverSnapshots, serverShares] = await Promise.all([
      fetchServerManuscriptSnapshots(artifactId),
      fetchServerVersionShares(artifactId),
    ]);
  } catch {
    return null;
  }

  const serverSnapshotIds = new Set(serverSnapshots.map((snapshot) => snapshot.id));
  const serverShareById = new Map(serverShares.map((share) => [share.id, share]));

  const localSnapshots = listProductionManuscriptSnapshots(artifactId);
  const localLinks = listVersionShareLinks(artifactId);
  const localSnapshotById = new Map(localSnapshots.map((snapshot) => [snapshot.id, snapshot]));

  // 1) 서버에 알려진 스냅샷의 메모가 로컬에서 바뀌었으면 먼저 서버로 밀어 넣는다.
  for (const serverSnapshot of serverSnapshots) {
    const local = localSnapshotById.get(serverSnapshot.id);
    if (local && local.memo !== serverSnapshot.memo) {
      try {
        const updated = await updateServerManuscriptSnapshotMemo(
          artifactId,
          serverSnapshot.id,
          local.memo,
        );
        serverSnapshots = serverSnapshots.map((candidate) =>
          candidate.id === updated.id ? updated : candidate);
      } catch {
        // 메모 전파 실패는 다음 동기화에서 다시 시도한다.
      }
    }
  }

  // 2) 로컬 전용 스냅샷을 서버로 올린다(기존 로컬 데이터 1회 이전 경로).
  for (const local of localSnapshots) {
    if (serverSnapshotIds.has(local.id)) continue;
    try {
      const created = await createServerManuscriptSnapshot(artifactId, {
        id: local.id,
        name: local.name,
        memo: local.memo,
        revisionId: local.revisionId,
        createdAt: local.createdAt,
      });
      serverSnapshotIds.add(created.id);
      serverSnapshots = [...serverSnapshots, created];
    } catch {
      // 서버에 없는 revision(데모 데이터 등)은 로컬 전용으로 남긴다.
    }
  }

  // 3) 로컬에서 회수한 링크의 회수를 서버로 전파한다.
  for (const local of localLinks) {
    const serverShare = serverShareById.get(local.id);
    if (local.revoked && serverShare && serverShare.revokedAt === null) {
      try {
        const revoked = await revokeServerVersionShare(artifactId, local.id);
        serverShareById.set(revoked.id, revoked);
      } catch {
        // 전파 실패는 다음 동기화에서 다시 시도한다.
      }
    }
  }

  // 4) 로컬 전용 링크를 서버로 올린다. 스냅샷이 서버에 있는 링크만 대상이고,
  //    이미 만료된 링크는 올리지 않는다(서버 만료는 생성 시각 기준이라 수명이 늘어난다).
  const nowMs = Date.now();
  for (const local of localLinks) {
    if (serverShareById.has(local.id)) continue;
    if (!serverSnapshotIds.has(local.snapshotId)) continue;
    if (local.expiresAt && new Date(local.expiresAt).getTime() <= nowMs) continue;
    const remainingDays = local.expiresAt
      ? Math.round((new Date(local.expiresAt).getTime() - nowMs) / 86_400_000)
      : 0;
    try {
      const created = await createServerVersionShare(artifactId, {
        id: local.id,
        snapshotId: local.snapshotId,
        token: local.token,
        permission: local.settings.permission,
        expiresInDays: local.expiresAt ? Math.max(1, remainingDays) : 0,
        watermark: local.settings.watermark,
        password: local.settings.password || undefined,
      });
      serverShareById.set(created.id, created);
      if (local.revoked) {
        const revoked = await revokeServerVersionShare(artifactId, created.id);
        serverShareById.set(revoked.id, revoked);
      }
    } catch {
      // 업로드 실패 링크는 로컬 전용으로 남긴다.
    }
  }

  markMigrated(artifactId);

  const mergedSnapshots = mergeProductionManuscriptSnapshots(
    artifactId,
    serverSnapshots
      .map(serverSnapshotToLocal)
      .filter((snapshot): snapshot is ProductionManuscriptSnapshot => snapshot !== null),
  );
  const mergedLinks = mergeVersionShareLinks(
    artifactId,
    [...serverShareById.values()].map(serverShareToLocal),
  );
  return { snapshots: mergedSnapshots, links: mergedLinks };
}

/** 아티팩트 단위 동기화. 동시 호출은 하나로 합친다. 서버에 닿지 않으면 null. */
export function syncManuscriptVersionShare(
  artifactId: string,
): Promise<ManuscriptVersionShareSyncResult | null> {
  const pending = inFlight.get(artifactId);
  if (pending) return pending;
  const promise = runSync(artifactId).finally(() => {
    inFlight.delete(artifactId);
  });
  inFlight.set(artifactId, promise);
  return promise;
}

/**
 * 패널 마운트 시 1회 동기화하고, 변경 직후 다시 동기화할 requestSync를 돌려준다.
 * 동기화로 로컬 캐시가 바뀌면 onSynced(패널의 refresh)를 불러 화면을 맞춘다.
 */
export function useManuscriptVersionShareSync(
  artifactId: string,
  onSynced: () => void,
): { readonly requestSync: () => void } {
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const requestSync = useCallback(() => {
    void syncManuscriptVersionShare(artifactId).then((result) => {
      if (result) onSyncedRef.current();
    });
  }, [artifactId]);

  useEffect(() => {
    let cancelled = false;
    void syncManuscriptVersionShare(artifactId).then((result) => {
      if (!cancelled && result) onSyncedRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [artifactId]);

  return { requestSync };
}
