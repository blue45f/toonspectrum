// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  StudioArtifactRecord,
  StudioRevisionRecord,
} from "../project-graph/studio-project-graph-contract";
import {
  createProductionManuscriptSnapshot,
  type ProductionManuscriptSnapshotSource,
} from "./production-manuscript-snapshots";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";
import { ProductionManuscriptSnapshotPanel } from "./ProductionManuscriptSnapshotPanel";

const f = vi.hoisted(() => ({
  restoreRevision: vi.fn(),
}));

vi.mock("../project-graph/studio-project-graph-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../project-graph/studio-project-graph-client")>();
  return { ...actual, restoreStudioRevision: f.restoreRevision };
});

const at = (minute: number) => `2026-09-23T01:${String(minute).padStart(2, "0")}:00.000Z`;

function revision(
  id: string,
  kind: StudioRevisionRecord["kind"],
  minute: number,
): StudioRevisionRecord {
  return {
    id,
    artifactId: "artifact-image",
    kind,
    parentIds: [],
    rootGraphHash: "a".repeat(64),
    operationFirst: null,
    operationLast: null,
    createdBy: "owner-user",
    deviceId: "device-1",
    createdAt: at(minute),
    message: `${kind} ${id}`,
    compatibilityReportId: null,
    provenanceManifestId: null,
    blobRefs: [],
  };
}

const headRevision = revision("revision-head", "checkpoint", 8);
const approvedRevision = revision("revision-approved", "approved", 5);

const artifact: StudioArtifactRecord = {
  id: "artifact-image",
  projectId: "graph-project",
  kind: "canvas-2d",
  title: "12화 작화 원고",
  scope: { projectId: "graph-project", seasonId: "season-1", episodeId: "episode-12" },
  headRevisionId: "revision-head",
  approvedRevisionId: "revision-approved",
  ownerWorkspaceId: "workspace-1",
  createdAt: at(1),
  updatedAt: at(8),
};

const processFixture: ProductionManuscriptProcess = {
  artifact,
  processType: "image",
  label: "작화 원고",
  revisions: [headRevision, approvedRevision],
  reviews: [],
  headRevision,
  submissionRevision: null,
  reviewSnapshotRevision: null,
  approvedRevision,
  releaseRevision: null,
  latestReview: null,
  lifecyclePhase: "editing",
  hasUnapprovedChanges: true,
  readyToDeliver: false,
  openReviewCount: 0,
  openRequiredFeedbackCount: 0,
  latestActivityAt: at(8),
};

function stubDialog() {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  }) as unknown as typeof HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  }) as unknown as typeof HTMLDialogElement.prototype.close;
}

beforeEach(() => {
  window.localStorage.clear();
  stubDialog();
  f.restoreRevision.mockResolvedValue({
    artifactId: "artifact-image",
    revisionId: "revision-restored",
    headRevisionId: "revision-restored",
    approvedRevisionId: "revision-approved",
    sequence: 4,
    replayed: false,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPanel(canEdit = true, onChanged = vi.fn()) {
  render(
    <ProductionManuscriptSnapshotPanel
      process={processFixture}
      canEdit={canEdit}
      onChanged={onChanged}
    />,
  );
  return onChanged;
}

function takeSnapshot(memo = "") {
  if (memo) {
    fireEvent.change(screen.getByPlaceholderText("메모 (선택, 예: 콘티 수정 전)"), {
      target: { value: memo },
    });
  }
  fireEvent.click(screen.getByRole("button", { name: "스냅샷 찍기" }));
}

describe("ProductionManuscriptSnapshotPanel", () => {
  it("saves the current head as v1 with one click", () => {
    renderPanel();
    takeSnapshot("콘티 수정 전");

    expect(screen.getByRole("listitem", { name: "v1 스냅샷" })).toBeTruthy();
    expect(screen.getByDisplayValue("콘티 수정 전")).toBeTruthy();
    expect(screen.getByText("HEAD · 현재 작업본")).toBeTruthy();
    expect(screen.getByText("v1 스냅샷을 저장했습니다. 메모는 목록에서 언제든 수정할 수 있습니다.")).toBeTruthy();
  });

  it("auto-increments version names across snapshots", () => {
    renderPanel();
    takeSnapshot();
    takeSnapshot();

    expect(screen.getByRole("listitem", { name: "v1 스냅샷" })).toBeTruthy();
    expect(screen.getByRole("listitem", { name: "v2 스냅샷" })).toBeTruthy();
  });

  it("compares two snapshots side by side and overlaid", () => {
    renderPanel();
    takeSnapshot();
    takeSnapshot();

    const cards = screen.getAllByRole("listitem", { name: /v\d 스냅샷/ });
    fireEvent.click(within(cards[0]).getByRole("button", { name: "비교에 담기" }));
    fireEvent.click(within(cards[1]).getByRole("button", { name: "비교에 담기" }));

    expect(screen.getByRole("heading", { name: /버전 비교/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: "A · v2 버전 정보" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "겹치기" }));
    expect(screen.getByLabelText(/불투명도/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "나란히 보기" }));
    expect(screen.getByRole("region", { name: "B · v1 버전 정보" })).toBeTruthy();
  });

  it("restores an older snapshot through a confirm dialog without overwriting history", async () => {
    const onChanged = renderPanel();
    const older: ProductionManuscriptSnapshotSource = {
      revisionId: "revision-old",
      rootGraphHash: "c".repeat(64),
      revisionKind: "checkpoint",
      revisionMessage: "old checkpoint",
    };
    createProductionManuscriptSnapshot("artifact-image", older, "옛 버전");
    // 다시 렌더링하지 않고 저장소를 직접 심었으므로 패널을 새로 마운트한다.
    cleanup();
    renderPanel(true, onChanged);

    const oldCard = screen.getByRole("listitem", { name: "v1 스냅샷" });
    fireEvent.click(within(oldCard).getByRole("button", { name: "복원" }));

    expect(screen.getByRole("heading", { name: "스냅샷 복원" })).toBeTruthy();
    expect(screen.getByText(/기존 이력을 덮어쓰지 않고 새 체크포인트를 만듭니다/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "복원하기" }));
    await waitFor(() => expect(f.restoreRevision).toHaveBeenCalledTimes(1));
    expect(f.restoreRevision).toHaveBeenCalledWith(
      "artifact-image",
      "revision-old",
      "revision-head",
      expect.objectContaining({
        message: expect.stringContaining("v1 스냅샷에서 복원"),
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(screen.getByText("새 복원 체크포인트를 만들었습니다. 과거와 현재 버전은 모두 보존됩니다.")).toBeTruthy();
  });

  it("marks the head snapshot and hides restore for it", () => {
    renderPanel();
    takeSnapshot();

    const card = screen.getByRole("listitem", { name: "v1 스냅샷" });
    expect(within(card).getByText("HEAD · 현재 작업본")).toBeTruthy();
    expect(within(card).queryByRole("button", { name: "복원" })).toBeNull();
  });

  it("hides snapshot actions without edit permission", () => {
    renderPanel(false);
    expect(screen.queryByRole("button", { name: "스냅샷 찍기" })).toBeNull();
  });
});
