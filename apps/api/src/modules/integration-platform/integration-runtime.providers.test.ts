import { describe, expect, it, vi } from "vitest";

import type { IntegrationRuntimeActionDto } from "./integration-runtime.dto";
import { IntegrationRuntimeProviderEngine } from "./integration-runtime.providers";
import {
  IntegrationRuntimeTransport,
  type IntegrationRuntimeFetch,
} from "./integration-runtime.transport";

function response(body: unknown, status = 200, contentType = "application/json") {
  return new Response(
    contentType.includes("json") ? JSON.stringify(body) : String(body),
    { status, headers: { "Content-Type": contentType } },
  );
}

function engine(
  env: Record<string, string>,
  fetcher: IntegrationRuntimeFetch,
) {
  return new IntegrationRuntimeProviderEngine(
    env,
    new IntegrationRuntimeTransport(fetcher),
  );
}

const notionAction: IntegrationRuntimeActionDto = {
  providerId: "notion",
  action: "task.upsert",
  input: {
    dataSourceId: "data-source-1",
    title: "Episode QA",
    description: "Check the approved revision.",
    descriptionProperty: "Description",
    titleProperty: "Name",
    status: "In progress",
    statusProperty: "Status",
    dueDate: "2026-10-02",
    dueProperty: "Due",
  },
};

