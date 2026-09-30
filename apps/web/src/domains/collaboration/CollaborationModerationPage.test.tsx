// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CollaborationModerationPage } from "./CollaborationModerationPage";
import {
  AdminGateOverrideProvider,
  type AdminGateState,
} from "../admin/components/admin-gate-state";

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));
vi.mock("@/platform/collaboration-client", () => ({
  collaborationClient: {
    reports: vi.fn(async () => []),
    moderate: vi.fn(async () => undefined),
  },
}));

function renderWithGate(gate: AdminGateState["gate"], uid?: string) {
  return render(
    <MemoryRouter initialEntries={["/collaborate/moderation"]}>
      <AdminGateOverrideProvider value={{ gate, uid }}>
        <CollaborationModerationPage />
      </AdminGateOverrideProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CollaborationModerationPage 역할 게이트", () => {
  it("운영자가 아니면 신고 목록 대신 접근 불가 안내를 보여준다", () => {
    renderWithGate({ kind: "forbidden" });
    expect(screen.queryByText("운영자만 접근할 수 있어요.")).not.toBeNull();
    expect(screen.queryByText("접수된 신고가 없어요")).toBeNull();
    expect(screen.queryByRole("button", { name: "공고 비공개" })).toBeNull();
  });

  it("게스트에게는 로그인 안내를 보여준다", () => {
    renderWithGate({ kind: "guest" });
    expect(screen.queryByText(/로그인 \/ 회원가입/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "공고 비공개" })).toBeNull();
  });

  it("로딩 중에는 권한 확인 상태를 안내한다", () => {
    renderWithGate({ kind: "loading" });
    expect(screen.getByRole("status").textContent).toContain("운영자 권한을 확인하고 있어요.");
  });

  it("운영자에게는 신고 목록을 보여준다", async () => {
    renderWithGate(
      { kind: "admin", me: { id: "admin-1", name: "운영자", email: null, role: "admin" } },
      "admin-1",
    );
    await screen.findByText("접수된 신고가 없어요");
  });
});
