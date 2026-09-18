import { readFile, rm, symlink, writeFile, mkdir, mkdtemp  } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DesktopSyncAgent,
  resolveBoundPath,
  safeRelativePath,
  type DesktopSyncBinding,
} from "../src/index.js";

let root = "";
let outside = "";

function binding(): DesktopSyncBinding {
  return {
    id: "binding-1",
    projectId: "project-1",
    rootPath: root,
    mode: "mirrored",
    maxFiles: 100,
    maxFileBytes: 10 * 1024 * 1024,
  };
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "toonstudio-sync-"));
  outside = await mkdtemp(path.join(os.tmpdir(), "toonstudio-outside-"));
  await mkdir(path.join(root, "nested"), { recursive: true });
});

afterEach(async () => {
  await Promise.all([
    rm(root, { recursive: true, force: true }),
    rm(outside, { recursive: true, force: true }),
  ]);
});

describe("DesktopSyncAgent", () => {
  it("journals deterministic upserts and deletes and resumes without duplicate changes", async () => {
    await writeFile(path.join(root, "page.psd"), "version-1");
    await writeFile(path.join(root, "nested", "preview.png"), "png-1");
    const agent = new DesktopSyncAgent(binding());

    const first = await agent.reconcile("2026-09-17T06:00:00.000Z");
    expect(first.entries.map((entry) => [entry.sequence, entry.operation, entry.relativePath]))
      .toEqual([
        [1, "upsert", "nested/preview.png"],
        [2, "upsert", "page.psd"],
      ]);

    await writeFile(path.join(root, "page.psd"), "version-2");
    await rm(path.join(root, "nested", "preview.png"));
    const second = await agent.reconcile("2026-09-17T06:01:00.000Z");
    expect(second.entries.map((entry) => [entry.sequence, entry.operation, entry.relativePath]))
      .toEqual([
        [3, "delete", "nested/preview.png"],
        [4, "upsert", "page.psd"],
      ]);

    const restarted = new DesktopSyncAgent(binding());
    await expect(restarted.reconcile("2026-09-17T06:02:00.000Z"))
      .resolves.toMatchObject({ entries: [] });
  });

  it("ignores symlinks and rejects traversal outside the binding root", async () => {
    await writeFile(path.join(outside, "secret.psd"), "outside");
    await symlink(path.join(outside, "secret.psd"), path.join(root, "linked.psd"));
    const agent = new DesktopSyncAgent(binding());
    const result = await agent.reconcile();
    expect(result.entries).toHaveLength(0);
    expect(() => safeRelativePath(root, path.join(outside, "secret.psd"))).toThrow();
    expect(() => resolveBoundPath(root, "../secret.psd")).toThrow();
  });

  it("uses short-lived grants in memory without persisting bearer secrets", async () => {
    await writeFile(path.join(root, "page.psd"), "version-1");
    const agent = new DesktopSyncAgent(binding());
    const result = await agent.reconcile("2026-09-17T06:00:00.000Z");
    const send = vi.fn(async () => undefined);
    await agent.flush(
      result.entries,
      {
        grant: async () => ({
          url: "https://upload.toonstudio.invalid/object",
          method: "PUT",
          headers: { Authorization: "Bearer top-secret-token" },
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      },
      { send },
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "page.psd" }),
      expect.objectContaining({ headers: { Authorization: "Bearer top-secret-token" } }),
      path.join(root, "page.psd"),
    );
    const journal = await readFile(agent.journal.filePath, "utf8");
    expect(journal).not.toContain("top-secret-token");
    expect(journal).not.toContain("Authorization");
  });
});
