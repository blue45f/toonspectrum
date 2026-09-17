import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { startDesktopSyncConflictServer } from "./conflict-server.js";
import { FileSystemDesktopSyncRemote } from "./filesystem-remote.js";

const roots: string[] = [];

async function temporaryRoot(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `${name}-`));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function serverFixture(fileName = "page.psd") {
  const local = await temporaryRoot("toonstudio-server-local");
  const remoteRoot = await temporaryRoot("toonstudio-server-remote");
  await writeFile(join(local, fileName), "local bytes");
  await writeFile(join(remoteRoot, fileName), "remote bytes");
  const remote = await FileSystemDesktopSyncRemote.create(remoteRoot);
  const server = await startDesktopSyncConflictServer(local, remote, {
    remoteLabel: remoteRoot,
    token: "test-token-that-is-long-enough-for-loopback-auth",
  });
  return { local, remoteRoot, remote, server };
}

describe("desktop sync conflict loopback server", () => {
  it("serves a secret-free CSP shell and protects report APIs with a capability token", async () => {
    const fixture = await serverFixture();
    try {
      const page = await fetch(fixture.server.origin);
      const html = await page.text();
      expect(page.status).toBe(200);
      expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(html).not.toContain(fixture.server.token);
      expect(html).not.toContain(fixture.local);
      expect(html).toContain("escapeHtml(shortHash(value.version))");
      expect(html).toContain("escapeHtml(value.sha256||\"\")");

      await expect(fetch(`${fixture.server.origin}/api/report`))
        .resolves.toMatchObject({ status: 401 });
      const report = await fetch(`${fixture.server.origin}/api/report`, {
        headers: { "X-ToonStudio-Token": fixture.server.token },
      });
      expect(report.status).toBe(200);
      await expect(report.json()).resolves.toMatchObject({
        reportId: fixture.server.report.reportId,
        conflicts: [{ relativePath: "page.psd" }],
      });
    } finally {
      await fixture.server.close();
    }
  });

  it("rejects cross-origin mutation and applies a complete decision from the local UI", async () => {
    const fixture = await serverFixture();
    const conflict = fixture.server.report.conflicts[0]!;
    const body = JSON.stringify({
      reportId: fixture.server.report.reportId,
      decisions: [{ conflictId: conflict.id, resolution: "use-local" }],
    });
    try {
      const forbidden = await fetch(`${fixture.server.origin}/api/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://attacker.invalid",
          "X-ToonStudio-Token": fixture.server.token,
        },
        body,
      });
      expect(forbidden.status).toBe(403);

      const response = await fetch(`${fixture.server.origin}/api/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: fixture.server.origin,
          "X-ToonStudio-Token": fixture.server.token,
        },
        body,
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        receipt: { reportId: fixture.server.report.reportId },
      });
      await expect(fixture.server.completion).resolves.toMatchObject({
        finalCycle: { counts: { conflict: 0 } },
      });
      await expect(readFile(join(fixture.remoteRoot, "page.psd"), "utf8"))
        .resolves.toBe("local bytes");
    } finally {
      await fixture.server.close();
    }
  });

  it("only exposes bounded raster previews and never proprietary document bytes", async () => {
    const proprietary = await serverFixture("page.psd");
    try {
      const conflict = proprietary.server.report.conflicts[0]!;
      const response = await fetch(
        `${proprietary.server.origin}/api/preview?conflictId=${conflict.id}&side=local`,
        { headers: { "X-ToonStudio-Token": proprietary.server.token } },
      );
      expect(response.status).toBe(415);
    } finally {
      await proprietary.server.close();
    }

    const raster = await serverFixture("page.png");
    try {
      const conflict = raster.server.report.conflicts[0]!;
      const response = await fetch(
        `${raster.server.origin}/api/preview?conflictId=${conflict.id}&side=local`,
        { headers: { "X-ToonStudio-Token": raster.server.token } },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(Buffer.from(await response.arrayBuffer()).toString("utf8"))
        .toBe("local bytes");
    } finally {
      await raster.server.close();
    }
  });
});
