import { GoneException, HttpException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  hashVersionSharePassword,
  hashVersionShareToken,
  isVersionShareExpired,
  nextManuscriptSnapshotName,
  verifyVersionSharePassword,
  versionShareExpiresAt,
  versionShareTokenSuffix,
  type VersionShareResolution,
} from "./manuscript-version-share.repository";
import { ManuscriptVersionShareService } from "./manuscript-version-share.service";

describe("버전 공유 토큰 해시", () => {
  it("sha256 hex로 저장하고 원문을 되돌릴 수 없게 한다", () => {
    const hash = hashVersionShareToken("Ab3dEf6hIjKlMnOpQrStUvWx");
    expect(hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(hash).not.toContain("Ab3dEf6hIjKlMnOpQrStUvWx");
    expect(hashVersionShareToken("Ab3dEf6hIjKlMnOpQrStUvWx")).toBe(hash);
    expect(hashVersionShareToken("different-token-value")).not.toBe(hash);
  });

  it("표시용 접미사는 끝 4자다", () => {
    expect(versionShareTokenSuffix("Ab3dEf6hIjKlMnOpQrStUvWx")).toBe("UvWx");
  });
});

describe("버전 공유 비밀번호 해시", () => {
  it("scrypt 해시로 저장하고 올바른 비밀번호만 통과한다", () => {
    const stored = hashVersionSharePassword("moon-1234");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("moon-1234");
    expect(verifyVersionSharePassword("moon-1234", stored)).toBe(true);
    expect(verifyVersionSharePassword("moon-9999", stored)).toBe(false);
  });

  it("같은 비밀번호도 솔트 때문에 해시가 다르고, 깨진 형식은 거부한다", () => {
    expect(hashVersionSharePassword("same")).not.toBe(hashVersionSharePassword("same"));
    expect(verifyVersionSharePassword("same", "not-a-hash")).toBe(false);
    expect(verifyVersionSharePassword("same", "scrypt$zz$yy")).toBe(false);
    expect(verifyVersionSharePassword("same", "")).toBe(false);
  });
});

describe("공유 만료 계산", () => {
  const createdAt = new Date("2026-10-03T00:00:00.000Z");

  it("0일·null은 무만료다", () => {
    expect(versionShareExpiresAt(createdAt, 0)).toBeNull();
    expect(versionShareExpiresAt(createdAt, null)).toBeNull();
  });

  it("양수 일수는 createdAt에 정확히 더해진다", () => {
    expect(versionShareExpiresAt(createdAt, 7)?.toISOString())
      .toBe("2026-10-10T00:00:00.000Z");
  });

  it("만료 판정은 expiresAt 경과 여부로 한다", () => {
    const now = new Date("2026-10-10T00:00:00.000Z");
    expect(isVersionShareExpired({ expiresAt: null }, now)).toBe(false);
    expect(isVersionShareExpired({ expiresAt: "2026-10-11T00:00:00.000Z" }, now)).toBe(false);
    expect(isVersionShareExpired({ expiresAt: "2026-10-10T00:00:00.000Z" }, now)).toBe(true);
    expect(isVersionShareExpired({ expiresAt: "2026-10-09T00:00:00.000Z" }, now)).toBe(true);
  });
});

describe("스냅샷 자동 이름", () => {
  it("기존 v{n}의 최대값 다음을 만든다", () => {
    expect(nextManuscriptSnapshotName([])).toBe("v1");
    expect(nextManuscriptSnapshotName(["v1", "v2"])).toBe("v3");
    expect(nextManuscriptSnapshotName(["v1", "v9", "검수본", "v3"])).toBe("v10");
  });
});

describe("공유 링크 해석 상태 매핑", () => {
  function serviceReturning(resolution: VersionShareResolution) {
    const repository = {
      resolveShare: vi.fn(async () => resolution),
    };
    return new ManuscriptVersionShareService(repository as never);
  }

  const okResolution: VersionShareResolution = {
    kind: "ok",
    permission: "view",
    watermark: false,
    workId: "work-1",
    projectId: "project-1",
    artifactId: "artifact-1",
    artifactTitle: "1화 원고",
    workTitle: "달빛 기사",
    snapshot: {
      id: "snap-1",
      artifactId: "artifact-1",
      name: "v3",
      memo: "",
      revisionId: "rev-1",
      rootGraphHash: "a".repeat(64),
      revisionKind: "commit",
      revisionMessage: null,
      createdBy: "user-1",
      createdAt: "2026-10-03T00:00:00.000Z",
    },
    revision: {
      id: "rev-1",
      artifactId: "artifact-1",
      kind: "commit",
      parentIds: [],
      rootGraphHash: "a".repeat(64),
      operationFirst: 1,
      operationLast: 2,
      createdBy: "user-1",
      deviceId: "device-1",
      createdAt: "2026-10-03T00:00:00.000Z",
      message: null,
    },
  };

  it("정상 해석은 그대로 반환한다", async () => {
    const service = serviceReturning(okResolution);
    await expect(service.resolveShare("token-value-123456")).resolves.toBe(okResolution);
  });

  it("없는 링크는 404 코드와 함께 던진다", async () => {
    const service = serviceReturning({ kind: "missing" });
    const error = await service.resolveShare("token-value-123456").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      code: "version_share_not_found",
    });
  });

  it("회수·만료는 410으로 구분한다", async () => {
    const revoked = await serviceReturning({ kind: "revoked" })
      .resolveShare("token-value-123456").catch((e: unknown) => e);
    expect(revoked).toBeInstanceOf(GoneException);
    expect((revoked as GoneException).getResponse()).toMatchObject({
      code: "version_share_revoked",
    });
    const expired = await serviceReturning({ kind: "expired" })
      .resolveShare("token-value-123456").catch((e: unknown) => e);
    expect(expired).toBeInstanceOf(GoneException);
    expect((expired as GoneException).getResponse()).toMatchObject({
      code: "version_share_expired",
    });
  });

  it("비밀번호 필요·불일치는 401 코드로 구분한다", async () => {
    const required = await serviceReturning({ kind: "password_required" })
      .resolveShare("token-value-123456").catch((e: unknown) => e);
    expect(required).toBeInstanceOf(HttpException);
    expect((required as HttpException).getStatus()).toBe(401);
    expect((required as HttpException).getResponse()).toMatchObject({
      code: "version_share_password_required",
    });
    const invalid = await serviceReturning({ kind: "password_invalid" })
      .resolveShare("token-value-123456", "wrong").catch((e: unknown) => e);
    expect((invalid as HttpException).getResponse()).toMatchObject({
      code: "version_share_password_invalid",
    });
  });
});
