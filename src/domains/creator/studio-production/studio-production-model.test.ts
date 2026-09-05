import { describe, expect, it } from "vitest";

import {
  buildStudioInviteHref,
  buildStudioProductionOverview,
  buildStudioReviewGate,
  createStudioProductionWorkspace,
  createStudioShareGrant,
  createStudioVersionSnapshot,
  diffStudioVersionSnapshots,
  hashStudioProductionValue,
  isStudioShareGrantActive,
  joinStudioProductionWorkspace,
  parseStudioProductionWorkspaceExport,
  resolveStudioProductionScope,
  restoreStudioVersionSnapshot,
  serializeStudioProductionWorkspace,
  snapshotPayloadFromWorkspace,
  studioProductionSurfaceHref,
} from "./studio-production-model";

const NOW = "2026-09-05T03:00:00.000Z";

describe("Studio production command center model", () => {
  it("resolves portfolio, draft, work, and remix scopes without losing route identity", () => {
    expect(resolveStudioProductionScope("/studio/projects")).toMatchObject({
      key: "portfolio:default",
      kind: "portfolio",
      editorHref: "/studio",
    });
    expect(resolveStudioProductionScope("/studio/projects", "?scope=draft")).toMatchObject({
      key: "draft",
      kind: "draft",
    });
    expect(resolveStudioProductionScope("/studio/work/work-1/review")).toMatchObject({
      key: "work:work-1",
      kind: "work",
      documentId: "work-1",
      editorHref: "/studio/work/work-1/canvas",
    });
    expect(resolveStudioProductionScope("/studio/present", "?scope=remix:source-1")).toMatchObject({
      key: "remix:source-1",
      kind: "remix",
      documentId: "source-1",
    });
  });

  it("builds document-scoped review/version/presentation URLs and query-scoped global tools", () => {
    const scope = resolveStudioProductionScope("/studio/work/work-1/review");
    expect(studioProductionSurfaceHref("review", scope)).toBe("/studio/work/work-1/review");
    expect(studioProductionSurfaceHref("versions", scope)).toBe("/studio/work/work-1/versions");
    expect(studioProductionSurfaceHref("present", scope)).toBe("/studio/work/work-1/present");
    expect(studioProductionSurfaceHref("projects", scope)).toBe("/studio/projects?scope=work%3Awork-1");
    expect(studioProductionSurfaceHref("share", scope)).toBe("/studio/share?scope=work%3Awork-1");
  });

  it("summarizes schedule and release risk from one consistent production state", () => {
    const scope = resolveStudioProductionScope("/studio/projects");
    const workspace = createStudioProductionWorkspace(scope, NOW);
    const overview = buildStudioProductionOverview(workspace, NOW);
    expect(overview.completionPercent).toBeGreaterThan(40);
    expect(overview.remainingHours).toBeGreaterThan(0);
    expect(overview.overdueCount).toBe(1);
    expect(overview.blockedCount).toBe(1);
    expect(overview.reviewBlockerCount).toBe(1);
    expect(overview.risk).toBe("critical");
  });

  it("blocks release until blocker/major reviews and every required delivery check are closed", () => {
    const scope = resolveStudioProductionScope("/studio/review");
    const workspace = createStudioProductionWorkspace(scope, NOW);
    const blocked = buildStudioReviewGate(workspace);
    expect(blocked.ready).toBe(false);
    expect(blocked.blockerCount).toBe(1);
    expect(blocked.majorCount).toBe(2);
    expect(blocked.missingRequiredChecks).toHaveLength(3);

    const readyWorkspace = {
      ...workspace,
      reviews: workspace.reviews.map((review) => ({ ...review, status: "resolved" as const })),
      deliveryChecklist: workspace.deliveryChecklist.map((item) => ({ ...item, done: true })),
    };
    expect(buildStudioReviewGate(readyWorkspace)).toMatchObject({
      ready: true,
      blockerCount: 0,
      majorCount: 0,
      readinessPercent: 100,
    });
  });

  it("creates immutable version payloads, reports structural diffs, and restores safely", () => {
    const scope = resolveStudioProductionScope("/studio/versions");
    const workspace = createStudioProductionWorkspace(scope, NOW);
    const before = createStudioVersionSnapshot(workspace, {
      name: "Before",
      nowIso: NOW,
    });
    const changedWorkspace = {
      ...workspace,
      title: "변경된 프로젝트",
      episodes: workspace.episodes.map((episode, index) => (
        index === 0 ? { ...episode, title: "변경된 1화" } : episode
      )),
      pitchSlides: [...workspace.pitchSlides, {
        ...workspace.pitchSlides[0]!,
        id: "slide-new",
        title: "추가 슬라이드",
      }],
    };
    const after = createStudioVersionSnapshot(changedWorkspace, {
      name: "After",
      nowIso: "2026-09-05T04:00:00.000Z",
    });
    const diff = diffStudioVersionSnapshots(before, after);
    expect(diff.episodesChanged).toBe(1);
    expect(diff.slidesChanged).toBe(1);
    expect(diff.projectFieldsChanged).toBe(1);
    expect(diff.totalChanges).toBe(3);

    const restored = restoreStudioVersionSnapshot(changedWorkspace, before, "2026-09-05T05:00:00.000Z");
    expect(snapshotPayloadFromWorkspace(restored)).toEqual(before.payload);
    expect(restored.versions[0]).toMatchObject({ kind: "restore", branch: "main" });
    expect(restored.versions).toHaveLength(workspace.versions.length + 1);
  });

  it("enforces expiring role-based invitations and approval-aware joins", () => {
    const scope = resolveStudioProductionScope("/studio/share", "?scope=work:work-1");
    const base = createStudioProductionWorkspace(scope, NOW);
    const grant = createStudioShareGrant({
      label: "편집 초대",
      role: "editor",
      expiresInDays: 7,
      downloadsAllowed: false,
      watermark: true,
      approvalRequired: true,
      nowIso: NOW,
    });
    expect(isStudioShareGrantActive(grant, "2026-09-10T00:00:00.000Z")).toBe(true);
    expect(isStudioShareGrantActive(grant, "2026-09-13T03:00:00.000Z")).toBe(false);
    expect(buildStudioInviteHref(grant, scope, "https://example.test")).toContain(
      "/studio/join?invite=ts-",
    );
    expect(buildStudioInviteHref(grant, scope, "https://example.test")).toContain(
      "scope=work%3Awork-1",
    );

    const joined = joinStudioProductionWorkspace(
      { ...base, shareGrants: [grant] },
      { token: grant.token, name: "검수자", nowIso: "2026-09-06T00:00:00.000Z" },
    );
    expect(joined.ok).toBe(true);
    if (!joined.ok) throw new Error(joined.error);
    expect(joined.participant).toMatchObject({ role: "editor", status: "pending" });
    expect(joined.workspace.shareGrants[0]?.lastOpenedAt).toBe("2026-09-06T00:00:00.000Z");

    const rejected = joinStudioProductionWorkspace(
      { ...base, shareGrants: [{ ...grant, revokedAt: NOW }] },
      { token: grant.token, name: "검수자", nowIso: "2026-09-06T00:00:00.000Z" },
    );
    expect(rejected).toMatchObject({ ok: false, error: "취소된 초대 링크입니다." });
  });

  it("round-trips explicit disaster-recovery exports and rejects checksum tampering", () => {
    const scope = resolveStudioProductionScope("/studio/projects");
    const workspace = createStudioProductionWorkspace(scope, NOW);
    const serialized = serializeStudioProductionWorkspace(workspace, NOW);
    const imported = parseStudioProductionWorkspaceExport(serialized, scope);
    expect(imported.ok).toBe(true);
    expect(imported.workspace?.title).toBe(workspace.title);
    expect(imported.workspace?.audit[0]?.action).toBe("운영 파일 가져오기");

    const tampered = JSON.parse(serialized) as {
      workspace: { title: string };
    };
    tampered.workspace.title = "변조된 제목";
    const rejected = parseStudioProductionWorkspaceExport(JSON.stringify(tampered), scope);
    expect(rejected).toMatchObject({ ok: false });
    expect(rejected.error).toContain("체크섬");
    expect(hashStudioProductionValue(workspace)).toBe(hashStudioProductionValue(workspace));
  });
});
