import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  analyzeCspBlindResponses,
  createCspBlindPacket,
} from "./csp-blind-lab";

import type {
  CspBlindResponse,
  CspBlindSealedKey,
  CspBlindStudy,
  CspBlindTask,
} from "./csp-blind-lab";

const categories = [
  "inking",
  "natural-media",
  "comic-flow",
  "animation",
  "text",
] as const;

function study(overrides: Partial<CspBlindStudy> = {}): CspBlindStudy {
  const tasks: CspBlindTask[] = categories.map((category, index) => ({
    id: `task-${index + 1}`,
    category,
    toonStudioAsset: `/sealed/toon/${category}.png`,
    cspAsset: `/sealed/csp/${category}.png`,
  }));
  return {
    studyId: "csp-v12-2026-08",
    preregisteredAt: "2026-08-09T00:00:00.000Z",
    nonInferiorityMargin: 0.05,
    minimumResponsesPerCategory: 20,
    tasks,
    ...overrides,
  };
}

function completeEvidence(
  targetStudy: CspBlindStudy,
  evaluatorCount: number,
  preferenceFor: (side: "A" | "B", evaluatorIndex: number, taskIndex: number) => "A" | "B" | "tie",
): { keys: CspBlindSealedKey[]; responses: CspBlindResponse[] } {
  const keys: CspBlindSealedKey[] = [];
  const responses: CspBlindResponse[] = [];
  for (let evaluatorIndex = 0; evaluatorIndex < evaluatorCount; evaluatorIndex += 1) {
    const evaluatorId = `artist-${String(evaluatorIndex + 1).padStart(3, "0")}`;
    const { sealedKey } = createCspBlindPacket(targetStudy, evaluatorId);
    keys.push(sealedKey);
    sealedKey.entries.forEach((entry, taskIndex) => {
      responses.push({
        evaluatorId,
        taskId: entry.taskId,
        preference: preferenceFor(entry.toonStudioSide, evaluatorIndex, taskIndex),
      });
    });
  }
  return { keys, responses };
}

