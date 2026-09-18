import { describe, expect, it } from "vitest";

import {
  DEFAULT_WEBTOON_ONBOARDING_SELECTION,
  buildWebtoonOnboardingPlan,
  completeStudioWebtoonOnboarding,
  createStudioWebtoonOnboardingProfile,
  readStudioWebtoonOnboardingProfile,
  toggleStudioWebtoonOnboardingTask,
  webtoonOnboardingProjectHref,
  webtoonOnboardingSelectionFromSearchParams,
  webtoonOnboardingStartHref,
  writeStudioWebtoonOnboardingProfile,
  type WebtoonOnboardingStorage,
} from "./webtoon-production-onboarding";

class MemoryStorage implements WebtoonOnboardingStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("webtoon production onboarding", () => {
  it("only parses an explicit production-onboarding intent", () => {
    expect(webtoonOnboardingSelectionFromSearchParams(new URLSearchParams("kind=webtoon"))).toBeNull();
    expect(webtoonOnboardingSelectionFromSearchParams(new URLSearchParams(
      "onboarding=production&start=script&goal=pitch&team=small-team&cadence=weekly",
    ))).toEqual({
      startingPoint: "script",
      goal: "pitch",
      teamModel: "small-team",
      cadence: "weekly",
    });
  });

  it("falls back safely when deep-link values are unsupported", () => {
    expect(webtoonOnboardingSelectionFromSearchParams(new URLSearchParams(
      "onboarding=production&start=unknown&goal=unknown&team=unknown&cadence=unknown",
    ))).toEqual(DEFAULT_WEBTOON_ONBOARDING_SELECTION);
  });

  it("builds canonical create and project destinations for each starting point", () => {
    const selection = {
      startingPoint: "finished-art",
      goal: "independent",
      teamModel: "solo",
      cadence: "monthly",
    } as const;
    const createHref = webtoonOnboardingStartHref(selection);
    const createParams = new URL(createHref, "https://example.test").searchParams;
    expect(createParams.get("kind")).toBe("webtoon");
    expect(createParams.get("onboarding")).toBe("production");
    expect(createParams.get("start")).toBe("finished-art");
    expect(webtoonOnboardingProjectHref("project-123", selection)).toBe(
      "/studio/p/project-123/export?view=preflight",
    );
  });

  it("adds goal, team and cadence actions to the recommended track", () => {
    const plan = buildWebtoonOnboardingPlan({
      startingPoint: "storyboard",
      goal: "contracted",
      teamModel: "studio",
      cadence: "weekly",
    });
    expect(plan.section).toBe("production");
    expect(plan.view).toBe("board");
    expect(plan.tasksKo).toEqual(expect.arrayContaining([
      "계약상 납품·검수 기준 등록",
      "팀 초대와 역할별 권한 설정",
      "주간 마감 역산",
    ]));
  });

  it("persists task progress and completion per project", () => {
    const storage = new MemoryStorage();
    const created = createStudioWebtoonOnboardingProfile(
      "project-123",
      {
        startingPoint: "script",
        goal: "pitch",
        teamModel: "small-team",
        cadence: "weekly",
      },
      "2026-09-17T09:00:00.000Z",
    );
    writeStudioWebtoonOnboardingProfile(storage, created);
    expect(readStudioWebtoonOnboardingProfile(storage, "project-123")).toEqual(created);

    const progressed = toggleStudioWebtoonOnboardingTask(
      created,
      "script:task:1",
      "2026-09-17T09:01:00.000Z",
    );
    writeStudioWebtoonOnboardingProfile(storage, progressed);
    expect(readStudioWebtoonOnboardingProfile(storage, "project-123")?.completedTaskIds).toEqual([
      "script:task:1",
    ]);

    const completed = completeStudioWebtoonOnboarding(progressed, "2026-09-17T09:02:00.000Z");
    writeStudioWebtoonOnboardingProfile(storage, completed);
    expect(readStudioWebtoonOnboardingProfile(storage, "project-123")?.completedAt).toBe(
      "2026-09-17T09:02:00.000Z",
    );
  });
});
