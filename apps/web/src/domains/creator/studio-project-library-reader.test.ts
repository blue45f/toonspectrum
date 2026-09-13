import { describe, expect, it, vi } from "vitest";

import { readStudioProjectLibrary } from "./studio-project-library-reader";

const timestamp = "2026-09-13T00:00:00Z";
const project = {
  id: "project-qa", title: "Saved manuscript", kind: "webtoon", status: "active",
  createdAt: timestamp, updatedAt: timestamp, lastOpenedAt: timestamp,
  lastOpenedDocumentId: "document-qa",
};

describe("read-only project source metadata", () => {
  it("retains source identity without writing or mutating stored metadata", () => {
    const raw = JSON.stringify({ schemaVersion: 1, projects: [project], updatedAt: timestamp });
    const storage = { getItem: vi.fn(() => raw), setItem: vi.fn() };
    const result = readStudioProjectLibrary(storage);
    expect(result.projects[0]).toMatchObject(project);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.projects[0])).toBe(true);
    expect(storage.getItem()).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it.each([null, "{broken", "{}", '{"schemaVersion":2,"projects":[]}'])(
    "does not invent a local source for unavailable or invalid metadata: %s", (raw) => {
      const storage = { getItem: () => raw, setItem: vi.fn() };
      expect(readStudioProjectLibrary(storage).projects).toEqual([]);
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it("preserves denied-storage errors for the source resolver to fail closed", () => {
    const storage = {
      getItem: () => { throw new Error("Storage denied"); },
      setItem: vi.fn(),
    };
    expect(() => readStudioProjectLibrary(storage)).toThrow("Storage denied");
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
