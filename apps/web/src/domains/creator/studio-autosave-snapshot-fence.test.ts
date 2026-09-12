import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { createStudioAutosaveSnapshotFence } from "./studio-autosave-snapshot-fence";

describe("autosave captured snapshot fence", () => {
  it("rejects a second deferred stroke even when the React history generation did not change", () => {
    const session = {};
    let current = { generation: 1, pendingFingerprint: "p:first", session };
    const isCurrent = createStudioAutosaveSnapshotFence(current, () => current);
    expect(isCurrent()).toBe(true);
    current = { ...current, pendingFingerprint: "p:first,second" };
    expect(isCurrent()).toBe(false);
  });

  it("rejects generation changes and a new document session", () => {
    const scheduled = { generation: 4, pendingFingerprint: "", session: {} };
    let current = scheduled;
    const isCurrent = createStudioAutosaveSnapshotFence(scheduled, () => current);
    current = { ...scheduled, generation: 5 };
    expect(isCurrent()).toBe(false);
    current = { ...scheduled, session: {} };
    expect(isCurrent()).toBe(false);
  });

  it("does not enqueue an obsolete write after asynchronous store preparation", async () => {
    const session = {};
    let current = { generation: 2, pendingFingerprint: "p:one", session };
    const isCurrent = createStudioAutosaveSnapshotFence(current, () => current);
    let ready!: () => void;
    const prepared = new Promise<void>((resolve) => { ready = resolve; });
    const write = vi.fn();
    const pending = (async () => {
      await prepared;
      if (isCurrent()) write();
    })();
    current = { ...current, pendingFingerprint: "p:one,two" };
    ready();
    await pending;
    expect(write).not.toHaveBeenCalled();
  });

  it("wires the fence before the host's debounced write and tombstone paths", () => {
    const host = readFileSync(new URL("./StudioCuttoonEditorHost.tsx", import.meta.url), "utf8");
    const start = host.indexOf("const scheduledAutosaveSession =");
    const end = host.indexOf("// 서버 자동저장", start);
    const autosave = host.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(autosave).toContain("createStudioAutosaveSnapshotFence");
    expect(autosave).toContain("studioPendingStrokeFingerprint(pendingStrokeCommitsRef.current)");
    expect(autosave).toMatch(/if \(!canPublishSnapshot\(\)\) return;\s+const receipt = await persistStudioAutosaveWithOpfsPrimary/u);
    expect(autosave.indexOf("!canPublishSnapshot()", autosave.indexOf("Promise.all([")))
      .toBeLessThan(autosave.indexOf("session.clear(savedAt)"));
  });
});
