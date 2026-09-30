import { describe, expect, it } from "vitest";

import { resolveStudioCommentThread } from "../studio-comments";
import { createProductionDemoProject, PRODUCTION_DEMO_ANCHOR_AT } from "./production-demo";
import {
  countOpenPins,
  countOpenUrgentPins,
  createEpisodeSampleCompareItems,
  createEpisodeSampleComments,
  deriveEpisodeApprovalGate,
  EPISODE_SAMPLE_PAGE,
  episodeRoomAssigneeOptions,
  resolveEpisodeApprover,
} from "./production-episode-room-model";

const NOW = new Date(PRODUCTION_DEMO_ANCHOR_AT);

describe("episode room sample comments", () => {
  it("builds valid Studio comment threads with one required fix, one open note and one resolved note", () => {
    const aggregate = createProductionDemoProject();
    const document = createEpisodeSampleComments(aggregate, NOW);
    expect(document.threads).toHaveLength(3);
    expect(countOpenUrgentPins(document, EPISODE_SAMPLE_PAGE.pageId)).toBe(1);
    expect(countOpenPins(document, EPISODE_SAMPLE_PAGE.pageId)).toBe(2);
    // 작성자는 샘플 참여자 이름을 그대로 쓴다.
    expect(document.threads.map((thread) => thread.author.displayName)).toContain("강민서");
  });

  it("assigns the required fix to a real sample participant chosen from the assignee options", () => {
    const aggregate = createProductionDemoProject();
    const document = createEpisodeSampleComments(aggregate, NOW);
    const urgent = document.threads.find((thread) => thread.body.startsWith("[긴급]"));
    const options = episodeRoomAssigneeOptions(aggregate, (ko) => ko);
    expect(urgent?.assignee?.id).toBeTruthy();
    expect(options.some((option) => option.id === urgent?.assignee?.id && option.displayName === urgent?.assignee?.displayName)).toBe(true);
    // 선택지는 활성 참여 배정만, 역할 이름표와 함께 보여 준다.
    const active = aggregate.assignments.filter((assignment) => assignment.status === "active");
    expect(options.map((option) => option.id)).toEqual(active.map((assignment) => assignment.id));
    expect(options.every((option) => option.detail && !option.detail.includes("-"))).toBe(true);
  });

  it("unlocks the gate when the required fix is resolved", () => {
    const aggregate = createProductionDemoProject();
    const document = createEpisodeSampleComments(aggregate, NOW);
    const urgent = document.threads.find((thread) => thread.body.startsWith("[긴급]"));
    expect(urgent).toBeTruthy();
    if (!urgent) return;
    const resolved = resolveStudioCommentThread(document, urgent.id, null, new Date(NOW.getTime() + 1000));
    expect(countOpenUrgentPins(resolved, EPISODE_SAMPLE_PAGE.pageId)).toBe(0);
  });
});

describe("episode approval gate", () => {
  it("summarizes each required lane of the episode policy", () => {
    const gate = deriveEpisodeApprovalGate(createProductionDemoProject(), "episode-12");
    expect(gate.lanes.map((lane) => lane.lane)).toEqual(["narrative", "visual-direction", "production"]);
    expect(gate.lanes.find((lane) => lane.lane === "narrative")?.approved).toBe(true);
    expect(gate.lanes.find((lane) => lane.lane === "visual-direction")?.approved).toBe(false);
    expect(gate.approved).toBe(false);
  });

  it("returns an empty gate for an episode without a policy", () => {
    expect(deriveEpisodeApprovalGate(createProductionDemoProject(), "episode-13")).toEqual({ policyId: null, lanes: [], approved: false, blockingLaneCount: 0 });
  });

  it("acts as the selected role in the sample but never on behalf of someone else in real projects", () => {
    const aggregate = createProductionDemoProject();
    expect(resolveEpisodeApprover(aggregate, "episode-12", { isDemo: true, roleLens: "art", viewerAssignmentId: null }))
      .toMatchObject({ assignmentId: "assignment-art", lane: "visual-direction" });
    expect(resolveEpisodeApprover(aggregate, "episode-12", { isDemo: false, roleLens: "art", viewerAssignmentId: null })).toBeNull();
    expect(resolveEpisodeApprover(aggregate, "episode-12", { isDemo: false, roleLens: "producer", viewerAssignmentId: "assignment-story" }))
      .toMatchObject({ assignmentId: "assignment-story", lane: "narrative" });
    expect(resolveEpisodeApprover(aggregate, "episode-12", { isDemo: false, roleLens: "producer", viewerAssignmentId: "assignment-rights" })).toBeNull();
  });
});

describe("episode sample compare", () => {
  it("offers storyboard, two line-art versions and color for side-by-side and slider compare", () => {
    const items = createEpisodeSampleCompareItems(NOW, { storyboard: "콘티", lineArt: "선화·명암", color: "채색" });
    expect(items.map((item) => `${item.processLabel} ${item.revisionLabel}`)).toEqual(["콘티 v1", "선화·명암 v1", "선화·명암 v2", "채색 v1"]);
    expect(items.every((item) => item.imageUrl?.startsWith("/brand/illustrated-20260928/"))).toBe(true);
  });
});
