import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  executeDesktopSyncCli,
  isDesktopSyncCliEntrypoint,
  parseDesktopSyncCliArguments,
  parseDesktopSyncResolveArguments,
  runDesktopSyncCli,
} from "./cli.js";

const roots: string[] = [];

async function temporaryRoot(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `${name}-`));
  roots.push(root);
  return root;
}

function outputCollector() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: { write: (value: string) => stdout.push(value) },
      stderr: { write: (value: string) => stderr.push(value) },
    },
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("desktop sync CLI", () => {
  it("recognizes an executable entrypoint reached through a symbolic path", async () => {
    if (process.platform === "win32") return;
    const root = await temporaryRoot("toonstudio-cli-entrypoint");
    const actual = join(root, "actual-cli.js");
    const linked = join(root, "linked-cli.js");
    await writeFile(actual, "export {};\n", "utf8");
    await symlink(actual, linked);

    expect(isDesktopSyncCliEntrypoint(
      linked,
      pathToFileURL(actual).href,
    )).toBe(true);
    expect(isDesktopSyncCliEntrypoint(
      join(root, "other.js"),
      pathToFileURL(actual).href,
    )).toBe(false);
  });

  it("parses bounded modes and scan options", () => {
    const options = parseDesktopSyncCliArguments([
      "--local", "./local",
      "--remote-folder", "./remote",
      "--watch",
      "--interval", "2500",
      "--max-file-mb", "2048",
      "--include-unknown",
      "--json",
    ]);

    expect(options).toMatchObject({
      mode: "watch",
      intervalMs: 2500,
      maximumFileBytes: 2048 * 1024 * 1024,
      includeUnknownFiles: true,
      json: true,
    });
    expect(() => parseDesktopSyncCliArguments([
      "--local", "a",
      "--remote-folder", "b",
      "--once",
      "--dry-run",
    ])).toThrow(/mutually exclusive/u);
    expect(() => parseDesktopSyncCliArguments([
      "--local", "a",
      "--remote-folder", "b",
      "--watch",
      "--interval", "999",
    ])).toThrow(/at least 1000ms/u);
  });

  it("parses cloud targets without exposing OAuth credentials", () => {
    const options = parseDesktopSyncCliArguments([
      "--local", "./local",
      "--cloud-provider", "dropbox",
      "--cloud-root", "ToonStudio/Series",
      "--access-token-env", "CUSTOM_DROPBOX_TOKEN",
      "--dry-run",
    ]);
    expect(options).toMatchObject({
      remoteRoot: "dropbox:ToonStudio/Series",
      remoteTarget: {
        kind: "cloud",
        provider: "dropbox",
        rootPath: "ToonStudio/Series",
        accessTokenEnvironmentVariable: "CUSTOM_DROPBOX_TOKEN",
      },
    });
    expect(() => parseDesktopSyncCliArguments([
      "--local", "./local",
      "--remote-folder", "./remote",
      "--cloud-provider", "dropbox",
    ])).toThrow(/exactly one/u);
  });

  it("runs one filesystem-backed cycle and emits JSON without file content", async () => {
    const local = await temporaryRoot("toonstudio-cli-local");
    const remote = await temporaryRoot("toonstudio-cli-remote");
    await writeFile(join(local, "episode.psd"), "local artwork body");
    await writeFile(join(remote, "reference.clip"), "remote artwork body");
    const collected = outputCollector();

    const exitCode = await runDesktopSyncCli([
      "--local", local,
      "--remote-folder", remote,
      "--once",
      "--json",
    ], collected.io);

    expect(exitCode).toBe(0);
    expect(collected.stderr).toEqual([]);
    expect(JSON.parse(collected.stdout.join(""))).toMatchObject({
      status: "ready",
      counts: { upload: 1, download: 1, conflict: 0 },
      execution: { uploaded: 1, downloaded: 1 },
    });
    expect(collected.stdout.join("")).not.toContain("local artwork body");
    await expect(readFile(join(remote, "episode.psd"), "utf8")).resolves.toBe(
      "local artwork body",
    );
    await expect(readFile(join(local, "reference.clip"), "utf8")).resolves.toBe(
      "remote artwork body",
    );
  });

  it("returns conflict code 2 in dry-run mode without modifying either side", async () => {
    const local = await temporaryRoot("toonstudio-cli-conflict-local");
    const remote = await temporaryRoot("toonstudio-cli-conflict-remote");
    await writeFile(join(local, "same.psd"), "local version");
    await writeFile(join(remote, "same.psd"), "remote version");

    const result = await executeDesktopSyncCli(
      parseDesktopSyncCliArguments([
        "--local", local,
        "--remote-folder", remote,
        "--dry-run",
      ]),
    );

    expect(result.exitCode).toBe(2);
    expect(result.summary).toMatchObject({
      status: "conflict",
      counts: { conflict: 1 },
      execution: null,
      plan: [{
        relativePath: "same.psd",
        action: "conflict",
        reason: "independent-files",
      }],
    });
    await expect(readFile(join(local, "same.psd"), "utf8")).resolves.toBe(
      "local version",
    );
    await expect(readFile(join(remote, "same.psd"), "utf8")).resolves.toBe(
      "remote version",
    );
  });

  it("prints help without requiring folder arguments", async () => {
    const collected = outputCollector();
    await expect(runDesktopSyncCli(["--help"], collected.io)).resolves.toBe(0);
    expect(collected.stdout.join("")).toContain("toonstudio-sync --local");
    expect(collected.stderr).toEqual([]);
  });
});

