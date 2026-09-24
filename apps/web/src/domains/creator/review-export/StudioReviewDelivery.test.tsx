// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_REVIEW_DELIVERY_PROFILE, createReviewDeliveryManifest, type ReviewDeliveryJob } from "@toonspectrum/studio-project-model/review-delivery";
import { persistSession } from "@/compat/auth-session-state";
import { reviewProductionFixture } from "../review-production/studio-review-production-test-fixture";
import { StudioReviewDelivery } from "./StudioReviewDelivery";

const f = vi.hoisted(() => ({ list: vi.fn(), prepare: vi.fn(), issue: vi.fn(), cancel: vi.fn(), accept: vi.fn(), download: vi.fn(), save: vi.fn() }));
vi.mock("./studio-review-delivery-api", () => ({
  listStudioReviewDeliveries: f.list, prepareStudioReviewDelivery: f.prepare, issueStudioReviewDelivery: f.issue,
  cancelStudioReviewDelivery: f.cancel, acceptStudioReviewDelivery: f.accept, downloadStudioReviewDelivery: f.download,
}));
vi.mock("../export/studio-export", () => ({ downloadBlob: f.save }));
const approved = () => { const value = reviewProductionFixture().verified; return { ...value, review: { ...value.review, status: "approved" as const } }; };
const recipient = { userId: "recipient", displayName: "수신 팀원" };
function job(state: ReviewDeliveryJob["state"] = "prepared", overrides: Partial<ReviewDeliveryJob> = {}): ReviewDeliveryJob {
  const value = approved(), rights = { contract: "studio-review-delivery-rights-v1" as const, statementVersion: 1 as const,
    mode: "free" as const, rightsGraphDigest: "c".repeat(64), confirmed: true as const, statement: "Exact approved review delivery rights attestation." };
  const source = { subject: value.subject, approvalDigest: "b".repeat(64), decidedAt: "2026-09-23T00:00:00.000Z",
    pages: [{ ordinal: 0, sha256: "a".repeat(64), byteLength: 3, mediaType: "image/png" as const, width: 10, height: 10 }] };
  const manifest = createReviewDeliveryManifest({ id: "11111111-1111-4111-8111-111111111111", title: "공식 전달",
    preparedAt: "2026-09-23T00:01:00.000Z", source, sourceDigest: "d".repeat(64), profile: DEFAULT_REVIEW_DELIVERY_PROFILE, rights });
  const version = state === "prepared" ? 0 : state === "issued" ? 1 : state === "delivered" ? 2 : 3;
  return { contract: "studio-review-delivery-job-v1", id: manifest.jobId, workId: value.subject.workId, subject: value.subject,
    title: manifest.title, sourceDigest: manifest.source.sourceDigest, profile: DEFAULT_REVIEW_DELIVERY_PROFILE,
    profileDigest: "e".repeat(64), rights, manifest, manifestDigest: "f".repeat(64), recipient,
    state, version, createdBy: "actor", createdAt: manifest.preparedAt,
    issuedAt: state === "prepared" ? null : "2026-09-23T00:02:00.000Z",
    deliveredAt: ["delivered", "accepted"].includes(state) ? "2026-09-23T00:03:00.000Z" : null,
    acceptedAt: state === "accepted" ? "2026-09-23T00:04:00.000Z" : null, cancelledAt: state === "cancelled" ? "2026-09-23T00:04:00.000Z" : null,
    archiveSha256: ["delivered", "accepted"].includes(state) ? "1".repeat(64) : null,
    archiveByteLength: ["delivered", "accepted"].includes(state) ? 100 : null,
    currentRecipientBinding: true, canIssue: state === "prepared", canDownload: state !== "prepared" && state !== "cancelled",
    canAccept: state === "delivered", canCancel: ["prepared", "issued", "delivered"].includes(state), ...overrides };
}
const list = (items: ReviewDeliveryJob[] = [], manager = true) => ({ items, recipients: manager ? [recipient] : [], canPrepare: manager, mode: "free" as const });
beforeEach(() => {
  Object.values(f).forEach((mock) => mock.mockReset()); persistSession({ user: { id: "actor" }, token: null });
  f.list.mockResolvedValue(list());
});
afterEach(() => { cleanup(); persistSession(null); vi.restoreAllMocks(); });
describe("official approved review delivery", () => {
  it("requires an explicit recipient, attestation and confirmation, and admits only one preparation", async () => {
    let resolve!: (value: ReviewDeliveryJob) => void; f.prepare.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<StudioReviewDelivery verified={approved()} />); await screen.findByRole("combobox", { name: "수신 팀원" });
    const create = screen.getByRole("button", { name: "전달 준비" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true); fireEvent.change(screen.getByRole("textbox", { name: "권리·사용 조건 확인 근거" }), { target: { value: "Owner confirms the exact approved delivery conditions." } });
    fireEvent.click(screen.getByRole("checkbox")); expect(create.disabled).toBe(false);
    fireEvent.click(create); fireEvent.click(create); await waitFor(() => expect(f.prepare).toHaveBeenCalledOnce());
    expect(f.prepare.mock.calls[0]![0]).toBe(approved().subject.workId);
    expect(f.prepare.mock.calls[0]![1]).toMatchObject({ subject: approved().subject, recipientUserId: recipient.userId,
      profile: DEFAULT_REVIEW_DELIVERY_PROFILE, rights: { mode: "free", confirmed: true } });
    await act(async () => resolve(job())); expect(f.list).toHaveBeenCalledTimes(2);
  });
  it("issues using the exact manifest digest and expected version", async () => {
    const prepared = job(); f.list.mockResolvedValue(list([prepared])); f.issue.mockResolvedValue(job("issued"));
    render(<StudioReviewDelivery verified={approved()} />); const issue = await screen.findByRole("button", { name: "전달 발행" }); fireEvent.click(issue);
    await waitFor(() => expect(f.issue).toHaveBeenCalledOnce());
    expect(f.issue.mock.calls[0]!.slice(0, 2)).toEqual([prepared.workId, prepared.id]);
    expect(f.issue.mock.calls[0]![2]).toMatchObject({ expectedVersion: prepared.version, manifestDigest: prepared.manifestDigest });
  });
  it("downloads only an issued current binding and records a browser save", async () => {
    const issued = job("issued", { canCancel: false }); f.list.mockResolvedValue(list([issued], false));
    const blob = new Blob(["zip"]); f.download.mockResolvedValue(blob);
    render(<StudioReviewDelivery verified={approved()} />); fireEvent.click(await screen.findByRole("button", { name: "검증 ZIP 저장" }));
    await waitFor(() => expect(f.download).toHaveBeenCalledOnce());
    expect(f.download.mock.calls[0]!.slice(0, 2)).toEqual([issued.workId, issued.id]);
    expect(f.save).toHaveBeenCalledExactlyOnceWith(blob, `toonstudio-approved-delivery-${issued.id}.zip`);
  });
  it("requires an explicit recipient acceptance after delivered evidence", async () => {
    const delivered = job("delivered", { canCancel: false }); f.list.mockResolvedValue(list([delivered], false)); f.accept.mockResolvedValue(job("accepted"));
    render(<StudioReviewDelivery verified={approved()} />); fireEvent.click(await screen.findByRole("button", { name: "수신 완료 확인" }));
    await waitFor(() => expect(f.accept).toHaveBeenCalledOnce());
    expect(f.accept.mock.calls[0]![2]).toMatchObject({ confirmed: true, expectedVersion: delivered.version, manifestDigest: delivered.manifestDigest });
  });
  it("shows a changed binding without download or acceptance controls", async () => {
    f.list.mockResolvedValue(list([job("delivered", { currentRecipientBinding: false, canDownload: false, canAccept: false, canCancel: false })], false));
    render(<StudioReviewDelivery verified={approved()} />); await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "검증 ZIP 저장" })).toBeNull(); expect(screen.queryByRole("button", { name: "수신 완료 확인" })).toBeNull();
  });
  it("reuses the exact preparation identity after an uncertain network result", async () => {
    f.prepare.mockRejectedValueOnce(new Error("lost response")).mockResolvedValueOnce(job());
    render(<StudioReviewDelivery verified={approved()} />);
    await screen.findByRole("combobox", { name: "수신 팀원" });
    fireEvent.change(screen.getByRole("textbox", { name: "권리·사용 조건 확인 근거" }), {
      target: { value: "Owner confirms the exact approved delivery conditions." },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    const prepare = screen.getByRole("button", { name: "전달 준비" });
    fireEvent.click(prepare);
    await screen.findByText(/같은 요청으로 다시 시도하면 중복 처리하지 않습니다/);
    fireEvent.click(prepare);
    await waitFor(() => expect(f.prepare).toHaveBeenCalledTimes(2));
    const first = f.prepare.mock.calls[0]![1];
    const retry = f.prepare.mock.calls[1]![1];
    expect(retry.id).toBe(first.id);
    expect(retry.operationId).toBe(first.operationId);
  });

  it("reuses an issue operation identity after a lost result instead of issuing twice", async () => {
    const prepared = job();
    f.list.mockResolvedValue(list([prepared]));
    f.issue.mockRejectedValueOnce(new Error("lost response")).mockResolvedValueOnce(job("issued"));
    render(<StudioReviewDelivery verified={approved()} />);
    const issue = await screen.findByRole("button", { name: "전달 발행" });
    fireEvent.click(issue);
    await screen.findByText(/같은 요청으로 다시 시도하면 중복 처리하지 않습니다/);
    fireEvent.click(issue);
    await waitFor(() => expect(f.issue).toHaveBeenCalledTimes(2));
    expect(f.issue.mock.calls[1]![2].operationId).toBe(f.issue.mock.calls[0]![2].operationId);
  });

  it("aborts an in-flight download, removes private delivery data offline and reloads after reconnection", async () => {
    let online = true;
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
    const issued = job("issued", { canCancel: false });
    f.list.mockResolvedValue(list([issued], false));
    let signal!: AbortSignal;
    f.download.mockImplementation((_workId, _id, _input, nextSignal: AbortSignal) => {
      signal = nextSignal;
      return new Promise((_resolve, reject) => nextSignal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
    });
    render(<StudioReviewDelivery verified={approved()} />);
    fireEvent.click(await screen.findByRole("button", { name: "검증 ZIP 저장" }));
    await waitFor(() => expect(f.download).toHaveBeenCalledOnce());
    expect(signal.aborted).toBe(false);

    online = false;
    act(() => globalThis.dispatchEvent(new Event("offline")));
    await waitFor(() => expect(signal.aborted).toBe(true));
    expect(screen.queryByRole("button", { name: "검증 ZIP 저장" })).toBeNull();
    expect((await screen.findByRole("alert")).textContent).toContain("연결이 복구되어");

    online = true;
    act(() => globalThis.dispatchEvent(new Event("online")));
    expect(await screen.findByRole("button", { name: "검증 ZIP 저장" })).toBeTruthy();
    expect(f.list.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not carry an uncertain delivery identity into another account", async () => {
    f.prepare.mockRejectedValueOnce(new Error("lost response")).mockResolvedValueOnce(job());
    render(<StudioReviewDelivery verified={approved()} />);
    await screen.findByRole("combobox", { name: "수신 팀원" });
    const fill = () => {
      fireEvent.change(screen.getByRole("textbox", { name: "권리·사용 조건 확인 근거" }), {
        target: { value: "Owner confirms the exact approved delivery conditions." },
      });
      fireEvent.click(screen.getByRole("checkbox"));
    };
    fill();
    fireEvent.click(screen.getByRole("button", { name: "전달 준비" }));
    await screen.findByText(/같은 요청으로 다시 시도하면 중복 처리하지 않습니다/);
    const first = f.prepare.mock.calls[0]![1];

    await act(async () => { persistSession({ user: { id: "other" }, token: null }); });
    await screen.findByRole("combobox", { name: "수신 팀원" });
    fill();
    fireEvent.click(screen.getByRole("button", { name: "전달 준비" }));
    await waitFor(() => expect(f.prepare).toHaveBeenCalledTimes(2));
    const second = f.prepare.mock.calls[1]![1];
    expect(second.id).not.toBe(first.id);
    expect(second.operationId).not.toBe(first.operationId);
  });

  it("reloads for a new account and ignores the previous account's late list result", async () => {
    let resolve!: (value: ReturnType<typeof list>) => void;
    f.list.mockImplementationOnce(() => new Promise((done) => { resolve = done; })).mockResolvedValueOnce(list([], false));
    render(<StudioReviewDelivery verified={approved()} />); act(() => persistSession({ user: { id: "other" }, token: null }));
    await waitFor(() => expect(f.list).toHaveBeenCalledTimes(2));
    await act(async () => resolve(list([job()]))) ;
    expect(screen.queryByText("공식 전달", { selector: "h4" })).toBeNull();
  });
});
