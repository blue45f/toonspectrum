/**
 * engagement 스토어 소유자 파티션 회귀 테스트.
 *
 * 알림·감상 일기·취향·알림 설정이 계정 구분 없이 한 컬렉션에 쌓여,
 * 계정을 바꾸면 이전 계정의 개인 기록이 그대로 보이던 혼선을 막는다.
 */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { useEngagement } from "./engagement-store";

function resetStore() {
  useEngagement.setState({
    notifications: [],
    diaryEntries: [],
    tastePreferences: null,
    availabilityHistory: {},
    growthExperiments: [],
    notificationCategorySettings: {
      release: true,
      availability: true,
      production: true,
      market: true,
      community: true,
      system: true,
    },
    activeOwnerId: undefined,
    ownerPartitions: {},
  });
}

function saveDiary(note: string): string {
  return useEngagement.getState().saveDiaryEntry({
    titleId: "title-1",
    episode: 1,
    totalEpisodes: 10,
    readAt: "2026-10-01T00:00:00.000Z",
    mood: "moved",
    note,
    spoiler: false,
    reread: false,
    platformId: null,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  resetStore();
});

describe("engagement owner partitions", () => {
  it("레거시(미귀속) 컬렉션은 첫 bind 계정이 claim 하고, 다른 계정에는 보이지 않는다", () => {
    saveDiary("레거시 일기");
    useEngagement.getState().bindEngagementOwner("user-a");
    expect(useEngagement.getState().diaryEntries).toHaveLength(1);

    useEngagement.getState().bindEngagementOwner("user-b");
    expect(useEngagement.getState().diaryEntries).toHaveLength(0);

    useEngagement.getState().bindEngagementOwner("user-a");
    expect(useEngagement.getState().diaryEntries[0]?.note).toBe("레거시 일기");
  });

  it("계정별로 일기·취향이 갈라지고, 게스트 파티션도 따로 유지된다", () => {
    useEngagement.getState().bindEngagementOwner("user-a");
    saveDiary("A의 일기");
    useEngagement.getState().setTastePreferences({
      genres: ["로맨스"],
      selectedTitleIds: [],
      format: "all",
      status: "all",
      avoidTags: ["고어"],
      contentIntensity: "gentle",
      completedAt: "2026-10-01T00:00:00.000Z",
    });

    useEngagement.getState().bindEngagementOwner(null);
    expect(useEngagement.getState().diaryEntries).toHaveLength(0);
    expect(useEngagement.getState().tastePreferences).toBeNull();
    saveDiary("게스트 일기");

    useEngagement.getState().bindEngagementOwner("user-a");
    expect(useEngagement.getState().diaryEntries[0]?.note).toBe("A의 일기");
    expect(useEngagement.getState().tastePreferences?.avoidTags).toEqual(["고어"]);

    useEngagement.getState().bindEngagementOwner(null);
    expect(useEngagement.getState().diaryEntries[0]?.note).toBe("게스트 일기");
  });

  it("같은 계정으로 다시 bind 해도 컬렉션이 그대로다", () => {
    useEngagement.getState().bindEngagementOwner("user-a");
    saveDiary("A의 일기");
    useEngagement.getState().bindEngagementOwner("user-a");
    expect(useEngagement.getState().diaryEntries).toHaveLength(1);
  });
});
