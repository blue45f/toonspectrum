import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LEGACY_STUDIO_AUTOSAVE_KEY, parseStudioAutosave, serializeStudioAutosave, studioAutosaveKey } from "./studio-autosave";
import { clearStudioAutosaveRecord, persistStudioAutosaveDeletion, requestStudioAutosaveClear } from "./studio-page-autosave-runtime";

import type { StudioAutosaveOpfsSession, StudioAutosaveRecoveryCandidate } from "./studio-autosave-opfs-session";
import type { StudioAutosaveSqlitePort } from "./studio-autosave-sqlite-store";

const actions = vi.hoisted(() => ({ approve: vi.fn(), record: vi.fn() }));
vi.mock("./studio-destructive-action-preview", async (original) => ({
  ...await original<typeof import("./studio-destructive-action-preview")>(),
  confirmStudioDestructiveAction: actions.approve,
  recordStudioDestructiveOutcome: actions.record,
}));
beforeEach(() => { actions.approve.mockReset().mockResolvedValue(true); actions.record.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); });

function fixture(workId: string | null = null) {
  const key = studioAutosaveKey({ workId });
  const payload = parseStudioAutosave(serializeStudioAutosave({
    version: 2, title: "Previous drawing", savedAt: "2026-09-13T10:00:00Z",
    pagesList: [{ id: "page", elements: [], canvasH: 1080 }],
  }));
  if (!payload) throw new Error("Invalid test fixture");
  const candidate: StudioAutosaveRecoveryCandidate = {
    key, authority: "opfs-journal", savedAt: payload.savedAt, payload, sequence: 1, revision: 1,
  };
  const removeItem = vi.fn();
  vi.stubGlobal("localStorage", { removeItem });
  const context = {
    autosaveKey: key,
    autosaveRecoveryCandidateRef: { current: candidate as StudioAutosaveRecoveryCandidate | null },
    clearAutosaveDurableAuthority: vi.fn(async (): Promise<void> => undefined),
    canClearAutosave: vi.fn(() => true),
    remixId: null, workId: null,
    setHasAutosave: vi.fn(), setAutosaveRestoreBlockedReason: vi.fn(),
  };
  return { context, candidate, removeItem };
}