describe("IntegrationRuntimeProviderEngine", () => {
  it("reports runtime readiness without exposing secret values", () => {
    const value = engine(
      { NOTION_API_TOKEN: "secret-notion-token" },
      vi.fn<IntegrationRuntimeFetch>(),
    ).connectors();
    expect(value.find((item) => item.providerId === "notion")).toMatchObject({
      configured: true,
      action: "task.upsert",
    });
    expect(JSON.stringify(value)).not.toContain("secret-notion-token");
    expect(value.find((item) => item.providerId === "wikidata")?.configured).toBe(true);
  });

  it("creates a Notion data-source page with bounded properties", async () => {
    const fetcher = vi.fn<IntegrationRuntimeFetch>().mockResolvedValue(response({
      id: "page-1",
      url: "https://www.notion.so/page-1",
      last_edited_time: "2026-09-25T00:00:00.000Z",
    }));
    const result = await engine({ NOTION_API_TOKEN: "token" }, fetcher).execute(notionAction);
    expect(result).toMatchObject({ externalId: "page-1", response: { mode: "created" } });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://api.notion.com/v1/pages");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer token",
      "Notion-Version": "2026-03-11",
    });
    const body = JSON.parse(String(init?.body));
    expect(body.parent).toEqual({ type: "data_source_id", data_source_id: "data-source-1" });
    expect(body.properties.Name.title[0].text.content).toBe("Episode QA");
  });

  it("creates and updates Linear issues through the GraphQL contract", async () => {
    const fetcher = vi.fn<IntegrationRuntimeFetch>().mockResolvedValue(response({
      data: {
        issueCreate: {
          success: true,
          issue: { id: "issue-1", identifier: "WEB-12", title: "Episode QA", url: "https://linear.app/x/issue/WEB-12", updatedAt: "now" },
        },
      },
    }));
    const result = await engine({ LINEAR_API_TOKEN: "linear-token" }, fetcher).execute({
      providerId: "linear",
      action: "task.upsert",
      input: { teamId: "team-1", title: "Episode QA", description: "", dueDate: "2026-10-02" },
    });
    expect(result.response).toMatchObject({ identifier: "WEB-12", mode: "created" });
    const [, init] = fetcher.mock.calls[0]!;
    expect(init?.headers).toMatchObject({ Authorization: "linear-token" });
    expect(JSON.parse(String(init?.body)).variables.input).toMatchObject({ teamId: "team-1", dueDate: "2026-10-02" });
  });

  it("uses Jira Cloud API-token basic auth and ADF without retaining credentials", async () => {
    const fetcher = vi.fn<IntegrationRuntimeFetch>().mockResolvedValue(response({
      id: "10001",
      key: "WEB-12",
      self: "https://example.atlassian.net/rest/api/3/issue/10001",
    }, 201));
    const result = await engine({
      JIRA_BASE_URL: "https://example.atlassian.net",
      JIRA_EMAIL: "creator@example.com",
      JIRA_API_TOKEN: "jira-secret",
    }, fetcher).execute({
      providerId: "jira",
      action: "task.upsert",
      input: {
        projectKey: "WEB",
        issueType: "Task",
        title: "Episode QA",
        description: "Check export.",
        dueDate: "2026-10-02",
      },
    });
    expect(result.response).toMatchObject({ key: "WEB-12", url: "https://example.atlassian.net/browse/WEB-12" });
    expect(JSON.stringify(result)).not.toContain("jira-secret");
    const [, init] = fetcher.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.fields.description).toMatchObject({ version: 1, type: "doc" });
    expect(String((init?.headers as Record<string, string>).Authorization)).toMatch(/^Basic /u);
  });

  it("supports Trello token auth and normalizes the created card", async () => {
    const fetcher = vi.fn<IntegrationRuntimeFetch>().mockResolvedValue(response({
      id: "card-1",
      name: "Episode QA",
      url: "https://trello.com/c/card-1",
      due: null,
    }));
    const result = await engine({ TRELLO_ACCESS_TOKEN: "access-token" }, fetcher).execute({
      providerId: "trello",
      action: "task.upsert",
      input: { listId: "list-1", title: "Episode QA", description: "Check export." },
    });
    expect(result.response).toMatchObject({ id: "card-1", mode: "created" });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://api.trello.com/1/cards");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer access-token" });
  });

  it("sends bounded Slack and Teams webhook payloads", async () => {
    const slackFetch = vi.fn<IntegrationRuntimeFetch>().mockResolvedValue(response("ok", 200, "text/plain"));
    const slack = await engine({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/A/B/C" }, slackFetch).execute({
      providerId: "slack",
      action: "message.send",
      input: { title: "Review", text: "Episode ready", severity: "info" },
    });
    expect(slack.response).toMatchObject({ delivered: true, providerId: "slack" });

    const teamsFetch = vi.fn<IntegrationRuntimeFetch>().mockResolvedValue(response({ accepted: true }));
    await engine({ MICROSOFT_TEAMS_WEBHOOK_URL: "https://prod-01.koreacentral.logic.azure.com/workflows/example" }, teamsFetch).execute({
      providerId: "microsoft-teams",
      action: "message.send",
      input: { title: "Review", text: "Episode ready", severity: "warning" },
    });
    const body = JSON.parse(String(teamsFetch.mock.calls[0]![1]?.body));
    expect(body.attachments[0].content.type).toBe("AdaptiveCard");
  });

  it("reads Figma metadata and optional render URLs without downloading assets", async () => {
    const fetcher = vi.fn<IntegrationRuntimeFetch>()
      .mockResolvedValueOnce(response({
        name: "Campaign",
        version: "12",
        lastModified: "2026-09-25T00:00:00Z",
        nodes: { "1:2": { document: { id: "1:2", name: "Cover", type: "FRAME" } } },
      }))
      .mockResolvedValueOnce(response({ images: { "1:2": "https://s3-alpha.figma.com/render.png" } }));
    const result = await engine({ FIGMA_ACCESS_TOKEN: "figma-secret" }, fetcher).execute({
      providerId: "figma",
      action: "design.inspect",
      input: { fileKey: "abcdefgh1234", nodeIds: ["1:2"], includeImages: true },
    });
    expect(result.response).toMatchObject({ name: "Campaign", nodeCount: 1, images: { "1:2": "https://s3-alpha.figma.com/render.png" }, imagesTransient: true });
    expect(result.receiptResponse).toMatchObject({
      name: "Campaign",
      imageReadyNodeIds: ["1:2"],
      transientValuesPersisted: false,
    });
    expect(JSON.stringify(result.receiptResponse)).not.toContain("s3-alpha.figma.com");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("figma-secret");
  });

  it("creates a Zoom meeting but never returns the host start URL or access token", async () => {
    const fetcher = vi.fn<IntegrationRuntimeFetch>()
      .mockResolvedValueOnce(response({ access_token: "zoom-access-secret", token_type: "bearer", expires_in: 3600 }))
      .mockResolvedValueOnce(response({
        id: 123456789,
        uuid: "meeting-uuid",
        topic: "Episode review",
        join_url: "https://zoom.us/j/123456789",
        start_url: "https://zoom.us/s/host-secret",
        start_time: "2026-10-02T05:00:00Z",
        timezone: "Asia/Seoul",
        duration: 60,
      }, 201));
    const result = await engine({
      ZOOM_ACCOUNT_ID: "account",
      ZOOM_CLIENT_ID: "client",
      ZOOM_CLIENT_SECRET: "client-secret",
    }, fetcher).execute({
      providerId: "zoom",
      action: "meeting.create",
      input: {
        userId: "me",
        topic: "Episode review",
        startTime: "2026-10-02T14:00:00+09:00",
        durationMinutes: 60,
        timezone: "Asia/Seoul",
        agenda: "Review",
        waitingRoom: true,
      },
    });
    expect(result.response).toMatchObject({ id: "123456789", joinUrl: "https://zoom.us/j/123456789" });
    expect(JSON.stringify(result)).not.toContain("host-secret");
    expect(JSON.stringify(result)).not.toContain("zoom-access-secret");
  });

  it("normalizes Naver DataLab, Wikidata and Google Books read results", async () => {
    const naverFetch = vi.fn<IntegrationRuntimeFetch>().mockResolvedValue(response({
      startDate: "2026-09-01",
      endDate: "2026-09-25",
      timeUnit: "date",
      results: [{ title: "work", keywords: ["work"], data: [{ period: "2026-09-01", ratio: 42 }] }],
    }));
    const naver = await engine({ NAVER_CLIENT_ID: "id", NAVER_CLIENT_SECRET: "secret" }, naverFetch).execute({
      providerId: "naver-datalab",
      action: "trends.read",
      input: {
        startDate: "2026-09-01",
        endDate: "2026-09-25",
        timeUnit: "date",
        keywordGroups: [{ groupName: "work", keywords: ["work"] }],
      },
    });
    expect(naver.response).toMatchObject({ source: "Naver DataLab" });

    const wikidataFetch = vi.fn<IntegrationRuntimeFetch>().mockResolvedValue(response({
      search: [{ id: "Q1", label: "Work", description: "series" }],
    }));
    const wikidata = await engine({}, wikidataFetch).execute({
      providerId: "wikidata",
      action: "trends.read",
      input: { query: "Work", language: "en", limit: 5 },
    });
    expect(wikidata.response).toMatchObject({ results: [{ id: "Q1", url: "https://www.wikidata.org/wiki/Q1" }] });

    const booksFetch = vi.fn<IntegrationRuntimeFetch>().mockResolvedValue(response({
      totalItems: 1,
      items: [{ id: "book-1", volumeInfo: { title: "Novel", authors: ["Author"], infoLink: "https://books.google.com/book" } }],
    }));
    const books = await engine({}, booksFetch).execute({
      providerId: "google-books",
      action: "trends.read",
      input: { query: "Novel", maxResults: 5 },
    });
    expect(books.response).toMatchObject({ totalItems: 1, results: [{ id: "book-1", title: "Novel" }] });
  });
});
