import { describe, expect, it } from "vitest";

import { IntegrationPlatformService } from "./integration-platform.service";

const service = new IntegrationPlatformService();

describe("IntegrationPlatformService", () => {
  it("lists every external provider without exposing configured secret values", () => {
    const response = service.catalog({
      SLACK_CLIENT_ID: "client-id",
      SLACK_CLIENT_SECRET: "super-secret",
      SLACK_SIGNING_SECRET: "signing-secret",
    });
    expect(response.providers.length).toBeGreaterThan(40);
    expect(response.providers.find((provider) => provider.id === "slack")?.status).toBe("ready");
    expect(JSON.stringify(response)).not.toContain("super-secret");
    expect(JSON.stringify(response)).not.toContain("signing-secret");
  });

  it("keeps manual publishing available without third-party credentials", () => {
    const provider = service.catalog({}).providers.find(
      (candidate) => candidate.id === "external-webtoon-platforms",
    );
    expect(provider).toMatchObject({ status: "manual", executable: true });
  });

  it("does not treat provider credentials as provider approval", () => {
    const provider = service.catalog({
      TIKTOK_CLIENT_KEY: "configured-client",
      TIKTOK_CLIENT_SECRET: "configured-secret",
    }).providers.find((candidate) => candidate.id === "tiktok");
    expect(provider).toMatchObject({
      configured: true,
      status: "approval-required",
      executable: false,
    });
  });

  it("validates provider capability and configuration separately", () => {
    const result = service.validateRecipe({
      name: "Review handoff",
      trigger: "review.requested",
      actions: [
        { type: "meeting.create", providerId: "zoom" },
        { type: "message.send", providerId: "slack" },
      ],
    }, {});
    expect(result.valid).toBe(true);
    expect(result.executable).toBe(false);
    expect(result.warnings).toHaveLength(2);
  });

  it("builds channel-aware packages without pretending manual handoff is direct publish", () => {
    const result = service.buildPublishPackage({
      projectId: "project-1",
      title: "Episode 12",
      description: "Release notes",
      canonicalUrl: "https://example.com/episodes/12",
      channels: ["youtube", "external-webtoon-platforms", "rss-json-feed"],
      tags: ["webtoon", "webtoon"],
    }, {});
    expect(result.ready).toBe(true);
    expect(result.directlyExecutable).toBe(false);
    expect(result.tags).toEqual(["webtoon"]);
    expect(result.channels.find((channel) => channel.id === "external-webtoon-platforms"))
      .toMatchObject({ mode: "manual-handoff", executable: true });
  });

  it("fails closed for an unknown publishing channel", () => {
    const result = service.buildPublishPackage({
      projectId: "project-1",
      title: "Episode 12",
      description: "Release notes",
      canonicalUrl: "https://example.com/episodes/12",
      channels: ["unknown-provider"],
      tags: [],
    }, {});
    expect(result).toMatchObject({ ready: false, directlyExecutable: false });
  });

  it("escapes RSS content and emits JSON Feed and ActivityPub previews", () => {
    const result = service.buildFeedPreview({
      title: "Creator & Studio",
      homePageUrl: "https://example.com/creator",
      feedUrl: "https://example.com/creator/feed.xml",
      description: "New <episodes>",
      items: [{
        id: "episode-1",
        url: "https://example.com/creator/1",
        title: "One & Only",
        summary: "<script>not markup</script>",
        datePublished: "2026-09-25T00:00:00+09:00",
      }],
    });
    expect(result.rss).toContain("Creator &amp; Studio");
    expect(result.rss).toContain("&lt;script&gt;not markup&lt;/script&gt;");
    expect(result.jsonFeed.items).toHaveLength(1);
    expect(result.activityPub[0]).toMatchObject({ type: "Create" });
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/u);
  });
});
