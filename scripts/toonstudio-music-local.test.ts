import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function runCli(args: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolvePromise) => {
    const child = spawn(process.execPath, ["scripts/toonstudio-music-local.mjs", ...args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

function kit() {
  return {
    schemaVersion: 1,
    product: "ToonStudio",
    providerReviewDate: "2026-09-25",
    brief: { lyrics: "", lyricsLanguage: "none" },
    localAceStep: {
      request: {
        prompt: "fully original quiet instrumental score",
        audio_duration: 15,
        bpm: 72,
        instrumental: true,
      },
    },
  };
}
describe("ToonStudio ACE-Step local CLI", () => {
  it("generates through a loopback API and writes verified audio plus provenance", async () => {
    const directory = await mkdtemp(join(tmpdir(), "toonstudio-music-cli-"));
    temporaryDirectories.push(directory);
    const kitPath = join(directory, "kit.json");
    const outputPath = join(directory, "output.mp3");
    await writeFile(kitPath, JSON.stringify(kit()));
    const audio = Buffer.from([73, 68, 51, ...Array<number>(61).fill(0)]);

    const server = createServer(async (request, response) => {
      if (request.url === "/health") {
        response.writeHead(200, { "content-type": "application/json" }).end("{}");
        return;
      }
      if (request.url === "/release_task") {
        response.writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ data: { task_id: "task-test" } }));
        return;
      }
      if (request.url === "/query_result") {
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
          data: [{ status: 1, result: JSON.stringify([{ stage: "done", progress: 1, file: "/result.mp3" }]) }],
        }));
        return;
      }
      if (request.url === "/result.mp3") {
        response.writeHead(200, { "content-type": "audio/mpeg" }).end(audio);
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server address unavailable");
    try {
      const result = await runCli([
        "--kit", kitPath,
        "--output", outputPath,
        "--api-base", `http://127.0.0.1:${address.port}`,
        "--wait-seconds", "30",
      ]);
      expect(result).toMatchObject({ code: 0, stderr: "" });
      expect(result.stdout).toContain("완료:");
      expect(await readFile(outputPath)).toEqual(audio);
      const provenance = JSON.parse(await readFile(outputPath.replace(/\.mp3$/u, ".json"), "utf8"));
      expect(provenance).toMatchObject({
        provider: "ace-step-local",
        model: "acestep-v15-turbo",
        taskId: "task-test",
        providerReviewDate: "2026-09-25",
      });
      expect(provenance.sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(provenance.request.prompt).toBe("fully original quiet instrumental score");
    } finally {
      await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
    }
  }, 15_000);

  it("rejects non-loopback API addresses before making a request", async () => {
    const directory = await mkdtemp(join(tmpdir(), "toonstudio-music-cli-"));
    temporaryDirectories.push(directory);
    const kitPath = join(directory, "kit.json");
    await writeFile(kitPath, JSON.stringify(kit()));
    const result = await runCli([
      "--kit", kitPath,
      "--output", join(directory, "output.mp3"),
      "--api-base", "https://example.test",
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("로컬 ACE-Step 주소만");
  });
});
