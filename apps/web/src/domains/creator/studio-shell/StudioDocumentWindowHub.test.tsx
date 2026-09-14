// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  OpenStudioDocumentWorkspaceInput,
  StudioDocumentWindowOpenStatus,
} from "../studio-document-window-launcher";
import { parseStudioDocumentLocation } from "../studio-document-workspace";
import { StudioDocumentWindowHub } from "./StudioDocumentWindowHub";

const runtime = vi.hoisted(() => ({
  open: vi.fn((_input: OpenStudioDocumentWorkspaceInput): StudioDocumentWindowOpenStatus => "opened"),
  focus: vi.fn((_instanceId: string) => true),
  snapshot: {
    local: {
      instanceId: "studio-window-current-1234",
      workspace: "draw" as const,
      visible: true,
      focused: true,
      openedAt: 1,
      lastSeenAt: 1,
    },
    peers: [] as Array<{
      instanceId: string;
      workspace: "review";
      visible: boolean;
      focused: boolean;
      openedAt: number;
      lastSeenAt: number;
    }>,
    transport: "broadcast" as const,
  },
}));

vi.mock("../studio-document-window-launcher", () => ({
  openStudioDocumentWorkspace: runtime.open,
}));
vi.mock("../studio-router/useStudioDocumentWindows", () => ({
  useStudioDocumentWindows: () => ({
    snapshot: runtime.snapshot,
    requestFocus: runtime.focus,
  }),
}));

function resolution() {
  const parsed = parseStudioDocumentLocation({
    pathname: "/studio/p/project-1/d/document-1",
    search: "?workspace=draw&focus=cut%3A2&language=ko&version=v3&room=team-a",
  });
  if (parsed.kind !== "document") throw new Error("document fixture failed");
  return parsed;
}

function renderHub() {
  const onChangeWorkspace = vi.fn();
  render(
    <StudioDocumentWindowHub
      locale="ko"
      resolution={resolution()}
      search="?workspace=draw&focus=cut%3A2&language=ko&version=v3&room=team-a"
      onChangeWorkspace={onChangeWorkspace}
    />,
  );
  return { onChangeWorkspace };
}

beforeEach(() => {
  runtime.open.mockReset().mockReturnValue("opened");
  runtime.focus.mockReset().mockReturnValue(true);
  runtime.snapshot.peers = [];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("StudioDocumentWindowHub", () => {
  it("keeps the grouped workspace switcher and direct tab/window actions", () => {
    renderHub();

    const select = screen.getByRole("combobox", { name: "문서 작업공간" });
    expect(screen.getAllByRole("group")).toHaveLength(6);
    expect(screen.getAllByRole("option")).toHaveLength(13);
    expect((select as HTMLSelectElement).value).toBe("draw");

    fireEvent.click(screen.getByRole("button", {
      name: "현재 작업공간을 새 탭으로 열기",
    }));
    expect(runtime.open).toHaveBeenCalledWith(expect.objectContaining({
      workspace: "draw",
      mode: "tab",
      href: expect.stringContaining("room=team-a"),
    }));
  });

  it("opens from the keyboard and copies a canonical cross-browser link", async () => {
    const writeText = vi.fn(async (_value: string) => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderHub();

    fireEvent.keyDown(window, { key: "m", metaKey: true, shiftKey: true });
    expect(screen.getByRole("dialog", { name: "여러 창 작업공간" })).toBeTruthy();
    expect(screen.getByText("탭 자동 감지")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "다른 브라우저 링크 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0]?.[0]).toContain(
      "/studio/p/project-1/d/document-1?focus=cut%3A2&language=ko&room=team-a&version=v3&workspace=draw",
    );
    expect(screen.getByRole("status").textContent).toContain("링크를 복사했습니다");
  });

  it("opens production presets as positioned companion windows", () => {
    renderHub();
    fireEvent.click(screen.getByRole("button", { name: "1창" }));
    const preset = screen.getByRole("heading", { name: "원고 제작" }).closest("article");
    if (!preset) throw new Error("preset article missing");

    fireEvent.click(within(preset).getByRole("button", { name: "타일 창" }));
    expect(runtime.open).toHaveBeenCalledTimes(2);
    expect(runtime.open.mock.calls.map(([input]) => ({
      workspace: input.workspace,
      mode: input.mode,
      index: input.index,
      total: input.total,
    }))).toEqual([
      { workspace: "comic", mode: "window", index: 0, total: 2 },
      { workspace: "review", mode: "window", index: 1, total: 2 },
    ]);
  });

  it("discovers a peer and requests focus without exposing its internal id", () => {
    runtime.snapshot.peers = [{
      instanceId: "studio-window-review-5678",
      workspace: "review",
      visible: true,
      focused: false,
      openedAt: 2,
      lastSeenAt: 2,
    }];
    renderHub();

    fireEvent.click(screen.getByRole("button", { name: "2창" }));
    fireEvent.click(screen.getByRole("button", { name: "이 탭으로 전환" }));
    expect(runtime.focus).toHaveBeenCalledWith("studio-window-review-5678");
    expect(screen.getByRole("dialog").textContent).not.toContain(
      "studio-window-review-5678",
    );
  });

  it("surfaces a visible recovery message when the browser blocks a view", () => {
    runtime.open.mockReturnValue("blocked");
    renderHub();

    fireEvent.click(screen.getByRole("button", {
      name: "현재 작업공간을 독립 창으로 열기",
    }));
    fireEvent.click(screen.getByRole("button", { name: "1창" }));

    expect(screen.getByRole("status").textContent).toContain(
      "브라우저가 새 창을 차단했습니다",
    );
  });
});
