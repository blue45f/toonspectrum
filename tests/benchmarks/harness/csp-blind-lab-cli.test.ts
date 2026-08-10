import { describe, expect, it } from "vitest";

import { runCspBlindLabCli } from "./csp-blind-lab-cli";

import type { CspBlindStudy } from "./csp-blind-lab";

const targetStudy: CspBlindStudy = Object.freeze({
  studyId: "cli-study",
  preregisteredAt: "2026-08-09T00:00:00.000Z",
  nonInferiorityMargin: 0.05,
  minimumResponsesPerCategory: 1,
  tasks: Object.freeze([
    Object.freeze({
      id: "inking-1",
      category: "inking",
      toonStudioAsset: "toon.png",
      cspAsset: "csp.png",
    }),
    Object.freeze({
      id: "natural-1",
      category: "natural-media",
      toonStudioAsset: "toon-natural.png",
      cspAsset: "csp-natural.png",
    }),
    Object.freeze({
      id: "comic-1",
      category: "comic-flow",
      toonStudioAsset: "toon-comic.png",
      cspAsset: "csp-comic.png",
    }),
    Object.freeze({
      id: "animation-1",
      category: "animation",
      toonStudioAsset: "toon-animation.png",
      cspAsset: "csp-animation.png",
    }),
    Object.freeze({
      id: "text-1",
      category: "text",
      toonStudioAsset: "toon-text.png",
      cspAsset: "csp-text.png",
    }),
  ]),
});

function memoryIo(initial: Readonly<Record<string, unknown>>) {
  const files = new Map(Object.entries(initial));
  const modes = new Map<string, "public" | "secret">();
  let stdout = "";
  let stderr = "";
  return {
    io: {
      readJson(path: string) {
        if (!files.has(path)) throw new Error(`missing fixture ${path}`);
        return files.get(path);
      },
      writePublicJson(path: string, value: unknown) {
        if (files.has(path)) throw new Error(`exclusive output exists: ${path}`);
        files.set(path, value);
        modes.set(path, "public");
      },
      writeSecretJson(path: string, value: unknown) {
        if (files.has(path)) throw new Error(`exclusive output exists: ${path}`);
        files.set(path, value);
        modes.set(path, "secret");
      },
      stdout(value: string) {
        stdout += value;
      },
      stderr(value: string) {
        stderr += value;
      },
    },
    files,
    modes,
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

describe("CSP blind lab operator CLI", () => {
  it("writes participant packets and sealed keys to distinct output classes", () => {
    const fixture = memoryIo({ "study.json": targetStudy });
    const exitCode = runCspBlindLabCli([
      "packet",
      "--study", "study.json",
      "--evaluator", "artist-001",
      "--packet-out", "packet.json",
      "--key-out", "key.json",
    ], fixture.io);

    expect(exitCode).toBe(0);
    expect(fixture.modes.get("packet.json")).toBe("public");
    expect(fixture.modes.get("key.json")).toBe("secret");
    expect(JSON.stringify(fixture.files.get("packet.json"))).not.toContain("toonStudioSide");
    expect(JSON.stringify(fixture.files.get("key.json"))).toContain("toonStudioSide");
  });

  it("returns insufficient-data as exit 2 and writes the honest analysis", () => {
    const packetFixture = memoryIo({ "study.json": targetStudy });
    expect(runCspBlindLabCli([
      "packet",
      "--study", "study.json",
      "--evaluator", "artist-001",
      "--packet-out", "packet.json",
      "--key-out", "key.json",
    ], packetFixture.io)).toBe(0);
    const fixture = memoryIo({
      "study.json": targetStudy,
      "keys.json": [packetFixture.files.get("key.json")],
      "responses.json": [],
    });
    const exitCode = runCspBlindLabCli([
      "analyze",
      "--study", "study.json",
      "--keys", "keys.json",
      "--responses", "responses.json",
      "--out", "analysis.json",
    ], fixture.io);

    expect(exitCode).toBe(2);
    expect(fixture.files.get("analysis.json")).toMatchObject({ gate: "insufficient-data" });
    expect(fixture.stdout()).toContain("insufficient-data");
  });

  it("fails closed for unknown, duplicate, missing, and existing output options", () => {
    const unknown = memoryIo({});
    expect(runCspBlindLabCli(["unknown"], unknown.io)).toBe(64);
    expect(unknown.stderr()).toContain("unknown command");

    const duplicate = memoryIo({ "study.json": targetStudy });
    expect(runCspBlindLabCli([
      "packet",
      "--study", "study.json",
      "--study", "study.json",
      "--evaluator", "artist-001",
      "--packet-out", "packet.json",
      "--key-out", "key.json",
    ], duplicate.io)).toBe(64);
    expect(duplicate.stderr()).toContain("duplicate option");

    const missing = memoryIo({ "study.json": targetStudy });
    expect(runCspBlindLabCli([
      "packet",
      "--study", "study.json",
      "--evaluator", "artist-001",
    ], missing.io)).toBe(64);
    expect(missing.stderr()).toContain("missing required option");

    const existing = memoryIo({ "study.json": targetStudy, "packet.json": {} });
    expect(runCspBlindLabCli([
      "packet",
      "--study", "study.json",
      "--evaluator", "artist-001",
      "--packet-out", "packet.json",
      "--key-out", "key.json",
    ], existing.io)).toBe(64);
    expect(existing.stderr()).toContain("exclusive output exists");
  });
});