describe("CSP blind non-inferiority lab", () => {
  it("creates a deterministic packet and a separately sealed source key", () => {
    const targetStudy = study();
    const first = createCspBlindPacket(targetStudy, "artist-001");
    const second = createCspBlindPacket(targetStudy, "artist-001");

    expect(first).toEqual(second);
    expect(first.packet.items).toHaveLength(targetStudy.tasks.length);
    expect(first.sealedKey.entries).toHaveLength(targetStudy.tasks.length);
    expect(first.packet).not.toHaveProperty("entries");
    expect(JSON.stringify(first.packet)).not.toContain("toonStudioSide");
    expect(Object.isFrozen(first.packet.items[0])).toBe(true);
  });

  it("counterbalances source sides across evaluator-specific packets", () => {
    const targetStudy = study();
    const signatures = new Set(
      Array.from({ length: 32 }, (_, index) => {
        const { sealedKey } = createCspBlindPacket(targetStudy, `artist-${index + 1}`);
        return sealedKey.entries.map((entry) => `${entry.taskId}:${entry.toonStudioSide}`).join("|");
      }),
    );

    expect(signatures.size).toBeGreaterThan(1);
  });

  it("does not use runtime randomness", () => {
    const source = readFileSync(fileURLToPath(new URL("./csp-blind-lab.ts", import.meta.url)), "utf8");
    expect(source).not.toContain("Math.random");
  });

  it("passes only a complete, sufficiently powered all-ToonStudio result", () => {
    const targetStudy = study();
    const evidence = completeEvidence(targetStudy, 24, (side) => side);
    const analysis = analyzeCspBlindResponses(targetStudy, evidence.keys, evidence.responses);

    expect(analysis.complete).toBe(true);
    expect(analysis.gate).toBe("pass");
    expect(analysis.results).toHaveLength(6);
    for (const result of analysis.results) {
      expect(result.enoughResponses).toBe(true);
      expect(result.passes).toBe(true);
      expect(result.favorableRate).toBe(1);
      expect(result.wilsonLower95).toBeGreaterThan(result.threshold);
    }
  });

  it("fails a complete study when CSP wins the comparisons", () => {
    const targetStudy = study();
    const evidence = completeEvidence(targetStudy, 24, (side) => side === "A" ? "B" : "A");
    const analysis = analyzeCspBlindResponses(targetStudy, evidence.keys, evidence.responses);

    expect(analysis.complete).toBe(true);
    expect(analysis.gate).toBe("fail");
    expect(analysis.results.every((result) => !result.passes)).toBe(true);
  });

  it("scores a tie as half favorable without silently promoting it", () => {
    const targetStudy = study();
    const evidence = completeEvidence(targetStudy, 24, () => "tie");
    const analysis = analyzeCspBlindResponses(targetStudy, evidence.keys, evidence.responses);

    expect(analysis.gate).toBe("fail");
    expect(analysis.results[0]).toMatchObject({
      favorableRate: 0.5,
      toonStudioWins: 0,
      cspWins: 0,
      ties: 120,
    });
    expect(analysis.results[0]?.wilsonLower95).toBeLessThan(0.45);
  });

  it("keeps an underpowered but complete response set at insufficient-data", () => {
    const targetStudy = study();
    const evidence = completeEvidence(targetStudy, 5, (side) => side);
    const analysis = analyzeCspBlindResponses(targetStudy, evidence.keys, evidence.responses);

    expect(analysis.complete).toBe(true);
    expect(analysis.gate).toBe("insufficient-data");
    expect(analysis.results.every((result) => !result.enoughResponses)).toBe(true);
  });

  it("reports missing and duplicate responses as insufficient evidence", () => {
    const targetStudy = study({ minimumResponsesPerCategory: 1 });
    const evidence = completeEvidence(targetStudy, 1, (side) => side);
    const duplicate = evidence.responses[0];
    if (!duplicate) throw new Error("fixture must have a response");
    const responses = [...evidence.responses.slice(0, -1), duplicate];
    const analysis = analyzeCspBlindResponses(targetStudy, evidence.keys, responses);

    expect(analysis.complete).toBe(false);
    expect(analysis.gate).toBe("insufficient-data");
    expect(analysis.missingResponseKeys).toHaveLength(1);
    expect(analysis.duplicateResponseKeys).toEqual([`${duplicate.evaluatorId}/${duplicate.taskId}`]);
  });

  it("rejects partial sealed keys and cross-study keys", () => {
    const targetStudy = study();
    const { sealedKey } = createCspBlindPacket(targetStudy, "artist-001");
    expect(() => analyzeCspBlindResponses(targetStudy, [{
      ...sealedKey,
      entries: sealedKey.entries.slice(1),
    }], [])).toThrow(/assign every study task/u);
    expect(() => analyzeCspBlindResponses(targetStudy, [{
      ...sealedKey,
      studyId: "another-study",
    }], [])).toThrow(/another study/u);
  });

  it("rejects unsealed, duplicate-assignment, and invalid-preference responses", () => {
    const targetStudy = study();
    const { sealedKey } = createCspBlindPacket(targetStudy, "artist-001");
    const firstEntry = sealedKey.entries[0];
    if (!firstEntry) throw new Error("fixture must have an assignment");
    expect(() => analyzeCspBlindResponses(targetStudy, [sealedKey], [{
      evaluatorId: "artist-002",
      taskId: firstEntry.taskId,
      preference: "A",
    }])).toThrow(/no sealed assignment/u);
    expect(() => analyzeCspBlindResponses(targetStudy, [{
      ...sealedKey,
      entries: [firstEntry, firstEntry, ...sealedKey.entries.slice(2)],
    }], [])).toThrow(/duplicate sealed assignment/u);
    expect(() => analyzeCspBlindResponses(targetStudy, [sealedKey], [{
      evaluatorId: sealedKey.evaluatorId,
      taskId: firstEntry.taskId,
      preference: "invalid" as "A",
    }])).toThrow(/invalid blind preference/u);
  });

  it.each([
    [{ studyId: "bad id with spaces" }, /studyId/u],
    [{ preregisteredAt: "not-a-date" }, /preregisteredAt/u],
    [{ nonInferiorityMargin: -0.01 }, /nonInferiorityMargin/u],
    [{ nonInferiorityMargin: 0.5 }, /nonInferiorityMargin/u],
    [{ minimumResponsesPerCategory: 0 }, /minimumResponsesPerCategory/u],
    [{ tasks: [] }, /at least one task/u],
  ] as const)("rejects invalid preregistration %o", (override, pattern) => {
    expect(() => createCspBlindPacket(study(override as Partial<CspBlindStudy>), "artist-001"))
      .toThrow(pattern);
  });
});
