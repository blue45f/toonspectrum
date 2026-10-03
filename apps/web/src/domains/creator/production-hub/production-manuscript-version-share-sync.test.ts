// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createProductionManuscriptSnapshot,
  listProductionManuscriptSnapshots,
  mergeProductionManuscriptSnapshots,
} from "./production-manuscript-snapshots";
import {
  createVersionShareLink,
  listVersionShareLinks,
  mergeVersionShareLinks,
  revokeVersionShareLink,
} from "./one-click-version-share-model";
import type {
  ServerManuscriptSnapshot,
  ServerVersionShareLink,
} from "./production-manuscript-version-share-api";
import * as serverApi from "./production-manuscript-version-share-api";
import {
  serverShareToLocal,
  serverSnapshotToLocal,
  syncManuscriptVersionShare,
  toProductionRevisionKind,
} from "./production-manuscript-version-share-sync";

vi.mock("./production-manuscript-version-share-api", () => ({
  fetchServerManuscriptSnapshots: vi.fn(),
  fetchServerVersionShares: vi.fn(),
  createServerManuscriptSnapshot: vi.fn(),
  createServerVersionShare: vi.fn(),
  revokeServerVersionShare: vi.fn(),
  updateServerManuscriptSnapshotMemo: vi.fn(),
}));

const ARTIFACT = "artifact-sync-test";
const HASH = "a".repeat(64);

function serverSnapshot(overrides: Partial<ServerManuscriptSnapshot> = {}): ServerManuscriptSnapshot {
  return {
    id: "server-snap-1",
    artifactId: ARTIFACT,
    name: "v1",
    memo: "",
    revisionId: "rev-1",
    rootGraphHash: HASH,
    revisionKind: "checkpoint",
    revisionMessage: "작업 저장",
    createdBy: "user-1",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function serverShare(overrides: Partial<ServerVersionShareLink> = {}): ServerVersionShareLink {
  return {
    id: "server-link-1",
    artifactId: ARTIFACT,
    snapshotId: "server-snap-1",
    snapshotName: "v1",
    tokenSuffix: "UvWx",
    permission: "comment",
    watermark: true,
    hasPassword: false,
    createdBy: "user-1",
    createdAt: "2026-10-01T00:00:00.000Z",
    expiresAt: "2026-10-08T00:00:00.000Z",
    revokedAt: null,
    ...overrides,
  };
}

const fetchSnapshots = vi.mocked(serverApi.fetchServerManuscriptSnapshots);
const fetchShares = vi.mocked(serverApi.fetchServerVersionShares);
const createSnapshot = vi.mocked(serverApi.createServerManuscriptSnapshot);
const createShare = vi.mocked(serverApi.createServerVersionShare);
const revokeShare = vi.mocked(serverApi.revokeServerVersionShare);
const updateMemo = vi.mocked(serverApi.updateServerManuscriptSnapshotMemo);

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  fetchSnapshots.mockResolvedValue([]);
  fetchShares.mockResolvedValue([]);
  createSnapshot.mockImplementation(async (_artifactId, input) => serverSnapshot({
    id: input.id ?? "server-new-snap",
    name: input.name ?? "v1",
    memo: input.memo ?? "",
    revisionId: input.revisionId,
    createdAt: input.createdAt ?? "2026-10-01T00:00:00.000Z",
  }));
  createShare.mockImplementation(async (_artifactId, input) => serverShare({
    id: input.id ?? "server-new-link",
    snapshotId: input.snapshotId,
    permission: input.permission,
    watermark: input.watermark,
    hasPassword: Boolean(input.password),
  }));
  revokeShare.mockImplementation(async (_artifactId, linkId) =>
    serverShare({ id: linkId, revokedAt: "2026-10-02T00:00:00.000Z" }));
  updateMemo.mockImplementation(async (_artifactId, snapshotId, memo) =>
    serverSnapshot({ id: snapshotId, memo }));
});

