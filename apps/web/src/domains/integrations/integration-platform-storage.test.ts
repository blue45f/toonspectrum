import { describe, expect, it, vi } from "vitest";

import {
  loadIntegrationRecipes,
  recipeDraftFromTemplate,
  saveIntegrationRecipes,
} from "./integration-platform-storage";

const template = {
  id: "review-meeting",
  name: "Review meeting",
  trigger: "review.requested",
  actions: ["calendar.create", "meeting.create", "message.send"],
} as const;

describe("integration recipe storage", () => {
  it("maps canonical actions to safe default providers", () => {
    expect(recipeDraftFromTemplate(template)).toEqual({
      id: "review-meeting",
      name: "Review meeting",
      trigger: "review.requested",
      enabled: false,
      actions: [
        { type: "calendar.create", providerId: "google-workspace" },
        { type: "meeting.create", providerId: "google-meet" },
        { type: "message.send", providerId: "slack" },
      ],
    });
  });

  it("falls back to templates when stored JSON is corrupt", () => {
    const storage = { getItem: vi.fn(() => "not-json") };
    expect(loadIntegrationRecipes([template], storage)).toEqual([
      recipeDraftFromTemplate(template),
    ]);
  });

  it("persists validated drafts as JSON", () => {
    const setItem = vi.fn();
    const recipes = [recipeDraftFromTemplate(template)];
    saveIntegrationRecipes(recipes, { setItem });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(setItem.mock.calls[0]![1] as string)).toEqual(recipes);
  });

  it("restores only structurally valid drafts", () => {
    const recipes = [{ ...recipeDraftFromTemplate(template), enabled: true }];
    const storage = { getItem: vi.fn(() => JSON.stringify(recipes)) };
    expect(loadIntegrationRecipes([template], storage)).toEqual(recipes);
  });
});
