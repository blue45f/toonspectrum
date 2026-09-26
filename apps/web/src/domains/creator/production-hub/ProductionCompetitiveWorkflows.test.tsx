// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductionProjectAggregate } from "@toonspectrum/core/production";

import type { StudioProjectRecord, StudioReviewSummary, StudioRevisionRecord } from "../project-graph/studio-project-graph-contract";
import type { StudioVirtualSpaceReviewPreview } from "../virtual-space/studio-virtual-space-review-preview";
import { createProductionDemoProject } from "./production-demo";
import { ProductionAdoptionCenter } from "./ProductionAdoptionCenter";
import { ProductionEpisodeProcessMatrix } from "./ProductionEpisodeProcessMatrix";
import { ProductionFocusedAiWorkflow } from "./ProductionFocusedAiWorkflow";
import { ProductionMultiManuscriptWorkbench } from "./ProductionMultiManuscriptWorkbench";
import { ProductionPageManifestBuilder } from "./ProductionPageManifestBuilder";
import { ProductionRolePresetPanel } from "./ProductionRolePresetPanel";
import { ProductionUnifiedManuscriptFlow } from "./ProductionUnifiedManuscriptFlow";
import { buildProductionReviewCandidates, type ProductionReviewCandidate } from "./production-manuscript-competitive-model";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";

const f = vi.hoisted(() => ({
  previewHook: vi.fn(),
  buildArchive: vi.fn(),
  collectPages: vi.fn(),
  downloadArchive: vi.fn(),
  createHandoff: vi.fn(),
  writeHandoff: vi.fn(),
}));

vi.mock("../virtual-space/use-studio-pinned-review-previews", () => ({
  useStudioPinnedReviewPreviews: (...args: unknown[]) => f.previewHook(...args),
}));

vi.mock("../virtual-space/StudioPinnedReviewPreview", () => ({
  StudioReviewImage: ({ label }: { readonly label: string }) => <div data-testid="review-image">{label}</div>,
}));

vi.mock("../virtual-space/StudioPinnedReviewPanel", () => ({
  StudioPinnedReviewPanel: ({ subject }: { readonly subject: { readonly reviewId: string } | null }) => (
    <div>PINNED {subject?.reviewId ?? "none"}</div>
  ),
}));

vi.mock("./production-page-manifest-archive", () => ({
  buildProductionPageManifestArchive: (...args: unknown[]) => f.buildArchive(...args),
  collectProductionReviewManifestPages: (...args: unknown[]) => f.collectPages(...args),
  downloadProductionPageManifestArchive: (...args: unknown[]) => f.downloadArchive(...args),
}));

vi.mock("../ai/studio-ai-project-handoff", () => ({
  createStudioAiProjectHandoff: (...args: unknown[]) => f.createHandoff(...args),
  writeStudioAiProjectHandoff: (...args: unknown[]) => f.writeHandoff(...args),
}));

const digest = (value: string) => value.repeat(64).slice(0, 64);
const at = (minute: number) => `2026-09-24T01:${String(minute).padStart(2, "0")}:00.000Z`;

function preview(ordinal: number, seed: string): StudioVirtualSpaceReviewPreview {
  return {
    ordinal,
    sha256: digest(seed),
    mediaType: "image/png",
    byteLength: 128 + ordinal,
    url: `https://example.test/${seed}-${ordinal}.png`,
    expiresAt: Date.now() + 60_000,
    mapping: { status: "unmapped", reason: "legacy-review" },
  };
}

const previewResult = Object.freeze({
  ok: true as const,
  previews: Object.freeze([preview(0, "a"), preview(1, "b")]),
  nextCursor: null,
});

function revision(
  artifactId: string,
  id: string,
  kind: StudioRevisionRecord["kind"],
  minute: number,
): StudioRevisionRecord {
  return {
    id,
    artifactId,
    kind,
    parentIds: [],
    rootGraphHash: digest(id[0] ?? "r"),
    operationFirst: null,
    operationLast: null,
    createdBy: "owner",
    deviceId: "device",
    createdAt: at(minute),
    message: id,
    compatibilityReportId: null,
    provenanceManifestId: null,
    blobRefs: [],
  };
}

