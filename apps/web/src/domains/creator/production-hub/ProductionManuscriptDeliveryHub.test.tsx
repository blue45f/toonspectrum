// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { persistSession } from "@/domains/auth/public/session/auth-session-state";

import type {
  StudioArtifactRecord,
  StudioProjectRecord,
  StudioReviewRecord,
  StudioRevisionRecord,
} from "../project-graph/studio-project-graph-contract";
import type {
  StudioVirtualSpaceReviewSubject,
  StudioVirtualSpaceReviewVerification,
  StudioVirtualSpaceVerifiedReview,
} from "../virtual-space/studio-virtual-space-review-invitation";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";
import { ProductionManuscriptDeliveryHub } from "./ProductionManuscriptDeliveryHub";

const f = vi.hoisted(() => ({ verify: vi.fn() }));

vi.mock("../virtual-space/studio-virtual-space-review-invitation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../virtual-space/studio-virtual-space-review-invitation")>();
  return { ...actual, verifyStudioVirtualSpaceReviewSubject: f.verify };
});

vi.mock("../review-share/StudioPinnedReviewShareManager", () => ({
  StudioPinnedReviewShareManager: ({ verified }: { readonly verified: StudioVirtualSpaceVerifiedReview }) => (
    <div>SHARE MANAGER {verified.subject.reviewId}</div>
  ),
}));

vi.mock("../review-export/StudioReviewExport", () => ({
  StudioReviewExport: ({ verified }: { readonly verified: StudioVirtualSpaceVerifiedReview }) => (
    <div>OFFICIAL DELIVERY {verified.subject.reviewId}</div>
  ),
}));

vi.mock("../studio-shell/StudioExportPanel", () => ({
  StudioExportPanel: ({ projectId }: { readonly projectId: string }) => <div>PROJECT EXPORT {projectId}</div>,
}));

const now = "2026-09-24T00:00:00.000Z";
const subject: StudioVirtualSpaceReviewSubject = {
  schemaVersion: 1,
  projectId: "graph-project",
  workId: "work-1",
  artifactId: "artifact-1",
  reviewId: "review-1",
  revisionId: "review-snapshot-1",
  rootGraphHash: "a".repeat(64),
};

function revision(id: string, kind: StudioRevisionRecord["kind"]): StudioRevisionRecord {
  return {
    id,
    artifactId: "artifact-1",
    kind,
    parentIds: [],
    rootGraphHash: "a".repeat(64),
    operationFirst: null,
    operationLast: null,
    createdBy: "owner",
    deviceId: "device",
    createdAt: now,
    message: id,
    compatibilityReportId: null,
    provenanceManifestId: null,
    blobRefs: [],
  };
}

const artifact: StudioArtifactRecord = {
  id: "artifact-1",
  projectId: "graph-project",
  kind: "canvas-2d",
  title: "24화 작화",
  scope: { projectId: "graph-project", seasonId: "season-1", episodeId: "episode-24" },
  headRevisionId: "approved-1",
  approvedRevisionId: "approved-1",
  ownerWorkspaceId: "workspace-1",
  createdAt: now,
  updatedAt: now,
};
const approved = revision("approved-1", "approved");
const reviewSnapshot = revision("review-snapshot-1", "review-snapshot");
const project: StudioProjectRecord = {
  id: "graph-project",
  workId: "work-1",
  schemaVersion: 3,
  authorityVersion: "project-graph-v3",
  ownerUserId: "owner",
  createdAt: now,
  updatedAt: now,
  access: {
    view: true,
    comment: true,
    edit: true,
    manageMembers: true,
    respondInvite: false,
    owner: true,
    role: "owner",
  },
  artifacts: [artifact],
};
const review: StudioReviewRecord = {
  id: "review-1",
  artifactId: "artifact-1",
  revisionId: "review-snapshot-1",
  requestedBy: "owner",
  title: "24화 최종 검수",
  status: "approved",
  decidedAt: now,
  decidedBy: "owner",
  createdAt: now,
  updatedAt: now,
  reviewerIds: ["owner"],
  openRequiredCommentCount: 0,
  comments: [],
};
const verified: StudioVirtualSpaceVerifiedReview = {
  ok: true,
  subject,
  project,
  review,
  revision: reviewSnapshot,
  href: "/review",
  verifiedAt: Date.now(),
  expiresAt: Date.now() + 15_000,
};
const process: ProductionManuscriptProcess = {
  artifact,
  processType: "image",
  label: "작화 원고",
  revisions: [approved, reviewSnapshot],
  reviews: [review],
  headRevision: approved,
  submissionRevision: null,
  reviewSnapshotRevision: reviewSnapshot,
  approvedRevision: approved,
  releaseRevision: null,
  latestReview: review,
  lifecyclePhase: "ready-to-deliver",
  hasUnapprovedChanges: false,
  readyToDeliver: true,
  openReviewCount: 0,
  openRequiredFeedbackCount: 0,
  latestActivityAt: now,
};

beforeEach(() => {
  persistSession({ user: { id: "owner" }, token: null });
  f.verify.mockImplementation(async () => ({ ...verified, verifiedAt: Date.now(), expiresAt: Date.now() + 15_000 }));
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  });
});