describe("desktop sync cloud CLI", () => {
  it("runs a Dropbox dry-run through the cloud remote factory", async () => {
    const local = await temporaryRoot("toonstudio-cli-cloud-local");
    const calls: Array<RequestInit | undefined> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (request, init) => {
      calls.push(init);
      const url = typeof request === "string"
        ? request
        : request instanceof URL
          ? request.toString()
          : request.url;
      if (url.endsWith("/files/get_metadata")) {
        return new Response(JSON.stringify({
          error_summary: "path/not_found/",
        }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (
        url.endsWith("/files/create_folder_v2")
        || url.endsWith("/files/upload")
        || url.endsWith("/files/list_folder")
      ) {
        throw new Error("Dropbox dry-run must not mutate or create its root");
      }
      throw new Error(`unexpected Dropbox request: ${url}`);
    });
    const collected = outputCollector();

    const exitCode = await runDesktopSyncCli([
      "--local", local,
      "--cloud-provider", "dropbox",
      "--cloud-root", "ToonStudio/Series",
      "--access-token-env", "TEST_DROPBOX_TOKEN",
      "--dry-run",
      "--json",
    ], collected.io, {
      environment: { TEST_DROPBOX_TOKEN: "test-secret" },
      fetchImpl,
    });
    expect(exitCode).toBe(0);
    expect(JSON.parse(collected.stdout.join(""))).toMatchObject({
      status: "ready",
      remoteRoot: "dropbox:ToonStudio/Series",
      counts: { upload: 0, download: 0, conflict: 0 },
      execution: null,
    });
    expect(collected.stdout.join("")).not.toContain("test-secret");
    expect(calls.every((init) => (
      new Headers(init?.headers).get("Authorization")
      === "Bearer test-secret"
    ))).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("falls back to the credential vault when the legacy token variable is absent", async () => {
    const local = await temporaryRoot("toonstudio-cli-cloud-missing-token");
    const options = parseDesktopSyncCliArguments([
      "--local", local,
      "--cloud-provider", "google-drive",
      "--dry-run",
    ]);
    await expect(executeDesktopSyncCli(options, {
      environment: {},
    })).rejects.toThrow(/OAuth credential exists for profile default/u);
  });
});

describe("desktop sync conflict resolver CLI", () => {
  it("parses the bounded loopback resolver options", () => {
    const options = parseDesktopSyncResolveArguments([
      "--local", "./local",
      "--remote-folder", "./remote",
      "--no-browser",
      "--port", "4567",
    ]);
    expect(options).toMatchObject({
      noBrowser: true,
      port: 4567,
      sync: { mode: "once" },
    });
    expect(() => parseDesktopSyncResolveArguments([
      "--local", "./local",
      "--remote-folder", "./remote",
      "--watch",
    ])).toThrow(/does not accept/u);
    expect(() => parseDesktopSyncResolveArguments([
      "--local", "./local",
      "--remote-folder", "./remote",
      "--port", "70000",
    ])).toThrow(/between 0 and 65535/u);
  });

  it("runs the protected resolver from CLI through receipt completion", async () => {
    const local = await temporaryRoot("toonstudio-cli-resolve-local");
    const remote = await temporaryRoot("toonstudio-cli-resolve-remote");
    await writeFile(join(local, "episode.psd"), "local conflict body");
    await writeFile(join(remote, "episode.psd"), "remote conflict body");
    const collected = outputCollector();

    const execution = runDesktopSyncCli([
      "resolve",
      "--local", local,
      "--remote-folder", remote,
      "--no-browser",
      "--json",
    ], collected.io);

    await vi.waitFor(() => {
      expect(collected.stdout.length).toBeGreaterThan(0);
    });
    const initial = JSON.parse(collected.stdout[0]!);
    expect(initial).toMatchObject({
      event: "review-required",
      status: "conflict",
      conflictCount: 1,
    });
    const protectedUrl = new URL(initial.url);
    const token = new URLSearchParams(protectedUrl.hash.slice(1)).get("token")!;
    const origin = protectedUrl.origin;
    const reportResponse = await fetch(`${origin}/api/report`, {
      headers: { "X-ToonStudio-Token": token },
    });
    const report = await reportResponse.json() as {
      reportId: string;
      conflicts: Array<{ id: string }>;
    };
    const applyResponse = await fetch(`${origin}/api/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "X-ToonStudio-Token": token,
      },
      body: JSON.stringify({
        reportId: report.reportId,
        decisions: [{
          conflictId: report.conflicts[0]!.id,
          resolution: "keep-both-local-primary",
        }],
      }),
    });
    expect(applyResponse.status).toBe(200);
    await expect(execution).resolves.toBe(0);
    const completed = JSON.parse(collected.stdout.at(-1)!);
    expect(completed).toMatchObject({
      event: "complete",
      status: "resolved",
      counts: { conflict: 0 },
    });
    expect(completed.receiptSha256).toMatch(/^[a-f0-9]{64}$/u);
  });
});
