// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  StudioArtifactRecord,
  StudioRevisionRecord,
} from "../project-graph/studio-project-graph-contract";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";
import { OneClickVersionShare } from "./OneClickVersionShare";

vi.mock("qrcode", () => ({
  toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,mock-qr"),
}));

vi.mock("./production-manuscript-snapshots", async (importOriginal) => {
  const original = await importOriginal<typeof import("./production-manuscript-snapshots")>();
  return {
    ...original,
    createProductionManuscriptSnapshot: vi.fn(
      (...args: Parameters<typeof original.createProductionManuscriptSnapshot>) =>
        original.createProductionManuscriptSnapshot(...args),
    ),
  };
});

const at = (minute: number) => `2026-09-30T01:${String(minute).padStart(2, "0")}:00.000Z`;

function revision(
  id: string,
  kind: StudioRevisionRecord["kind"],
  minute: number,
): StudioRevisionRecord {
  return {
    id,
    artifactId: "artifact-ocvs",
    kind,
    parentIds: [],
    rootGraphHash: "b".repeat(64),
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

const artifact: StudioArtifactRecord = {
  id: "artifact-ocvs",
  projectId: "graph-project",
  kind: "canvas-2d",
  title: "13화 작화 원고",
  scope: { projectId: "graph-project", seasonId: "season-1", episodeId: "episode-13" },
  headRevisionId: "revision-head",
  approvedRevisionId: null,
  ownerWorkspaceId: "workspace-1",
  createdAt: at(1),
  updatedAt: at(8),
};

function makeProcess(head: StudioRevisionRecord | null): ProductionManuscriptProcess {
  return {
    artifact,
    processType: "image",
    label: "작화 원고",
    revisions: head ? [head] : [],
    reviews: [],
    headRevision: head,
    submissionRevision: null,
    reviewSnapshotRevision: null,
    approvedRevision: null,
    releaseRevision: null,
    latestReview: null,
    lifecyclePhase: "editing",
    hasUnapprovedChanges: true,
    readyToDeliver: false,
    openReviewCount: 0,
    openRequiredFeedbackCount: 0,
    latestActivityAt: at(8),
  };
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
});

describe("OneClickVersionShare", () => {
  it("원클릭 버튼을 렌더한다", () => {
    render(<OneClickVersionShare process={makeProcess(headRevision)} canEdit onChanged={() => {}} />);
    expect(screen.getByRole("button", { name: /새 버전 만들고 공유하기/ })).toBeTruthy();
  });

  it("편집 권한이 없으면 버튼이 비활성화된다", () => {
    render(<OneClickVersionShare process={makeProcess(headRevision)} canEdit={false} onChanged={() => {}} />);
    expect((screen.getByRole("button", { name: /새 버전 만들고 공유하기/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("HEAD가 없으면 버튼이 비활성화된다", () => {
    render(<OneClickVersionShare process={makeProcess(null)} canEdit onChanged={() => {}} />);
    expect((screen.getByRole("button", { name: /새 버전 만들고 공유하기/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("원클릭으로 버전 스냅샷 + 공유 링크가 발급된다", async () => {
    const onChanged = vi.fn();
    render(<OneClickVersionShare process={makeProcess(headRevision)} canEdit onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: /새 버전 만들고 공유하기/ }));

    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeTruthy();
    });
    expect(screen.getByText(/v1 버전이 공유됐어요!/)).toBeTruthy();
    const urlInput = screen.getByLabelText(/버전 공유 링크/) as HTMLInputElement;
    expect(urlInput.value).toMatch(/\/share\/version\//);
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getAllByText("v1").length).toBeGreaterThan(0);
  });

  it("공유 설정 패널을 열고 권한을 바꿀 수 있다", async () => {
    render(<OneClickVersionShare process={makeProcess(headRevision)} canEdit onChanged={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /공유 설정/ }));
    expect(screen.getByText(/공유받는 사람 권한/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /보기 전용/ }));
    expect(screen.getByRole("button", { name: /보기 전용/ }).getAttribute("aria-pressed")).toBe("true");

    const expiry = screen.getByLabelText(/링크 만료/) as HTMLSelectElement;
    fireEvent.change(expiry, { target: { value: "0" } });
    expect(expiry.value).toBe("0");

    const watermark = screen.getByRole("checkbox", { name: /워터마크 적용/ }) as HTMLInputElement;
    fireEvent.click(watermark);
    expect(watermark.checked).toBe(false);
  });

  it("링크 복사 시 토스트가 표시된다", async () => {
    render(<OneClickVersionShare process={makeProcess(headRevision)} canEdit onChanged={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /새 버전 만들고 공유하기/ }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /링크 복사/ })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /링크 복사/ }));
    await waitFor(() => {
      expect(screen.queryByText(/복사됨! 링크를 전달해 보세요/)).toBeTruthy();
    });
    expect(window.navigator.clipboard.writeText).toHaveBeenCalled();
  });

  it("두 번째 원클릭으로 v2가 만들어진다", async () => {
    render(<OneClickVersionShare process={makeProcess(headRevision)} canEdit onChanged={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /새 버전 만들고 공유하기/ }));
    await waitFor(() => {
      expect(screen.queryAllByText("v1").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: /새 버전 만들고 공유하기/ }));
    await waitFor(() => {
      expect(screen.queryAllByText("v2").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByRole("button", { name: /이 버전으로 공유/ }).length).toBeGreaterThan(0);
  });

  it("마법사 브리지가 있으면 상세 설정 버튼을 보여준다", async () => {
    const onOpenFullWizard = vi.fn();
    render(
      <OneClickVersionShare
        process={makeProcess(headRevision)}
        canEdit
        onChanged={() => {}}
        onOpenFullWizard={onOpenFullWizard}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /새 버전 만들고 공유하기/ }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /외부 검수 마법사로 상세 설정하기/ })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /외부 검수 마법사로 상세 설정하기/ }));
    expect(onOpenFullWizard).toHaveBeenCalled();
  });

  it("마법사 브리지가 없으면 상세 설정 버튼을 숨긴다", async () => {
    render(<OneClickVersionShare process={makeProcess(headRevision)} canEdit onChanged={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /새 버전 만들고 공유하기/ }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /링크 복사/ })).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: /외부 검수 마법사로 상세 설정하기/ })).toBeNull();
  });

  it("공유 링크를 회수할 수 있다", async () => {
    render(<OneClickVersionShare process={makeProcess(headRevision)} canEdit onChanged={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /새 버전 만들고 공유하기/ }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /공유 링크 회수/ })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /공유 링크 회수/ }));
    await waitFor(() => {
      expect(screen.getAllByText(/회수됨/).length).toBeGreaterThan(0);
    });
  });

  it("히어로에 3단계 플로우 도식이 있다", () => {
    render(<OneClickVersionShare process={makeProcess(headRevision)} canEdit onChanged={() => {}} />);
    expect(screen.getByText("작업본")).toBeTruthy();
    expect(screen.getByText("버전 저장")).toBeTruthy();
    expect(screen.getByText("링크 공유")).toBeTruthy();
  });

  it("빈 상태에서 '첫 버전 만들기'를 누르면 v1이 생성된다", async () => {
    render(<OneClickVersionShare process={makeProcess(headRevision)} canEdit onChanged={() => {}} />);
    expect(screen.getByText(/아직 버전이 없습니다/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /첫 버전 만들기/ }));

    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeTruthy();
    });
    expect(screen.getByText(/v1 버전이 공유됐어요!/)).toBeTruthy();
  });

  it("버전 저장 실패 시 에러 배너와 '다시 시도'를 보여주고 재시도하면 성공한다", async () => {
    const snapshots = await import("./production-manuscript-snapshots");
    vi.mocked(snapshots.createProductionManuscriptSnapshot).mockReturnValueOnce(null);

    render(<OneClickVersionShare process={makeProcess(headRevision)} canEdit onChanged={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /새 버전 만들고 공유하기/ }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeTruthy();
    });
    expect(screen.getByText(/버전을 저장하지 못했습니다/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /다시 시도/ }));

    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeTruthy();
    });
    expect(screen.getByText(/v1 버전이 공유됐어요!/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
