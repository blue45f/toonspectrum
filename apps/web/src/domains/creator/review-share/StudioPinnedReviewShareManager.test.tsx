// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PinnedShareCreate, PinnedShareOwnerView } from "@toonspectrum/studio-project-model/pinned-review-share";

import { persistSession } from "@/domains/auth/public/session/auth-session-state";
import { reviewProductionFixture } from "../review-production/studio-review-production-test-fixture";
import { StudioPinnedReviewShareManager } from "./StudioPinnedReviewShareManager";

const mocks = vi.hoisted(() => ({ list: vi.fn(), sources: vi.fn(), create: vi.fn(), revoke: vi.fn() }));
vi.mock("./studio-pinned-review-share-client", () => ({
  listPinnedReviewShares: mocks.list,
  listPinnedReviewShareSources: mocks.sources,
  createPinnedReviewShare: mocks.create,
  revokePinnedReviewShare: mocks.revoke,
}));

const IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
] as const;
const page = { ordinal: 0, sha256: "a".repeat(64), byteLength: 4096, mediaType: "image/png" as const, width: 800, height: 1200 };
const approved = () => {
  const value = reviewProductionFixture().verified;
  return { ...value, review: { ...value.review, status: "approved" as const } };
};
function ownerView(input: PinnedShareCreate, revokedAt: string | null = null): PinnedShareOwnerView {
  return { id: input.id, input, createdAt: "2026-09-23T00:00:00.000Z", expiresAt: "2030-09-23T00:00:00.000Z", revokedAt, feedback: [] };
}

type CreateResult = { readonly share: PinnedShareOwnerView; readonly token: string | null; readonly replayed: boolean };

beforeEach(() => {
  vi.clearAllMocks();
  persistSession({ user: { id: "owner" }, token: null });
  mocks.sources.mockResolvedValue({ subject: approved().subject, pages: [page], nextOffset: null, approved: true, expiresAt: "2030-09-23T00:00:00.000Z" });
  mocks.list.mockResolvedValue({ items: [], nextCursor: null });
  let index = 0;
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => IDS[index++ % IDS.length]);
});
afterEach(() => {
  cleanup();
  persistSession(null);
  vi.restoreAllMocks();
});

async function openManager() {
  render(<StudioPinnedReviewShareManager verified={approved()} />);
  fireEvent.click(screen.getByText("외부 검토·멘토링·전시 링크"));
  await screen.findByText("1페이지");
}