describe("서버 → 로컬 매핑", () => {
  it("스냅샷 종류를 검증해 매핑하고 모르는 종류는 버린다", () => {
    expect(toProductionRevisionKind("checkpoint")).toBe("checkpoint");
    expect(toProductionRevisionKind("unknown-kind")).toBeNull();
    expect(serverSnapshotToLocal(serverSnapshot())?.revisionKind).toBe("checkpoint");
    expect(serverSnapshotToLocal(serverSnapshot({ revisionKind: "bogus" }))).toBeNull();
  });

  it("링크는 원문 토큰 없이 마스킹 URL과 비밀번호 유무만 옮긴다", () => {
    const local = serverShareToLocal(serverShare({ hasPassword: true }));
    expect(local.token).toBe("");
    expect(local.url).toBe("/share/version/…UvWx");
    expect(local.settings.password).toBe("••••");
    expect(local.settings.expiresInDays).toBe(7);
    expect(local.revoked).toBe(false);
    expect(serverShareToLocal(serverShare({ revokedAt: "2026-10-02T00:00:00.000Z" })).revoked)
      .toBe(true);
    expect(serverShareToLocal(serverShare({ expiresAt: null })).settings.expiresInDays).toBe(0);
  });
});

describe("로컬 병합", () => {
  it("스냅샷은 같은 id를 서버 값으로 교체하고 로컬 전용은 보존한다", () => {
    const local = createProductionManuscriptSnapshot(ARTIFACT, {
      revisionId: "rev-1", rootGraphHash: HASH, revisionKind: "checkpoint", revisionMessage: null,
    }, "로컬 메모");
    expect(local).not.toBeNull();
    const merged = mergeProductionManuscriptSnapshots(ARTIFACT, [{
      id: local!.id,
      artifactId: ARTIFACT,
      name: local!.name,
      memo: "서버 메모",
      createdAt: local!.createdAt,
      revisionId: "rev-1",
      rootGraphHash: HASH,
      revisionKind: "checkpoint",
      revisionMessage: null,
    }, {
      id: "other-device-snap",
      artifactId: ARTIFACT,
      name: "v9",
      memo: "",
      createdAt: "2026-10-02T00:00:00.000Z",
      revisionId: "rev-9",
      rootGraphHash: HASH,
      revisionKind: "release",
      revisionMessage: null,
    }]);
    expect(merged).toHaveLength(2);
    expect(merged.find((snapshot) => snapshot.id === local!.id)?.memo).toBe("서버 메모");
    expect(merged.map((snapshot) => snapshot.id)).toContain("other-device-snap");
  });

  it("링크 병합도 같은 규칙을 따른다", () => {
    const link = createVersionShareLink(
      ARTIFACT,
      { snapshotId: "snap-1", snapshotName: "v1" },
      {},
      { token: "local-token-1234567890", origin: "https://example.com", now: "2026-10-01T00:00:00.000Z" },
    );
    expect(link).not.toBeNull();
    const merged = mergeVersionShareLinks(ARTIFACT, [{
      ...serverShareToLocal(serverShare({ id: "server-only-link" })),
    }]);
    expect(merged.map((candidate) => candidate.id)).toContain(link!.id);
    expect(merged.map((candidate) => candidate.id)).toContain("server-only-link");
  });
});