function process(
  id: string,
  options: {
    readonly kind?: ProductionManuscriptProcess["artifact"]["kind"];
    readonly processType?: ProductionManuscriptProcess["processType"];
    readonly episodeId?: string;
    readonly status?: StudioReviewSummary["status"];
    readonly approved?: boolean;
    readonly release?: boolean;
    readonly required?: number;
  } = {},
): ProductionManuscriptProcess {
  const kind = options.kind ?? "canvas-2d";
  const processType = options.processType ?? (kind === "story" || kind === "localization" ? "text" : "image");
  const snapshot = revision(id, `${id}-snapshot`, "review-snapshot", 2);
  const approved = options.approved ? revision(id, `${id}-approved`, "approved", 3) : null;
  const release = options.release ? revision(id, `${id}-release`, "release", 4) : null;
  const head = release ?? approved ?? snapshot;
  const review: StudioReviewSummary = {
    id: `${id}-review`,
    artifactId: id,
    revisionId: snapshot.id,
    requestedBy: "owner",
    title: `${id} 검수`,
    status: options.status ?? "open",
    decidedAt: options.status === "approved" ? at(5) : null,
    decidedBy: options.status === "approved" ? "owner" : null,
    createdAt: at(2),
    updatedAt: at(5),
    reviewerIds: ["owner"],
    openRequiredCommentCount: options.required ?? 0,
  };
  const revisions = [head, snapshot, ...(approved && approved.id !== head.id ? [approved] : []), ...(release && release.id !== head.id ? [release] : [])];
  return {
    artifact: {
      id,
      projectId: "graph",
      kind,
      title: `${id} 원고`,
      scope: { projectId: "graph", episodeId: options.episodeId ?? "episode-12" },
      headRevisionId: head.id,
      approvedRevisionId: approved?.id ?? null,
      ownerWorkspaceId: "workspace",
      createdAt: at(1),
      updatedAt: at(5),
    },
    processType,
    label: kind === "story" ? "대본" : kind === "localization" ? "식자" : "작화",
    revisions,
    reviews: [review],
    headRevision: head,
    submissionRevision: null,
    reviewSnapshotRevision: snapshot,
    approvedRevision: approved,
    releaseRevision: release,
    latestReview: review,
    lifecyclePhase: release ? "released" : approved ? "approved" : review.status === "changes-requested" ? "changes-requested" : "in-review",
    hasUnapprovedChanges: false,
    readyToDeliver: Boolean(approved && !release),
    openReviewCount: review.status === "open" || review.status === "changes-requested" ? 1 : 0,
    openRequiredFeedbackCount: options.required ?? 0,
    latestActivityAt: at(5),
  };
}

const project: StudioProjectRecord = {
  id: "graph",
  workId: "work",
  schemaVersion: 3,
  authorityVersion: "project-graph-v3",
  ownerUserId: "owner",
  createdAt: at(0),
  updatedAt: at(5),
  access: {
    view: true,
    comment: true,
    edit: true,
    manageMembers: true,
    respondInvite: false,
    owner: true,
    role: "owner",
  },
  artifacts: [],
};

function candidates(items: readonly ProductionManuscriptProcess[]): readonly ProductionReviewCandidate[] {
  return buildProductionReviewCandidates(project, items, { "episode-12": "12화 · 테스트" });
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="current-location">{`${location.pathname}${location.search}`}</output>;
}

