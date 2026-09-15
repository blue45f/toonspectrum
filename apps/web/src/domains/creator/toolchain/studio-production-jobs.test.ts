import { describe, expect, it } from "vitest";

import {
  createStudioProductionJob,
  retainStudioProductionJobs,
  transitionStudioProductionJob,
  updateStudioProductionJobProgress,
  validateStudioProductionJobOptions,
} from "./studio-production-jobs";

const NOW = () => new Date("2026-09-15T00:00:00.000Z");
const LATER = () => new Date("2026-09-15T00:00:01.000Z");

function draft() {
  return createStudioProductionJob({
    id: "job_12345678",
    now: NOW,
    profile: "open",
    toolId: "tesseract",
    operationId: "ocr-text",
    inputs: [{
      id: "input_1",
      name: "page.png",
      mime: "image/png",
      bytes: 128,
      sha256: null,
      uploaded: false,
    }],
    options: { language: "kor+eng" },
  });
}

describe("studio production jobs", () => {
  it("moves through the explicit fail-closed lifecycle", () => {
    const preparing = transitionStudioProductionJob(draft(), "preparing", { now: LATER });
    const queued = transitionStudioProductionJob(preparing, "queued", { now: LATER });
    const running = transitionStudioProductionJob(queued, "running", { now: LATER });
    const progressed = updateStudioProductionJobProgress(running, 0.5, "OCR 분석", LATER);
    const failed = transitionStudioProductionJob(progressed, "failed", {
      now: LATER,
      failure: { code: "PROCESS_EXIT_FAILED", message: "OCR failed", retryable: true },
    });
    expect(failed.status).toBe("failed");
    expect(failed.failure?.code).toBe("PROCESS_EXIT_FAILED");
    expect(() => transitionStudioProductionJob(failed, "completed")).toThrow(/바꿀 수 없습니다/u);
  });

  it("rejects progress regression and invalid terminal transitions", () => {
    const running = transitionStudioProductionJob(
      transitionStudioProductionJob(
        transitionStudioProductionJob(draft(), "preparing", { now: LATER }),
        "queued",
        { now: LATER },
      ),
      "running",
      { now: LATER },
    );
    const progressed = updateStudioProductionJobProgress(running, 0.7, "처리", LATER);
    expect(() => updateStudioProductionJobProgress(progressed, 0.6, "역행", LATER))
      .toThrow(/비감소/u);
    expect(() => transitionStudioProductionJob(draft(), "completed")).toThrow();
  });

  it("accepts bounded JSON options but rejects prototypes, cycles and oversize payloads", () => {
    expect(validateStudioProductionJobOptions({ fps: 24, flags: ["a", "b"] }))
      .toEqual({ fps: 24, flags: ["a", "b"] });
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => validateStudioProductionJobOptions(cyclic)).toThrow(/순환/u);
    expect(() => validateStudioProductionJobOptions(new Date())).toThrow(/일반 JSON/u);
    expect(() => validateStudioProductionJobOptions({ value: "x".repeat(70_000) }))
      .toThrow(/허용 크기/u);
  });

  it("deduplicates and bounds retained job history", () => {
    const jobs = Array.from({ length: 140 }, (_, index) => createStudioProductionJob({
      id: `job_${String(index).padStart(8, "0")}`,
      now: () => new Date(Date.parse("2026-09-15T00:00:00.000Z") + index * 1_000),
      profile: "open",
      toolId: "tesseract",
      operationId: "ocr-text",
    }));
    const retained = retainStudioProductionJobs([...jobs, jobs.at(-1)!]);
    expect(retained).toHaveLength(128);
    expect(retained[0]?.id).toBe("job_00000139");
    expect(new Set(retained.map(({ id }) => id)).size).toBe(128);
  });
});