describe("syncManuscriptVersionShare", () => {
  it("서버에 닿지 않으면 null을 돌려주고 로컬은 그대로 둔다", async () => {
    createProductionManuscriptSnapshot(ARTIFACT, {
      revisionId: "rev-1", rootGraphHash: HASH, revisionKind: "checkpoint", revisionMessage: null,
    }, "");
    fetchSnapshots.mockRejectedValue(new Error("offline"));
    await expect(syncManuscriptVersionShare(ARTIFACT)).resolves.toBeNull();
    expect(listProductionManuscriptSnapshots(ARTIFACT)).toHaveLength(1);
    expect(createSnapshot).not.toHaveBeenCalled();
  });

  it("다른 기기에서 만든 서버 스냅샷·링크가 로컬에 나타난다", async () => {
    fetchSnapshots.mockResolvedValue([serverSnapshot()]);
    fetchShares.mockResolvedValue([serverShare()]);
    const result = await syncManuscriptVersionShare(ARTIFACT);
    expect(result?.snapshots.map((snapshot) => snapshot.id)).toContain("server-snap-1");
    expect(result?.links.map((link) => link.id)).toContain("server-link-1");
    expect(listProductionManuscriptSnapshots(ARTIFACT)).toHaveLength(1);
    expect(listVersionShareLinks(ARTIFACT)).toHaveLength(1);
    expect(createSnapshot).not.toHaveBeenCalled();
    expect(createShare).not.toHaveBeenCalled();
  });

  it("로컬 전용 스냅샷·링크를 id를 유지한 채 서버로 올린다", async () => {
    const snapshot = createProductionManuscriptSnapshot(ARTIFACT, {
      revisionId: "rev-1", rootGraphHash: HASH, revisionKind: "checkpoint", revisionMessage: null,
    }, "마이그레이션 메모");
    const link = createVersionShareLink(
      ARTIFACT,
      { snapshotId: snapshot!.id, snapshotName: snapshot!.name },
      { permission: "view", expiresInDays: 7, watermark: false, password: "" },
      { token: "local-token-1234567890", origin: "https://example.com", now: "2026-10-01T00:00:00.000Z" },
    );
    const result = await syncManuscriptVersionShare(ARTIFACT);
    expect(createSnapshot).toHaveBeenCalledWith(ARTIFACT, expect.objectContaining({
      id: snapshot!.id, revisionId: "rev-1", memo: "마이그레이션 메모",
    }));
    expect(createShare).toHaveBeenCalledWith(ARTIFACT, expect.objectContaining({
      id: link!.id, snapshotId: snapshot!.id, token: "local-token-1234567890",
    }));
    expect(result?.snapshots.map((candidate) => candidate.id)).toContain(snapshot!.id);
    expect(result?.links.map((candidate) => candidate.id)).toContain(link!.id);
  });

  it("로컬 메모 변경은 병합 전에 서버로 밀어 넣는다", async () => {
    const snapshot = createProductionManuscriptSnapshot(ARTIFACT, {
      revisionId: "rev-1", rootGraphHash: HASH, revisionKind: "checkpoint", revisionMessage: null,
    }, "바뀐 메모");
    fetchSnapshots.mockResolvedValue([serverSnapshot({ id: snapshot!.id, memo: "예전 메모" })]);
    const result = await syncManuscriptVersionShare(ARTIFACT);
    expect(updateMemo).toHaveBeenCalledWith(ARTIFACT, snapshot!.id, "바뀐 메모");
    expect(result?.snapshots.find((candidate) => candidate.id === snapshot!.id)?.memo)
      .toBe("바뀐 메모");
  });

  it("로컬 회수는 서버로 전파된다", async () => {
    const snapshot = createProductionManuscriptSnapshot(ARTIFACT, {
      revisionId: "rev-1", rootGraphHash: HASH, revisionKind: "checkpoint", revisionMessage: null,
    }, "");
    const link = createVersionShareLink(
      ARTIFACT,
      { snapshotId: snapshot!.id, snapshotName: snapshot!.name },
      {},
      { token: "local-token-1234567890", origin: "https://example.com", now: "2026-10-01T00:00:00.000Z" },
    );
    revokeVersionShareLink(ARTIFACT, link!.id);
    fetchSnapshots.mockResolvedValue([serverSnapshot({ id: snapshot!.id })]);
    fetchShares.mockResolvedValue([serverShare({ id: link!.id, snapshotId: snapshot!.id })]);
    const result = await syncManuscriptVersionShare(ARTIFACT);
    expect(revokeShare).toHaveBeenCalledWith(ARTIFACT, link!.id);
    expect(result?.links.find((candidate) => candidate.id === link!.id)?.revoked).toBe(true);
  });

  it("이미 만료된 로컬 전용 링크는 서버로 올리지 않는다", async () => {
    const snapshot = createProductionManuscriptSnapshot(ARTIFACT, {
      revisionId: "rev-1", rootGraphHash: HASH, revisionKind: "checkpoint", revisionMessage: null,
    }, "");
    createVersionShareLink(
      ARTIFACT,
      { snapshotId: snapshot!.id, snapshotName: snapshot!.name },
      { expiresInDays: 1 },
      { token: "expired-token-123456789", origin: "https://example.com", now: "2026-09-01T00:00:00.000Z" },
    );
    await syncManuscriptVersionShare(ARTIFACT);
    expect(createSnapshot).toHaveBeenCalled();
    expect(createShare).not.toHaveBeenCalled();
  });
});