beforeEach(() => {
  f.previewHook.mockReturnValue({
    result: previewResult,
    cursor: null,
    setCursor: vi.fn(),
    refresh: vi.fn(),
  });
  f.buildArchive.mockResolvedValue({
    blob: new Blob(["archive"], { type: "application/vnd.comicbook+zip" }),
    fileName: "manuscript.cbz",
    manifest: {
      schema: "toonspectrum.page-manifest.v1",
      projectId: "graph",
      workId: "work",
      artifactId: "art-a",
      title: "원고",
      createdAt: at(6),
      pageCount: 2,
      contentBytes: 257,
      pages: [],
    },
  });
  f.collectPages.mockImplementation(async (candidate: ProductionReviewCandidate) => previewResult.previews.map((item) => ({
    id: `${candidate.id}:${item.ordinal}:${item.sha256}`,
    sourceReviewId: candidate.id,
    sourceRevisionId: candidate.subject.revisionId,
    sourceArtifactId: candidate.artifactId,
    sourceOrdinal: item.ordinal,
    sha256: item.sha256,
    mediaType: item.mediaType,
    byteLength: item.byteLength,
    url: item.url,
    expiresAt: item.expiresAt,
    mapping: item.mapping,
  })));
  f.createHandoff.mockReturnValue({ schemaVersion: 1, id: "handoff" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CRECO competitive production workflows", () => {
  it("opens a four-pane immutable manuscript workbench and keeps bad review coordinates fail-closed", async () => {
    const items = [process("art-a"), process("art-b"), process("art-c"), process("art-d")];
    const reviews = candidates(items);
    render(
      <MemoryRouter initialEntries={[`/production/projects/p/manuscripts?compareReviews=${reviews.slice(0, 2).map((item) => item.id).join(",")}`]}>
        <ProductionMultiManuscriptWorkbench candidates={reviews} preferredReviewId={reviews[0]?.id ?? null} />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "여러 공정·회차 원고를 한 작업대에서 비교합니다" })).toBeTruthy();
    expect(screen.getAllByTestId("review-image")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "4분할" }));
    await waitFor(() => expect(screen.getAllByTestId("review-image")).toHaveLength(4));
    expect(screen.getByText(/^PINNED /u)).toBeTruthy();

    const firstPane = screen.getByRole("region", { name: "art-a 원고 1페이지" });
    Object.defineProperty(firstPane, "scrollHeight", { configurable: true, value: 1_000 });
    Object.defineProperty(firstPane, "clientHeight", { configurable: true, value: 500 });
    firstPane.scrollTop = 250;
    fireEvent.scroll(firstPane);
    await waitFor(() => expect(decodeURIComponent(screen.getByLabelText("current-location").textContent ?? "")).toContain("compareScroll=art-a-review:5000"));
    const persistedLocation = screen.getByLabelText("current-location").textContent ?? "";

    cleanup();
    render(
      <MemoryRouter initialEntries={[persistedLocation]}>
        <ProductionMultiManuscriptWorkbench candidates={reviews} preferredReviewId={reviews[0]?.id ?? null} />
      </MemoryRouter>,
    );
    const restoredPane = await screen.findByRole("region", { name: "art-a 원고 1페이지" });
    Object.defineProperty(restoredPane, "scrollHeight", { configurable: true, value: 1_000 });
    Object.defineProperty(restoredPane, "clientHeight", { configurable: true, value: 500 });
    fireEvent.load(restoredPane);
    await waitFor(() => expect(restoredPane.scrollTop).toBe(250));

    cleanup();
    render(
      <MemoryRouter initialEntries={["/production/projects/p/manuscripts?compareReviews=missing-review"]}>
        <ProductionMultiManuscriptWorkbench candidates={reviews} preferredReviewId={reviews[0]?.id ?? null} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "요청한 비교 검수본을 찾을 수 없습니다" })).toBeTruthy();
    expect(screen.queryByTestId("review-image")).toBeNull();
  });

  it("composes a page manifest, shows page state and produces a verified CBZ", async () => {
    const target = process("art-a");
    const reviews = candidates([target]);
    render(
      <MemoryRouter initialEntries={["/production/projects/p/manuscripts"]}>
        <ProductionPageManifestBuilder
          projectId="graph"
          workId="work"
          targetProcess={target}
          editorHref="/studio/work/work/canvas"
          candidates={reviews}
          canEdit
        />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "전체 페이지 불러오기" }));
    await waitFor(() => expect(f.collectPages).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("heading", { name: "새 페이지 구성 · 2장" })).toBeTruthy();
    expect(screen.getByLabelText("페이지 구성 변경 요약").textContent).toContain("재사용 2");
    expect(screen.getByLabelText("페이지 구성 변경 요약").textContent).toContain("누락 0");
    fireEvent.click(screen.getByRole("button", { name: "CBZ 빠른 출력" }));
    await waitFor(() => expect(f.buildArchive).toHaveBeenCalledTimes(1));
    expect(f.downloadArchive).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/2페이지 CBZ를 만들었습니다/u)).toBeTruthy();
  });

  it("bulk-updates episode-process cells using canonical Production scopes", async () => {
    const demo = createProductionDemoProject();
    const episodeId = demo.episodePlans[0]?.episodeId ?? demo.episodes[0]?.episodeId ?? "episode-12";
    const aggregate = { ...demo, tasks: [] } satisfies ProductionProjectAggregate;
    const execute = vi.fn().mockResolvedValue(undefined);
    const items = [process("art-a", { episodeId }), process("story-a", { kind: "story", processType: "text", episodeId })];
    render(
      <ProductionEpisodeProcessMatrix
        aggregate={aggregate}
        processes={items}
        canEdit
        isDemo={false}
        execute={execute}
        onOpenProcess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "전체 선택" }));
    fireEvent.change(screen.getByLabelText("상태"), { target: { value: "internal-review" } });
    fireEvent.click(screen.getByRole("button", { name: "일괄 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    const command = execute.mock.calls[0]?.[0] as { readonly type: string; readonly tasks: readonly { readonly scope: { readonly kind: string; readonly id: string } }[] };
    expect(command.type).toBe("upsert-task-batch");
    expect(command.tasks).toHaveLength(2);
    expect(command.tasks.every((task) => task.scope.kind === "episode" && task.scope.id === episodeId)).toBe(true);
  });

  it("previews least-privileged roles and carries the selected preset into the real team route", () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/p/manuscripts"]}>
        <ProductionRolePresetPanel canManage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "외부 검토자" }));
    expect(screen.getByText("원본 다운로드")).toBeTruthy();
    const link = screen.getByRole("link", { name: "팀 초대에서 사용" });
    expect(link.getAttribute("href"))
      .toBe("/team/people?rolePreset=external-reviewer");
  });

  it("prepares a bounded, non-destructive AI shading handoff without starting generation", async () => {
    const target = process("art-a");
    render(
      <MemoryRouter initialEntries={["/production/projects/p/manuscripts"]}>
        <ProductionFocusedAiWorkflow workId="work" process={target} editorHref="/studio/work/work/canvas?artifact=art-a" />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("처리 방식"), { target: { value: "external" } });
    expect(screen.getByText(/외부 AI 공급자에게 전송될 수 있습니다/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /편집기에서 미리보기·비용 확인/u }));
    expect(f.createHandoff).toHaveBeenCalledTimes(1);
    expect(f.writeHandoff).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("current-location").textContent).toContain("/studio/work/work/canvas?artifact=art-a");
    expect(screen.getByText(/아직 생성이나 과금은 시작되지 않았습니다/u)).toBeTruthy();
  });

  it("uses the same work-review-approval lifecycle for text, quick export and adoption journeys", async () => {
    const text = process("story-a", { kind: "story", processType: "text", approved: true, status: "approved" });
    const review = candidates([text])[0] ?? null;
    const open = vi.fn();
    const { rerender } = render(
      <MemoryRouter initialEntries={["/production/projects/p/manuscripts"]}>
        <ProductionUnifiedManuscriptFlow
          projectId="graph"
          workId="work"
          process={text}
          candidate={review}
          editorHref="/studio/work/work/comic?artifact=story-a"
          onOpen={open}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "텍스트 공정도 같은 제출·검수·승인 기준을 사용합니다" })).toBeTruthy();
    expect(screen.getByText("완료 기준본 · 읽기 우선")).toBeTruthy();
    expect(screen.getByText("PINNED story-a-review")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "전체 페이지 빠른 출력" }));
    await waitFor(() => expect(f.collectPages).toHaveBeenCalledTimes(1));
    expect(f.buildArchive).toHaveBeenCalledTimes(1);
    expect(f.downloadArchive).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/승인 FINAL CBZ로 저장했습니다/u)).toBeTruthy();

    rerender(
      <MemoryRouter initialEntries={["/production/projects/p/manuscripts"]}>
        <ProductionAdoptionCenter
          isDemo={false}
          process={text}
          candidate={review}
          editorHref="/studio/work/work/comic?artifact=story-a"
          externalReviewHref="/review/fixed"
          onOpen={open}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "작가·작업자" }));
    expect(screen.getByRole("heading", { name: "현재 작업본 이어서 편집" })).toBeTruthy();
    expect(screen.getByText("실제 프로젝트 문맥")).toBeTruthy();
  });
});