afterEach(() => {
  cleanup();
  persistSession(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("ProductionManuscriptDeliveryHub", () => {
  it("separates internal URL, immutable share, official delivery and transformed export", async () => {
    render(<ProductionManuscriptDeliveryHub
      projectId="work-1"
      subject={subject}
      process={process}
      onOpenFeedback={vi.fn()}
    />);

    expect(screen.getByRole("heading", { name: "링크 공유, 외부 검토, 공식 전달을 구분합니다" })).toBeTruthy();
    expect(screen.getByText("현재 업무 화면")).toBeTruthy();
    expect(screen.getByText("외부 검토 링크")).toBeTruthy();
    expect(screen.getByText("공식 전달·수신 확인")).toBeTruthy();
    expect(screen.getByText("목적별 내보내기")).toBeTruthy();
    expect(await screen.findByText("SHARE MANAGER review-1")).toBeTruthy();
    expect(await screen.findByText("OFFICIAL DELIVERY review-1")).toBeTruthy();
    expect(screen.getByText("PROJECT EXPORT work-1")).toBeTruthy();
    expect(f.verify).toHaveBeenCalledWith(subject, "view");
  });

  it("copies only the current navigation URL without claiming external access", async () => {
    render(<ProductionManuscriptDeliveryHub
      projectId="work-1"
      subject={subject}
      process={process}
      onOpenFeedback={vi.fn()}
    />);
    const button = screen.getByRole("button", { name: "화면 링크 복사" });
    fireEvent.click(button);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(window.location.href));
    expect(await screen.findByRole("button", { name: "복사됨" })).toBeTruthy();
  });

  it("does not substitute another review when the immutable subject is unavailable", async () => {
    f.verify.mockResolvedValue({ ok: false, reason: "version-mismatch" });
    render(<ProductionManuscriptDeliveryHub
      projectId="work-1"
      subject={subject}
      process={process}
      onOpenFeedback={vi.fn()}
    />);
    expect((await screen.findByRole("alert")).textContent).toContain("다른 버전으로 자동 대체하지 않았습니다");
    expect(screen.queryByText("SHARE MANAGER review-1")).toBeNull();
    expect(screen.queryByText("OFFICIAL DELIVERY review-1")).toBeNull();
  });


  it("removes the prior account's private tools before delayed authority reads can settle", async () => {
    let resolveOld!: (value: StudioVirtualSpaceVerifiedReview) => void;
    let resolveNew!: (value: StudioVirtualSpaceReviewVerification) => void;
    render(<ProductionManuscriptDeliveryHub
      projectId="work-1"
      subject={subject}
      process={process}
      onOpenFeedback={vi.fn()}
    />);
    await screen.findByText("SHARE MANAGER review-1");

    f.verify
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "권한 다시 확인" }));
    await act(async () => { persistSession({ user: { id: "other" }, token: null }); });

    expect(screen.queryByText("SHARE MANAGER review-1")).toBeNull();
    expect(screen.queryByText("OFFICIAL DELIVERY review-1")).toBeNull();
    await act(async () => { resolveOld({ ...verified, verifiedAt: Date.now(), expiresAt: Date.now() + 15_000 }); });
    expect(screen.queryByText("SHARE MANAGER review-1")).toBeNull();
    await act(async () => { resolveNew({ ok: false, reason: "access-denied" }); });
    expect((await screen.findByRole("alert")).textContent).toContain("다른 버전으로 자동 대체하지 않았습니다");
  });

  it("hides share and delivery authority while offline and re-verifies after reconnection", async () => {
    let online = true;
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
    render(<ProductionManuscriptDeliveryHub
      projectId="work-1"
      subject={subject}
      process={process}
      onOpenFeedback={vi.fn()}
    />);
    await screen.findByText("SHARE MANAGER review-1");

    online = false;
    act(() => globalThis.dispatchEvent(new Event("offline")));
    expect(screen.queryByText("SHARE MANAGER review-1")).toBeNull();
    expect(screen.queryByText("OFFICIAL DELIVERY review-1")).toBeNull();
    expect((await screen.findByRole("alert")).textContent).toContain("연결이 끊겨");

    online = true;
    act(() => globalThis.dispatchEvent(new Event("online")));
    expect(await screen.findByText("SHARE MANAGER review-1")).toBeTruthy();
    expect(f.verify.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("removes private actions when the verification lease expires during a stalled renewal", async () => {
    f.verify
      .mockResolvedValueOnce({ ...verified, verifiedAt: Date.now(), expiresAt: Date.now() + 80 })
      .mockImplementationOnce(() => new Promise(() => undefined));
    render(<ProductionManuscriptDeliveryHub
      projectId="work-1"
      subject={subject}
      process={process}
      onOpenFeedback={vi.fn()}
    />);
    await screen.findByText("SHARE MANAGER review-1");
    await act(async () => { await new Promise((resolve) => globalThis.setTimeout(resolve, 120)); });
    expect(screen.queryByText("SHARE MANAGER review-1")).toBeNull();
    expect(screen.queryByText("OFFICIAL DELIVERY review-1")).toBeNull();
    expect((await screen.findByRole("alert")).textContent).toContain("권한 확인 시간이 지나");
  });

  it("requires a pinned review before offering external share or delivery", () => {
    const openFeedback = vi.fn();
    render(<ProductionManuscriptDeliveryHub
      projectId="work-1"
      subject={null}
      process={process}
      onOpenFeedback={openFeedback}
    />);
    expect(screen.getByRole("heading", { name: "공유할 고정 검수본을 먼저 선택하세요" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "검수본 선택" }));
    expect(openFeedback).toHaveBeenCalledOnce();
    expect(f.verify).not.toHaveBeenCalled();
  });
});
