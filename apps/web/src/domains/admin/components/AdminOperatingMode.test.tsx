// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialOperationPolicy, resolveOperationPolicy } from "@toonspectrum/contracts/operation-policy";
import { AdminOperatingMode } from "./AdminOperatingMode";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/platform/api", () => ({ api: mocks, getApiErrorMessage: async (error: unknown) => error instanceof Error ? error.message : "실패" }));
const policy = () => ({ revision: 0, draft: initialOperationPolicy(), updatedAt: "2026-09-22T00:00:00Z" });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({ policy: policy(), effective: resolveOperationPolicy(policy(), null, new Date()), runtimeFingerprint: null, audit: [] });
  mocks.post.mockImplementation(async (path, body) => path.endsWith("/preview") ? { expectedRevision: 0, digest: "a".repeat(64),
    blockedReasons: body.draft.mode === "paid" ? ["검토 근거가 필요합니다."] : [], changes: ["기존 자료 보존"],
    effective: resolveOperationPolicy({ ...policy(), draft: body.draft }, null, new Date()) } : { acceptedRevision: 1 });
});
afterEach(cleanup);
describe("existing administrator console operating mode", () => {
  it("requires preview before applying a mode and blocks unreviewed paid transition", async () => {
    render(<AdminOperatingMode uid="admin" />);
    await screen.findByRole("radio", { name: "무료 운영" });
    fireEvent.click(screen.getByRole("radio", { name: "유료 운영" }));
    expect(mocks.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "운영 변경 미리보기" }));
    await screen.findByText("검토 근거가 필요합니다.");
    expect((screen.getByRole("button", { name: "확인한 운영 정책 적용" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("sends profile changes with revision, preview and mutation ID", async () => {
    render(<AdminOperatingMode uid="admin" />);
    await screen.findByRole("radio", { name: "무료 운영" });
    fireEvent.change(screen.getByLabelText("무료 운영 소유 팀 한도"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("변경 사유"), { target: { value: "운영 용량 변경 검증" } });
    fireEvent.click(screen.getByRole("button", { name: "운영 변경 미리보기" }));
    await screen.findByRole("button", { name: "확인한 운영 정책 적용" });
    fireEvent.click(screen.getByRole("button", { name: "확인한 운영 정책 적용" }));
    await waitFor(() => expect(mocks.post.mock.calls.some(([path]) => path.endsWith("/apply"))).toBe(true));
    const call = mocks.post.mock.calls.find(([path]) => path.endsWith("/apply"))!;
    expect(call[1]).toMatchObject({ expectedRevision: 0, previewDigest: "a".repeat(64), reason: "운영 용량 변경 검증" });
    expect(call[1].draft.profiles.free.limits.ownedWorkspaces).toBe(3);
    expect(call[1].mutationId).toMatch(/^[a-f0-9-]{36}$/u);
  });
  it("discards privileged state when the administrator identity changes", async () => {
    const view = render(<AdminOperatingMode uid="admin" />);
    await screen.findByRole("radio", { name: "무료 운영" });
    mocks.get.mockRejectedValue(new Error("관리자 권한 없음"));
    view.rerender(<AdminOperatingMode uid="operator" />);
    expect(screen.queryByRole("radio")).toBeNull();
    await screen.findByText("관리자 권한 없음");
  });
});
