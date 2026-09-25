// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CareerConfirmationPanel } from "./CareerConfirmationPanel";
import { CreatorCareerPanel } from "./CreatorCareerPanel";
import { careerConfirmationClient as client } from "./career-confirmation-client";

import type { CareerConfirmationPreview, CareerConfirmationRequest } from "../../../../../../packages/contracts/src/creator-career-confirmation";
import type { CreatorCareerItem } from "../../../../../../packages/contracts/src/creator-hiring";

const session = vi.hoisted(() => ({ actor: "author" }));
vi.mock("@/shared/lib/store", () => ({ useApp: (select: (s: { userId: string }) => unknown) => select({ userId: session.actor }) }));
vi.mock("./career-confirmation-client", () => ({ careerConfirmationClient: { capability: vi.fn(), collaborators: vi.fn(), preview: vi.fn(), request: vi.fn(), list: vi.fn(), action: vi.fn(), publicSummaries: vi.fn() } }));
vi.mock("@/platform/api", () => ({ getApiErrorMessage: async (e: Error) => e.message, api: { get: vi.fn(async () => []), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock("@/shared/navigation/router-link", () => ({ default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/shared/components/section", () => ({ Container: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../collaboration-ui", () => ({ CollabField: ({ label, children }: { label: string; children: React.ReactNode }) => <label>{label}{children}</label>, CollabNotice: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>, collabButton: "", collabInput: "", collabPrimary: "" }));
const snapshot = { title: "내 비공개 경력", role: "lineart" as const, startMonth: "2026-01", endMonth: "2026-06", episodeFrom: 1, episodeTo: 5, scope: "5화 선화", contribution: "직접 기여", portfolioUrl: "https://example.com/works", rights: "owned" as const, visibility: "private" as const };
const item: CreatorCareerItem = { ...snapshot, id: "career", userId: "author", displayName: "작성자", revision: 1, expectedRevision: 1, proof: "self-declared", updatedAt: "2026-09-20T00:00:00Z", currentVersionId: "version1" };
const teammates = ["target", "second"].map((id) => ({ targetAccountId: id, displayName: `${id} 팀원`, teamId: "team", teamName: "선화팀" }));
const preview: CareerConfirmationPreview = { careerId: "career", versionId: "version1", versionRevision: 1, teamId: "team", targetAccountId: "target", targetName: "target 팀원", snapshot, sourceDigest: "a".repeat(64), requesterMembershipRevision: 1, targetMembershipRevision: 1 };
const incoming = (state: "requested" | "confirmed" = "requested"): CareerConfirmationRequest => ({ id: "request", careerId: "career", versionId: "version1", versionRevision: 1, state, revision: state === "confirmed" ? 2 : 1, direction: "received", counterpartName: "다른 작성자", snapshot, sourceDigest: preview.sourceDigest, createdAt: "2026-09-20T00:00:00Z", expiresAt: "2026-10-20T00:00:00Z", confirmedAt: null, unavailableReason: null, canRespond: state === "requested", canRevoke: true });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { resolve, promise }; }
async function select(target = "target") {
  await screen.findByRole("option", { name: "target 팀원 · 선화팀" });
  fireEvent.change(screen.getByLabelText("확인받을 내 현재 경력"), { target: { value: "career" } });
  fireEvent.change(screen.getByLabelText("확인을 요청할 현재 팀원"), { target: { value: `team:${target}` } });
}
beforeEach(() => {
  session.actor = "author";
  vi.mocked(client.capability).mockResolvedValue({ available: true });
  vi.mocked(client.collaborators).mockResolvedValue({ items: teammates, nextCursor: null });
  vi.mocked(client.preview).mockResolvedValue(preview);
  vi.mocked(client.list).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(client.request).mockResolvedValue({ id: "request", state: "requested", revision: 1 });
  vi.mocked(client.action).mockResolvedValue({ id: "request", state: "confirmed", revision: 2 });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
describe("career counterparty selection, consent, inbox and lifecycle", () => {
  it("previews an own current shareable version and selected real teammate, then submits explicit consent", async () => {
    render(<CareerConfirmationPanel items={[item, { ...item, id: "unshareable", rights: "pending", title: "권리 미확인" }, { ...item, id: "foreign", userId: "other", title: "다른 사람 경력" }]} />);
    await select(); await screen.findByText("target 팀원에게 보일 버전 1");
    expect(screen.queryByRole("option", { name: /권리 미확인|다른 사람 경력/u })).toBeNull();
    const button = screen.getByRole("button", { name: "이 버전 확인 요청 보내기" }); expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/이 요청으로 비공개 경력이 공개되지/u)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/이 버전의 내용과 링크를 선택한 상대방/u)); fireEvent.click(button);
    await waitFor(() => expect(client.request).toHaveBeenCalledTimes(1));
    expect(vi.mocked(client.request).mock.calls[0][0]).toEqual({ careerId: "career", versionId: "version1", teamId: "team", targetAccountId: "target", sourceDigest: preview.sourceDigest, requesterMembershipRevision: 1, targetMembershipRevision: 1, consent: "exact-version-2026-09-20", mutationId: expect.stringMatching(/^[a-f0-9-]{36}$/u) });
    expect(screen.getByText(/팀 참여는 서로의 관계만 보여 주며 실제 작업 완료/u)).toBeTruthy();
  });
  it("discards stale preview replies after changing teammates and resets consent", async () => {
    const first = deferred<CareerConfirmationPreview>(); vi.mocked(client.preview).mockReturnValueOnce(first.promise).mockResolvedValueOnce({ ...preview, targetAccountId: "second", targetName: "second 팀원" });
    render(<CareerConfirmationPanel items={[item]} />); await select();
    fireEvent.change(screen.getByLabelText("확인을 요청할 현재 팀원"), { target: { value: "team:second" } });
    await screen.findByText("second 팀원에게 보일 버전 1");
    await act(async () => first.resolve(preview));
    expect(vi.mocked(client.preview).mock.calls[0][1]?.aborted).toBe(true); expect(screen.queryByText("target 팀원에게 보일 버전 1")).toBeNull();
    expect((screen.getByLabelText(/이 버전의 내용과 링크/u) as HTMLInputElement).checked).toBe(false);
  });
  it.each(["confirmed", "declined", "revoked"] as const)("supports explicit inbox %s with exact request revision", async (action) => {
    vi.mocked(client.list).mockResolvedValue({ items: [incoming(action === "revoked" ? "confirmed" : "requested")], nextCursor: null });
    render(<CareerConfirmationPanel items={[item]} />); await screen.findByText(/다른 작성자 ·/u);
    if (action === "confirmed") {
      fireEvent.click(screen.getByRole("button", { name: "내용 확인 후 응답" }));
      expect((screen.getByRole("button", { name: "이 버전의 기여 확인" }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByLabelText(/기여·기간·범위를 직접 알고 있으며/u)); fireEvent.click(screen.getByRole("button", { name: "이 버전의 기여 확인" }));
    } else if (action === "revoked") { fireEvent.click(screen.getByRole("button", { name: "요청·확인 철회" })); fireEvent.click(screen.getByRole("button", { name: "철회 확정" })); }
    else fireEvent.click(screen.getByRole("button", { name: "확인 요청 거절" }));
    await waitFor(() => expect(client.action).toHaveBeenCalledWith("request", expect.objectContaining({ action, expectedRevision: action === "revoked" ? 2 : 1 }), expect.any(AbortSignal)));
  });
  it("keeps old career editing available when optional confirmation schema returns unavailable", async () => {
    vi.mocked(client.capability).mockRejectedValue(new Error("unavailable"));
    render(<CreatorCareerPanel onResumeCreated={vi.fn()} />);
    await screen.findByText(/상대방 확인 저장소를 사용할 수 없어요/u);
    fireEvent.click(screen.getByRole("button", { name: "경력 작성" })); expect(screen.getByLabelText("경력·작품 이름")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "확인 기능 다시 불러오기" })); await waitFor(() => expect(client.capability).toHaveBeenCalledTimes(2));
  });
  it("fences account switches, aborts private fetches and never displays old-account snapshots", async () => {
    const stale = deferred<CareerConfirmationPreview>(); vi.mocked(client.preview).mockReturnValueOnce(stale.promise);
    const view = render(<CareerConfirmationPanel items={[item]} />); await select();
    session.actor = "new-account"; view.rerender(<CareerConfirmationPanel items={[]} />);
    await act(async () => stale.resolve(preview));
    expect(vi.mocked(client.preview).mock.calls[0][1]?.aborted).toBe(true); expect(screen.queryByText(/target 팀원에게 보일 버전/u)).toBeNull();
    expect(screen.queryByText(/내 비공개 경력/u)).toBeNull();
  });
  it("reuses mutation IDs after uncertain failure and aborts a pending mutation on account unmount", async () => {
    vi.mocked(client.request).mockRejectedValueOnce(new Error("응답 불명"));
    const pending = deferred<{ id: string; state: "requested"; revision: number }>(); vi.mocked(client.request).mockReturnValueOnce(pending.promise);
    const view = render(<CareerConfirmationPanel items={[item]} />); await select(); await screen.findByText("target 팀원에게 보일 버전 1");
    fireEvent.click(screen.getByLabelText(/이 버전의 내용과 링크/u)); fireEvent.click(screen.getByRole("button", { name: "이 버전 확인 요청 보내기" }));
    await screen.findByText("응답 불명"); fireEvent.click(screen.getByRole("button", { name: "이 버전 확인 요청 보내기" }));
    await waitFor(() => expect(client.request).toHaveBeenCalledTimes(2)); expect(vi.mocked(client.request).mock.calls[0][0].mutationId).toBe(vi.mocked(client.request).mock.calls[1][0].mutationId);
    session.actor = "new-account"; view.rerender(<CareerConfirmationPanel items={[]} />);
    await act(async () => pending.resolve({ id: "request", state: "requested", revision: 1 }));
    expect(vi.mocked(client.request).mock.calls[1][1]?.aborted).toBe(true); expect(screen.queryByText(/요청 결과를 저장했어요/u)).toBeNull();
  });
  it("loads sent and received bounded pages and removes unavailable snapshots and response actions", async () => {
    vi.mocked(client.list).mockImplementation(async (direction, after) => ({ items: [{ ...incoming(), snapshot: null, state: "revoked", canRespond: false, canRevoke: false }], nextCursor: direction === "sent" && !after ? "cursor" : null }));
    render(<CareerConfirmationPanel items={[item]} />); await screen.findByText(/공유 내용을 더 이상 볼 수 없어요/u);
    expect(screen.queryByRole("button", { name: "내용 확인 후 응답" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "보낸 확인 요청" })); await screen.findByRole("button", { name: "다음 요청 30건" }); fireEvent.click(screen.getByRole("button", { name: "다음 요청 30건" }));
    await waitFor(() => expect(client.list).toHaveBeenCalledWith("sent", "cursor", expect.any(AbortSignal)));
  });
});