describe("explicit drawing deletion", () => {
  it("never dismisses or removes the browser copy before durable acknowledgement", async () => {
    const f = fixture();
    let complete!: () => void;
    f.context.clearAutosaveDurableAuthority.mockImplementation(() => new Promise<void>((resolve) => { complete = resolve; }));
    const deleting = clearStudioAutosaveRecord(f.context);
    expect(f.removeItem).not.toHaveBeenCalled();
    expect(f.context.setHasAutosave).not.toHaveBeenCalled();
    complete();
    expect(await deleting).toBe(true);
    expect(f.context.autosaveRecoveryCandidateRef.current).toBeNull();
    expect(f.context.setHasAutosave).toHaveBeenCalledWith(false);
  });

  it("preserves the exportable candidate and browser copy on storage failure", async () => {
    const f = fixture();
    f.context.clearAutosaveDurableAuthority.mockRejectedValue(new Error("quota"));
    await expect(clearStudioAutosaveRecord(f.context)).rejects.toThrow("quota");
    expect(f.removeItem).not.toHaveBeenCalled();
    expect(f.context.autosaveRecoveryCandidateRef.current).toBe(f.candidate);
    expect(f.context.setHasAutosave).not.toHaveBeenCalled();
  });

  it.each(["candidate", "authority"])("does not dismiss a drawing whose %s changes during the write", async (reason) => {
    const f = fixture();
    f.context.clearAutosaveDurableAuthority.mockImplementation(async () => {
      if (reason === "candidate") f.context.autosaveRecoveryCandidateRef.current = { ...f.candidate };
      else f.context.canClearAutosave.mockReturnValue(false);
    });
    expect(await clearStudioAutosaveRecord(f.context)).toBe(false);
    expect(f.removeItem).not.toHaveBeenCalled();
    expect(f.context.setHasAutosave).not.toHaveBeenCalled();
  });

  it("never clears the legacy drawing when deleting a separately named draft", async () => {
    const f = fixture("draft:separate-drawing");
    await clearStudioAutosaveRecord(f.context);
    expect(f.removeItem).toHaveBeenCalledWith(f.context.autosaveKey);
    expect(f.removeItem).not.toHaveBeenCalledWith(LEGACY_STUDIO_AUTOSAVE_KEY);
  });

  it("keeps the candidate when a browser mirror refuses deletion", async () => {
    const f = fixture();
    f.removeItem.mockImplementation(() => { throw new Error("denied"); });
    await expect(clearStudioAutosaveRecord(f.context)).rejects.toThrow();
    expect(f.context.autosaveRecoveryCandidateRef.current).toBe(f.candidate);
    expect(f.context.setHasAutosave).not.toHaveBeenCalled();
  });

  it("does nothing when confirmation is cancelled", async () => {
    const f = fixture();
    actions.approve.mockResolvedValue(false);
    const clearAutosaveRecord = vi.fn(async () => true);
    await requestStudioAutosaveClear({ ...f.context, clearAutosaveRecord });
    expect(clearAutosaveRecord).not.toHaveBeenCalled();
    expect(actions.record).not.toHaveBeenCalled();
  });

  it.each(["candidate", "authority"])("revalidates %s after the confirmation dialog", async (reason) => {
    const f = fixture();
    actions.approve.mockImplementation(async () => {
      if (reason === "candidate") f.context.autosaveRecoveryCandidateRef.current = { ...f.candidate };
      else f.context.canClearAutosave.mockReturnValue(false);
      return true;
    });
    const clearAutosaveRecord = vi.fn(async () => true);
    await requestStudioAutosaveClear({ ...f.context, clearAutosaveRecord });
    expect(clearAutosaveRecord).not.toHaveBeenCalled();
    expect(actions.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: "refused" }));
  });

  it("reports a failed async deletion instead of premature success", async () => {
    const f = fixture();
    const clearAutosaveRecord = vi.fn(async () => { throw new Error("Storage unavailable"); });
    await requestStudioAutosaveClear({ ...f.context, clearAutosaveRecord });
    expect(actions.record).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ outcome: "failed", detail: "Storage unavailable" }));
  });

  it.each(["unavailable", "partial-failure", "success"])("requires acknowledgements from durable stores: %s", async (mode) => {
    const clearOpfs = vi.fn(async () => undefined);
    const clearSqlite = vi.fn(async () => { if (mode === "partial-failure") throw new Error("busy"); });
    const context = {
      autosaveKey: "drawing",
      autosaveOpfsSessionRef: { current: Promise.resolve(mode === "unavailable" ? null : { clear: clearOpfs } as unknown as StudioAutosaveOpfsSession) },
      autosaveSqliteStoreRef: { current: Promise.resolve(mode === "unavailable" ? null : { clear: clearSqlite } as unknown as StudioAutosaveSqlitePort) },
    };
    if (mode === "success") await expect(persistStudioAutosaveDeletion(context)).resolves.toBeUndefined();
    else await expect(persistStudioAutosaveDeletion(context)).rejects.toThrow();
    if (mode !== "unavailable") {
      expect(clearOpfs).toHaveBeenCalledOnce();
      expect(clearSqlite).toHaveBeenCalledWith("drawing", expect.any(String));
    }
  });
});


describe("background deletion compatibility", () => {
  it.each(["unavailable", "partial-failure", "all-failed"])("keeps best-effort housekeeping distinct from explicit deletion: %s", async (mode) => {
    const context = {
      autosaveKey: "drawing",
      autosaveOpfsSessionRef: { current: Promise.resolve(mode === "unavailable" ? null : {
        clear: async () => { if (mode === "all-failed") throw new Error("denied"); },
      } as unknown as StudioAutosaveOpfsSession) },
      autosaveSqliteStoreRef: { current: Promise.resolve(mode === "unavailable" ? null : {
        clear: async () => { throw new Error("busy"); },
      } as unknown as StudioAutosaveSqlitePort) },
    };
    if (mode === "all-failed") await expect(persistStudioAutosaveDeletion(context, false)).rejects.toThrow();
    else await expect(persistStudioAutosaveDeletion(context, false)).resolves.toBeUndefined();
  });
});
