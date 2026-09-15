// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StudioProductionHubPage,
  type StudioProductionSurface,
} from "./StudioProductionHubPage";
import { createEmptyProductionWorkspace } from "./studio-production-workspace";

const database = vi.hoisted(() => ({
  kvGet: vi.fn<(_namespace: string, _key: string) => Promise<string | null>>(async () => null),
  kvSet: vi.fn<(_namespace: string, _key: string, _value: string) => Promise<void>>(async () => undefined),
}));
vi.mock("../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => database,
}));

const server = vi.hoisted(() => ({
  loadWorkspace: vi.fn(),
  saveWorkspace: vi.fn(),
  listReviewLinks: vi.fn(),
  createReviewLink: vi.fn(),
  revokeReviewLink: vi.fn(),
  loadExternalReview: vi.fn(),
  addExternalFeedback: vi.fn(),
}));
vi.mock("./studio-production-server-client", () => {
  class StudioProductionServerConflictError extends Error {
    constructor(readonly currentRevision: number) {
      super("conflict");
    }
  }
  return {
    loadStudioServerProductionWorkspace: server.loadWorkspace,
    saveStudioServerProductionWorkspace: server.saveWorkspace,
    listStudioServerReviewLinks: server.listReviewLinks,
    createStudioServerReviewLink: server.createReviewLink,
    revokeStudioServerReviewLink: server.revokeReviewLink,
    loadStudioExternalReview: server.loadExternalReview,
    addStudioExternalReviewFeedback: server.addExternalFeedback,
    StudioProductionServerConflictError,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  database.kvGet.mockResolvedValue(null);
  database.kvSet.mockResolvedValue(undefined);
  server.loadWorkspace.mockImplementation(async (workId: string) => {
    const document = createEmptyProductionWorkspace(`work:${workId}`);
    return {
      workId,
      revision: document.revision,
      updatedAt: document.updatedAt,
      capabilities: {
        view: true,
        edit: true,
        manageLinks: true,
        manageRoles: true,
        approve: true,
        publish: true,
      },
      document,
    };
  });
  server.listReviewLinks.mockResolvedValue([]);
});
afterEach(cleanup);

function mount(path: string, surface: StudioProductionSurface = "share") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StudioProductionHubPage surface={surface} onOpenStudio={vi.fn()} />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

describe("production scope at the actual React page", () => {
  it.each(["work", "remix"])("loads %s query identity and retains every destination", async (kind) => {
    mount(`/studio/share?scope=${kind}%3Achapter-1`);
    await screen.findByText(kind === "work" ? "팀에 저장됨" : "이 기기에 저장됨");
    if (kind === "work") {
      expect(server.loadWorkspace).toHaveBeenCalledWith("chapter-1");
      expect(database.kvGet).not.toHaveBeenCalled();
    } else {
      expect(database.kvGet).toHaveBeenCalledWith(
        "studio-production-command-center-v1",
        "remix:chapter-1",
      );
      expect(server.loadWorkspace).not.toHaveBeenCalled();
    }
    expect(screen.getByRole("link", { name: "원고 열기" }).getAttribute("href")).toBe(
      `/studio/${kind}/chapter-1/canvas`,
    );
    expect(screen.getByRole("link", { name: "홈" }).getAttribute("href")).toBe(
      `/studio/projects?scope=${kind}%3Achapter-1`,
    );
    expect(screen.getByRole("link", { name: "참여" }).getAttribute("href")).toBe(
      `/studio/join?scope=${kind}%3Achapter-1`,
    );
    expect(database.kvSet).not.toHaveBeenCalled();
  });

  it.each(["scope=work%3Aa&scope=work%3Ab", "scope=work%3A..", "scope=work%3Aa&id=b"])(
    "does not read or overwrite any draft for invalid scope %s",
    async (search) => {
      mount(`/studio/share?${search}`);
      expect(screen.getByRole("alert").textContent).toContain("프로젝트 범위");
      expect(database.kvGet).not.toHaveBeenCalled();
      expect(database.kvSet).not.toHaveBeenCalled();
    },
  );

  it("keys query-only document changes so local edits do not leak across projects", async () => {
    function Harness() {
      const navigate = useNavigate();
      return (
        <>
          <button onClick={() => navigate("/studio/share?scope=remix%3Ab")}>다른 작품</button>
          <StudioProductionHubPage surface="share" onOpenStudio={vi.fn()} />
        </>
      );
    }
    render(
      <MemoryRouter initialEntries={["/studio/share?scope=remix%3Aa"]}>
        <Harness />
      </MemoryRouter>,
    );
    await screen.findByText("이 기기에 저장됨");
    fireEvent.click(screen.getByRole("button", { name: "다른 작품" }));
    await waitFor(() => expect(database.kvGet).toHaveBeenLastCalledWith(
      "studio-production-command-center-v1",
      "remix:b",
    ));
    expect(screen.getByRole("link", { name: "원고 열기" }).getAttribute("href")).toBe(
      "/studio/remix/b/canvas",
    );
    expect(database.kvSet).not.toHaveBeenCalled();
  });

  it("does not steal typing or IME keyboard events for workspace shortcuts", async () => {
    mount("/studio/share?scope=remix%3Aa");
    await screen.findByText("이 기기에 저장됨");
    const input = screen.getByRole("textbox", { name: "프로젝트 제목" });
    fireEvent.keyDown(input, { key: "1", altKey: true });
    expect(document.querySelector("[data-scope-key]")?.getAttribute("data-scope-key")).toBe("remix:a");
    expect(screen.getByRole("link", { name: "공유" }).getAttribute("aria-current")).toBe("page");
    const event = new KeyboardEvent("keydown", {
      key: "1",
      altKey: true,
      isComposing: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not seed fake work or review data into a real work scope", async () => {
    mount("/studio/projects?scope=work%3Achapter-1", "projects");
    await screen.findByText("팀에 저장됨");

    expect(document.querySelector("[data-workspace-mode]")?.getAttribute("data-workspace-mode")).toBe(
      "server-work",
    );
    expect(screen.getByText("등록된 제작 작업이 없습니다")).toBeTruthy();
    expect(screen.queryByText("대사와 장면 의도 확정")).toBeNull();
    expect(screen.queryByText("3컷 시선 방향 불일치")).toBeNull();
    expect(database.kvSet).not.toHaveBeenCalled();
  });

  it("shows seeded content only for an explicit draft demo", async () => {
    mount("/studio/projects?demo=1", "projects");

    await screen.findByText("샘플 · 저장 안 함");
    expect(document.querySelector("[data-workspace-mode]")?.getAttribute("data-workspace-mode")).toBe(
      "demo",
    );
    expect(screen.getByText("대사와 장면 의도 확정")).toBeTruthy();
    expect(screen.getByRole("link", { name: "검토" }).getAttribute("href")).toBe(
      "/studio/review?demo=1",
    );
    expect(screen.getByRole("link", { name: "공유" }).getAttribute("href")).toBe(
      "/studio/share?demo=1",
    );
    expect(screen.getByRole("link", { name: "참여" }).getAttribute("href")).toBe(
      "/studio/join?demo=1",
    );
    expect(database.kvGet).not.toHaveBeenCalled();
    expect(database.kvSet).not.toHaveBeenCalled();
  });

  it("preserves demo mode for Alt-number workspace navigation", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/projects?demo=1"]}>
        <LocationProbe />
        <StudioProductionHubPage surface="projects" onOpenStudio={vi.fn()} />
      </MemoryRouter>,
    );
    await screen.findByText("샘플 · 저장 안 함");

    fireEvent.keyDown(window, { key: "2", altKey: true });
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(
      "/studio/review?demo=1",
    ));
  });

  it("ignores a demo query for saved work scopes", async () => {
    mount("/studio/projects?scope=work%3Achapter-1&demo=1", "projects");
    await screen.findByText("팀에 저장됨");

    expect(document.querySelector("[data-workspace-mode]")?.getAttribute("data-workspace-mode")).toBe(
      "server-work",
    );
    expect(screen.getByRole("link", { name: "검토" }).getAttribute("href")).toBe(
      "/studio/work/chapter-1/review",
    );
    expect(screen.queryByText("대사와 장면 의도 확정")).toBeNull();
  });

  it("fails closed instead of treating local tokens as share authority", async () => {
    mount("/studio/share?scope=remix%3Achapter-1");
    await screen.findByText("이 기기에 저장됨");

    expect(screen.getByText("이 모드에서는 초대 링크를 만들 수 없습니다")).toBeTruthy();
    expect(screen.getByText(/인증 토큰으로 인정하지 않습니다/u)).toBeTruthy();
    expect(database.kvSet).not.toHaveBeenCalled();
  });

  it("does not grant membership from an unverified invite parameter", async () => {
    mount("/studio/join?scope=work%3Achapter-1&invite=ts-local-token", "join");
    await screen.findByText("팀에 저장됨");

    expect(screen.getByText("이 링크는 서버에서 검증되지 않았습니다")).toBeTruthy();
    expect(screen.getByText(/권한 부여 안 됨/u)).toBeTruthy();
    expect(database.kvSet).not.toHaveBeenCalled();
  });

  it("keeps corrupt local data untouched and exposes a recovery error", async () => {
    database.kvGet.mockResolvedValueOnce("{corrupt");
    mount("/studio/projects?scope=remix%3Achapter-1", "projects");

    await screen.findByText("손상된 값을 빈 데이터로 덮어쓰지 않았습니다.");
    expect(screen.getByRole("alert").textContent).toContain("안전하게 열지 못했습니다");
    expect(database.kvSet).not.toHaveBeenCalled();
  });
});
