// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioDraftSaveCenter } from "../StudioDraftSaveCenter";
import { acknowledgeStudioDurableSaveIntent, studioDurableSaveIntentRepository as repository } from "../studio-durable-save-intent";
import { resetStudioReliabilityStatus } from "../studio-reliability-status-store";

const rows = vi.hoisted(() => new Map<string, string>());
vi.mock("../studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: async () => ({
  kvGet: async (_ns: string, key: string) => rows.get(key) ?? null,
  kvSet: async (_ns: string, key: string, value: string) => { rows.set(key, value); },
  kvDelete: async (_ns: string, key: string) => { rows.delete(key); },
}) }));
const scope = { ownerId: "owner-a", documentKey: "work:1" };
const props = {
  saving: false, workId: "work-1", workHydrated: true, saveIntentScope: scope,
  serverCurrentRevision: 7, loadedWork: { id: "work-1", revision: 7 },
  autosaveDocumentLeadership: { role: "leader" as const, basis: "web-lock" as const },
  onSaveDraft: vi.fn(async () => undefined), onOpenVersions: vi.fn(), onExportBackup: vi.fn(),
};
function online(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}
function open() { fireEvent.click(screen.getByRole("button", { name: /^저장 상태:/u })); }
beforeEach(() => { rows.clear(); online(true); vi.clearAllMocks(); });
afterEach(() => { cleanup(); sessionStorage.clear(); resetStudioReliabilityStatus(); });

describe("restart-safe save intent UI", () => {
  it("restores the reminder after sessionStorage is gone without automatically saving", async () => {
    await repository.remember(scope, 7);
    sessionStorage.clear();
    render(<StudioDraftSaveCenter {...props} />);
    await screen.findByRole("button", { name: "저장 상태: 저장 대기 기록 확인" });
    open();
    expect(screen.getByText("다시 켜도 저장 대기를 기억해요")).toBeTruthy();
    act(() => window.dispatchEvent(new Event("online")));
    expect(props.onSaveDraft).not.toHaveBeenCalled();
    expect(await repository.load(scope)).not.toBeNull();
  });
  it("does not expose the previous owner's intent after account changes", async () => {
    await repository.remember(scope, 7);
    const view = render(<StudioDraftSaveCenter {...props} />);
    await screen.findByRole("button", { name: "저장 상태: 저장 대기 기록 확인" });
    view.rerender(<StudioDraftSaveCenter {...props} saveIntentScope={{ ...scope, ownerId: "owner-b" }} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "저장 상태: 저장 대기 기록 확인" })).toBeNull());
    expect(await repository.load(scope)).not.toBeNull();
  });
  it("keeps the pending intent even when a server revision advances elsewhere", async () => {
    await repository.remember(scope, 7);
    render(<StudioDraftSaveCenter {...props} serverCurrentRevision={9} />);
    await screen.findByRole("button", { name: "저장 상태: 저장 대기 기록 확인" });
    expect(await repository.load(scope)).not.toBeNull();
    expect(props.onSaveDraft).not.toHaveBeenCalled();
  });
  it("records an offline new local document without a server id", async () => {
    online(false);
    const local = { ownerId: null, documentKey: "local-1" };
    render(<StudioDraftSaveCenter {...props} workId={null} loadedWork={null} serverCurrentRevision={undefined} saveIntentScope={local} />);
    open(); fireEvent.click(screen.getByRole("button", { name: "연결 후 저장 예약" }));
    await screen.findByText("다시 켜도 저장 대기를 기억해요");
    expect((await repository.load(local))?.serverRevision).toBeNull();
    expect(props.onSaveDraft).not.toHaveBeenCalled();
  });
  it("retains intent when the handler resolves after only a metadata/error dialog", async () => {
    render(<StudioDraftSaveCenter {...props} />);
    open(); fireEvent.click(screen.getByRole("button", { name: "지금 서버에 저장" }));
    await screen.findAllByText(/서버 저장 완료를 확인하지 못해/u);
    expect(await repository.load(scope)).not.toBeNull();
    expect(props.onSaveDraft).toHaveBeenCalledTimes(1);
  });
  it("clears intent only after the real acknowledgement path", async () => {
    const onSaveDraft = vi.fn(async () => {
      const captured = await repository.load(scope);
      await acknowledgeStudioDurableSaveIntent(scope, captured);
    });
    render(<StudioDraftSaveCenter {...props} onSaveDraft={onSaveDraft} />);
    open(); fireEvent.click(screen.getByRole("button", { name: "지금 서버에 저장" }));
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect(await repository.load(scope)).toBeNull());
  });
  it("cancels restored metadata without modifying the manuscript or invoking a save", async () => {
    await repository.remember(scope, 7);
    render(<StudioDraftSaveCenter {...props} />);
    await screen.findByRole("button", { name: "저장 상태: 저장 대기 기록 확인" });
    open(); fireEvent.click(screen.getByRole("button", { name: "대기 기록 지우기" }));
    await waitFor(async () => expect(await repository.load(scope)).toBeNull());
    expect(props.onSaveDraft).not.toHaveBeenCalled();
    expect(props.onExportBackup).not.toHaveBeenCalled();
  });
});