describe("immutable review share manager", () => {
  it("creates a bounded private comment link and exposes its token only in the returned one-time URL", async () => {
    mocks.create.mockImplementation(async (_workId: string, input: PinnedShareCreate) => ({ share: ownerView(input), token: "A".repeat(43), replayed: false }));
    await openManager();
    fireEvent.click(screen.getByRole("button", { name: "고정 공유 링크 만들기" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    const [workId, input] = mocks.create.mock.calls[0] as [string, PinnedShareCreate];
    expect(workId).toBe(approved().subject.workId);
    expect(input).toMatchObject({ subject: approved().subject, purpose: "external-review", role: "commenter", pageOrdinals: [0], publicationConsent: false });
    const link = await screen.findByRole("textbox", { name: "공유 링크" }) as HTMLInputElement;
    expect(link.value).toContain("/production/pinned-review#token=");
    expect(link.value).not.toContain("?token=");
    expect(link.value).toContain("A".repeat(43));
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("reuses stable request identities after an uncertain failure and explains that replayed private tokens are not shown twice", async () => {
    mocks.create.mockRejectedValueOnce(new Error("uncertain")).mockImplementationOnce(async (_workId: string, input: PinnedShareCreate) => ({ share: ownerView(input), token: null, replayed: true }));
    await openManager();
    const create = screen.getByRole("button", { name: "고정 공유 링크 만들기" });
    fireEvent.click(create);
    await screen.findByText(/같은 입력으로 다시 시도하면 중복 생성하지 않습니다/);
    fireEvent.click(create);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    const first = mocks.create.mock.calls[0]?.[1] as PinnedShareCreate;
    const second = mocks.create.mock.calls[1]?.[1] as PinnedShareCreate;
    expect(second.id).toBe(first.id);
    expect(second.operationId).toBe(first.operationId);
    expect(await screen.findByText(/비공개 토큰은 다시 표시되지 않으므로/)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "공유 링크" })).toBeNull();
  });

  it("requires approved source, stated rights and explicit consent before creating a read-only public showcase", async () => {
    mocks.create.mockImplementation(async (_workId: string, input: PinnedShareCreate) => ({ share: ownerView(input), token: null, replayed: false }));
    await openManager();
    fireEvent.change(screen.getByLabelText("사용 목적"), { target: { value: "showcase" } });
    const create = screen.getByRole("button", { name: "고정 공유 링크 만들기" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("공개 권리 확인 근거"), { target: { value: "작가가 이 승인본의 공개 권리를 확인했습니다." } });
    fireEvent.click(screen.getByRole("checkbox", { name: /명시적으로 동의합니다/ }));
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    const input = mocks.create.mock.calls[0]?.[1] as PinnedShareCreate;
    expect(input).toMatchObject({ purpose: "showcase", role: "viewer", rightsStatement: "작가가 이 승인본의 공개 권리를 확인했습니다.", publicationConsent: true });
    const link = await screen.findByRole("textbox", { name: "공유 링크" }) as HTMLInputElement;
    expect(link.value).toContain(`/showcase/reviews/${input.id}`);
    expect(link.value).not.toContain("token=");
  });

  it("fails closed when the server no longer considers the locally approved review publishable", async () => {
    mocks.sources.mockResolvedValue({ subject: approved().subject, pages: [page], nextOffset: null, approved: false, expiresAt: "2030-09-23T00:00:00.000Z" });
    await openManager();
    fireEvent.change(screen.getByLabelText("사용 목적"), { target: { value: "showcase" } });
    expect((await screen.findByRole("alert")).textContent).toContain("공개 전시는 승인된 검수본에서만 만들 수 있어요.");
    expect((screen.getByRole("checkbox", { name: /명시적으로 동의합니다/ }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "고정 공유 링크 만들기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("removes one-time links and private share lists immediately when the account changes", async () => {
    let resolve!: (value: CreateResult) => void;
    mocks.create.mockImplementation((_workId: string, input: PinnedShareCreate) => new Promise<CreateResult>((done) => {
      resolve = done;
      expect(input.subject).toEqual(approved().subject);
    }));
    await openManager();
    fireEvent.click(screen.getByRole("button", { name: "고정 공유 링크 만들기" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    const input = mocks.create.mock.calls[0]?.[1] as PinnedShareCreate;

    await act(async () => { persistSession({ user: { id: "other" }, token: null }); });
    expect(screen.queryByText("1페이지")).toBeNull();
    await act(async () => { resolve({ share: ownerView(input), token: "B".repeat(43), replayed: false }); });
    expect(screen.queryByRole("textbox", { name: "공유 링크" })).toBeNull();
  });

  it("does not reuse an ambiguous share identity across accounts", async () => {
    vi.mocked(crypto.randomUUID).mockReset();
    IDS.forEach((id) => vi.mocked(crypto.randomUUID).mockReturnValueOnce(id));
    mocks.create
      .mockRejectedValueOnce(new Error("uncertain"))
      .mockImplementationOnce(async (_workId: string, input: PinnedShareCreate) => ({ share: ownerView(input), token: "C".repeat(43), replayed: false }));

    await openManager();
    fireEvent.click(screen.getByRole("button", { name: "고정 공유 링크 만들기" }));
    await screen.findByText(/같은 입력으로 다시 시도하면 중복 생성하지 않습니다/);
    const first = mocks.create.mock.calls[0]?.[1] as PinnedShareCreate;

    await act(async () => { persistSession({ user: { id: "other" }, token: null }); });
    fireEvent.click(screen.getByText("외부 검토·멘토링·전시 링크"));
    await screen.findByText("1페이지");
    fireEvent.click(screen.getByRole("button", { name: "고정 공유 링크 만들기" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    const second = mocks.create.mock.calls[1]?.[1] as PinnedShareCreate;
    expect(second.id).not.toBe(first.id);
    expect(second.operationId).not.toBe(first.operationId);
  });

  it("clears private share evidence while offline and reloads it after reconnection", async () => {
    let online = true;
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
    mocks.create.mockImplementation(async (_workId: string, input: PinnedShareCreate) => ({ share: ownerView(input), token: "D".repeat(43), replayed: false }));
    await openManager();
    fireEvent.click(screen.getByRole("button", { name: "고정 공유 링크 만들기" }));
    expect(await screen.findByRole("textbox", { name: "공유 링크" })).toBeTruthy();

    online = false;
    act(() => globalThis.dispatchEvent(new Event("offline")));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "공유 링크" })).toBeNull());
    expect(await screen.findByText(/연결이 복구되고 화면이 활성화되면/)).toBeTruthy();
    expect(screen.queryByText("1페이지")).toBeNull();

    online = true;
    act(() => globalThis.dispatchEvent(new Event("online")));
    expect(await screen.findByText("1페이지")).toBeTruthy();
    expect(mocks.sources.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("revokes an active link without exposing the old private token", async () => {
    const input: PinnedShareCreate = {
      id: IDS[0], operationId: IDS[1], subject: approved().subject, title: "멘토링 제출본", instructions: "",
      purpose: "mentoring", role: "commenter", pageOrdinals: [0], expiresInHours: 72,
      watermark: true, rightsStatement: "", publicationConsent: false,
    };
    const current = ownerView(input);
    mocks.list.mockResolvedValue({ items: [current], nextCursor: null });
    mocks.revoke.mockResolvedValue(ownerView(input, "2026-09-23T01:00:00.000Z"));
    await openManager();
    fireEvent.click(await screen.findByRole("button", { name: "링크 철회" }));
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith(input.subject.workId, input.id));
    expect(await screen.findByText("철회됨")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "공유 링크" })).toBeNull();
  });
});
