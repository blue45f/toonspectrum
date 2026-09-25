import type {
  IntegrationRuntimeConnectorStatus,
  IntegrationRuntimeProviderResult,
} from "./integration-runtime.contract";
import type { IntegrationRuntimeActionDto } from "./integration-runtime.dto";
import {
  IntegrationRuntimeExternalError,
  IntegrationRuntimeTransport,
} from "./integration-runtime.transport";

type EnvLike = Record<string, string | undefined>;

type NotionAction = Extract<IntegrationRuntimeActionDto, { providerId: "notion" }>;
type LinearAction = Extract<IntegrationRuntimeActionDto, { providerId: "linear" }>;
type JiraAction = Extract<IntegrationRuntimeActionDto, { providerId: "jira" }>;
type TrelloAction = Extract<IntegrationRuntimeActionDto, { providerId: "trello" }>;
type SlackAction = Extract<IntegrationRuntimeActionDto, { providerId: "slack" }>;
type TeamsAction = Extract<IntegrationRuntimeActionDto, { providerId: "microsoft-teams" }>;
type FigmaAction = Extract<IntegrationRuntimeActionDto, { providerId: "figma" }>;
type ZoomAction = Extract<IntegrationRuntimeActionDto, { providerId: "zoom" }>;
type NaverDataLabAction = Extract<IntegrationRuntimeActionDto, { providerId: "naver-datalab" }>;
type WikidataAction = Extract<IntegrationRuntimeActionDto, { providerId: "wikidata" }>;
type GoogleBooksAction = Extract<IntegrationRuntimeActionDto, { providerId: "google-books" }>;

export class IntegrationRuntimeConfigurationError extends Error {
  constructor(readonly providerId: string) {
    super(`${providerId}_not_configured`);
    this.name = "IntegrationRuntimeConfigurationError";
  }
}

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function requireValue(env: EnvLike, key: string, providerId: string): string {
  const value = clean(env[key]);
  if (!value) throw new IntegrationRuntimeConfigurationError(providerId);
  return value;
}

function record(value: unknown, code = "external_response_invalid"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IntegrationRuntimeExternalError(code, 200, true);
  }
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrString(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : text(value);
}

function publicUrl(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function configurationCount(env: EnvLike, groups: readonly (readonly string[])[]): number {
  return groups.filter((group) => !group.some((key) => clean(env[key]))).length;
}

const CONNECTOR_DEFINITIONS = [
  {
    providerId: "notion",
    name: "Notion",
    action: "task.upsert",
    category: "work-management",
    writesExternalState: true,
    executionMode: "operator-token",
    requirements: [["NOTION_API_TOKEN"]],
    summary: "Create or update a task page in an explicitly shared Notion data source.",
    exampleInput: {
      dataSourceId: "replace-with-data-source-id",
      title: "Episode 12 lettering review",
      description: "Review the approved lettering revision.",
      titleProperty: "Name",
      descriptionProperty: "Description",
      status: "In progress",
      statusProperty: "Status",
      dueDate: "2026-10-02",
      dueProperty: "Due",
    },
  },
  {
    providerId: "linear",
    name: "Linear",
    action: "task.upsert",
    category: "work-management",
    writesExternalState: true,
    executionMode: "operator-token",
    requirements: [["LINEAR_API_TOKEN"]],
    summary: "Create or update a production issue in a selected Linear team.",
    exampleInput: {
      teamId: "replace-with-team-id",
      title: "Episode 12 final QA",
      description: "Validate export, credits and publish package.",
      dueDate: "2026-10-02",
    },
  },
  {
    providerId: "jira",
    name: "Jira Cloud",
    action: "task.upsert",
    category: "work-management",
    writesExternalState: true,
    executionMode: "operator-token",
    requirements: [["JIRA_BASE_URL"], ["JIRA_EMAIL"], ["JIRA_API_TOKEN"]],
    summary: "Create or update a Jira Cloud issue using an API token, never a password.",
    exampleInput: {
      projectKey: "WEBTOON",
      issueType: "Task",
      title: "Episode 12 final QA",
      description: "Validate export, credits and publish package.",
      dueDate: "2026-10-02",
    },
  },
  {
    providerId: "trello",
    name: "Trello",
    action: "task.upsert",
    category: "work-management",
    writesExternalState: true,
    executionMode: "operator-token",
    requirements: [["TRELLO_ACCESS_TOKEN", "TRELLO_API_KEY"], ["TRELLO_ACCESS_TOKEN", "TRELLO_TOKEN"]],
    summary: "Create or update a production card in an approved Trello list.",
    exampleInput: {
      listId: "replace-with-list-id",
      title: "Episode 12 final QA",
      description: "Validate export, credits and publish package.",
      dueAt: "2026-10-02T18:00:00+09:00",
    },
  },
  {
    providerId: "slack",
    name: "Slack",
    action: "message.send",
    category: "communication",
    writesExternalState: true,
    executionMode: "operator-webhook",
    requirements: [["SLACK_WEBHOOK_URL"]],
    summary: "Send a bounded project notification through an app-based incoming webhook.",
    exampleInput: {
      title: "Review requested",
      text: "Episode 12 is ready for review.",
      url: "https://www.toonstudio.cloud/production",
      severity: "info",
    },
  },
  {
    providerId: "microsoft-teams",
    name: "Microsoft Teams",
    action: "message.send",
    category: "communication",
    writesExternalState: true,
    executionMode: "operator-webhook",
    requirements: [["MICROSOFT_TEAMS_WEBHOOK_URL"]],
    summary: "Send a bounded Adaptive Card through an operator-configured Teams workflow webhook.",
    exampleInput: {
      title: "Review requested",
      text: "Episode 12 is ready for review.",
      url: "https://www.toonstudio.cloud/production",
      severity: "info",
    },
  },
  {
    providerId: "figma",
    name: "Figma",
    action: "design.inspect",
    category: "creation",
    writesExternalState: false,
    executionMode: "operator-token",
    requirements: [["FIGMA_ACCESS_TOKEN"]],
    summary: "Read a file or selected nodes and return a source-preserving handoff summary.",
    exampleInput: {
      fileKey: "replace-with-file-key",
      nodeIds: [],
      includeImages: false,
    },
  },
  {
    providerId: "zoom",
    name: "Zoom",
    action: "meeting.create",
    category: "communication",
    writesExternalState: true,
    executionMode: "operator-token",
    requirements: [["ZOOM_ACCOUNT_ID"], ["ZOOM_CLIENT_ID"], ["ZOOM_CLIENT_SECRET"]],
    summary: "Create a scheduled review meeting with server-to-server OAuth and return only the attendee URL.",
    exampleInput: {
      userId: "me",
      topic: "Episode 12 review",
      startTime: "2026-10-02T14:00:00+09:00",
      durationMinutes: 60,
      timezone: "Asia/Seoul",
      agenda: "Review lettering, tone and publish readiness.",
      waitingRoom: true,
    },
  },
  {
    providerId: "naver-datalab",
    name: "Naver DataLab",
    action: "trends.read",
    category: "data",
    writesExternalState: false,
    executionMode: "operator-token",
    requirements: [["NAVER_CLIENT_ID"], ["NAVER_CLIENT_SECRET"]],
    summary: "Read dated search-interest ratios as a separate, attributed insight signal.",
    exampleInput: {
      startDate: "2026-09-01",
      endDate: "2026-09-25",
      timeUnit: "date",
      keywordGroups: [{ groupName: "작품명", keywords: ["작품명", "작품명 웹툰"] }],
    },
  },
  {
    providerId: "wikidata",
    name: "Wikidata",
    action: "trends.read",
    category: "data",
    writesExternalState: false,
    executionMode: "public-protocol",
    requirements: [],
    summary: "Search public entities for attributed adaptation and creator metadata candidates.",
    exampleInput: { query: "나 혼자만 레벨업", language: "ko", limit: 10 },
  },
  {
    providerId: "google-books",
    name: "Google Books",
    action: "trends.read",
    category: "data",
    writesExternalState: false,
    executionMode: "public-protocol",
    requirements: [],
    summary: "Search public book metadata without treating it as an authoritative rights record.",
    exampleInput: { query: "나 혼자만 레벨업", language: "ko", maxResults: 10 },
  },
] as const;

export function integrationRuntimeConnectorStatuses(env: EnvLike): readonly IntegrationRuntimeConnectorStatus[] {
  return CONNECTOR_DEFINITIONS.map((definition) => {
    const missingConfigurationCount = configurationCount(env, definition.requirements);
    return {
      providerId: definition.providerId,
      name: definition.name,
      action: definition.action,
      category: definition.category,
      configured: missingConfigurationCount === 0,
      missingConfigurationCount,
      writesExternalState: definition.writesExternalState,
      executionMode: definition.executionMode,
      summary: definition.summary,
      exampleInput: definition.exampleInput,
    } satisfies IntegrationRuntimeConnectorStatus;
  });
}

export function integrationRuntimeConnectorStatus(
  providerId: IntegrationRuntimeActionDto["providerId"],
  env: EnvLike,
): IntegrationRuntimeConnectorStatus {
  const result = integrationRuntimeConnectorStatuses(env).find((item) => item.providerId === providerId);
  if (!result) throw new IntegrationRuntimeConfigurationError(providerId);
  return result;
}

function notionProperties(input: NotionAction["input"]): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    [input.titleProperty]: {
      type: "title",
      title: [{ type: "text", text: { content: input.title } }],
    },
  };
  if (input.description) {
    properties[input.descriptionProperty] = {
      type: "rich_text",
      rich_text: [{ type: "text", text: { content: input.description } }],
    };
  }
  if (input.status) {
    properties[input.statusProperty] = { type: "status", status: { name: input.status } };
  }
  if (input.dueDate) {
    properties[input.dueProperty] = { type: "date", date: { start: input.dueDate } };
  }
  return properties;
}

async function executeNotion(
  action: NotionAction,
  env: EnvLike,
  transport: IntegrationRuntimeTransport,
): Promise<IntegrationRuntimeProviderResult> {
  const token = requireValue(env, "NOTION_API_TOKEN", "notion");
  const updating = Boolean(action.input.pageId);
  const response = await transport.request({
    url: updating
      ? `https://api.notion.com/v1/pages/${encodeURIComponent(action.input.pageId!)}`
      : "https://api.notion.com/v1/pages",
    method: updating ? "PATCH" : "POST",
    allowedHosts: ["api.notion.com"],
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": clean(env.NOTION_API_VERSION) || "2026-03-11",
    },
    body: JSON.stringify({
      ...(updating ? {} : { parent: { type: "data_source_id", data_source_id: action.input.dataSourceId } }),
      properties: notionProperties(action.input),
    }),
  });
  const payload = record(response.body);
  const id = text(payload.id);
  if (!id) throw new IntegrationRuntimeExternalError("notion_response_invalid", response.status, true);
  return {
    externalId: id,
    response: {
      providerId: "notion",
      action: action.action,
      mode: updating ? "updated" : "created",
      id,
      url: publicUrl(payload.url),
      lastEditedTime: text(payload.last_edited_time),
    },
  };
}

async function executeLinear(
  action: LinearAction,
  env: EnvLike,
  transport: IntegrationRuntimeTransport,
): Promise<IntegrationRuntimeProviderResult> {
  const token = requireValue(env, "LINEAR_API_TOKEN", "linear");
  const updating = Boolean(action.input.issueId);
  const query = updating
    ? `mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier title url updatedAt } } }`
    : `mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title url updatedAt } } }`;
  const input = {
    ...(updating ? {} : { teamId: action.input.teamId }),
    title: action.input.title,
    ...(action.input.description ? { description: action.input.description } : {}),
    ...(action.input.stateId ? { stateId: action.input.stateId } : {}),
    ...(action.input.assigneeId ? { assigneeId: action.input.assigneeId } : {}),
    ...(action.input.dueDate ? { dueDate: action.input.dueDate } : {}),
  };
  const response = await transport.request({
    url: "https://api.linear.app/graphql",
    method: "POST",
    allowedHosts: ["api.linear.app"],
    headers: { Authorization: token },
    body: JSON.stringify({
      query,
      variables: updating
        ? { id: action.input.issueId, input }
        : { input },
    }),
  });
  const payload = record(response.body);
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new IntegrationRuntimeExternalError("linear_graphql_error", response.status, false);
  }
  const data = record(payload.data, "linear_response_invalid");
  const operation = record(
    updating ? data.issueUpdate : data.issueCreate,
    "linear_response_invalid",
  );
  if (operation.success !== true) {
    throw new IntegrationRuntimeExternalError("linear_operation_failed", response.status, false);
  }
  const issue = record(operation.issue, "linear_response_invalid");
  const id = text(issue.id);
  if (!id) throw new IntegrationRuntimeExternalError("linear_response_invalid", response.status, true);
  return {
    externalId: id,
    response: {
      providerId: "linear",
      action: action.action,
      mode: updating ? "updated" : "created",
      id,
      identifier: text(issue.identifier),
      title: text(issue.title),
      url: publicUrl(issue.url),
      updatedAt: text(issue.updatedAt),
    },
  };
}

function jiraDescription(value: string): Record<string, unknown> | undefined {
  if (!value) return undefined;
  return {
    version: 1,
    type: "doc",
    content: [{
      type: "paragraph",
      content: [{ type: "text", text: value }],
    }],
  };
}

async function executeJira(
  action: JiraAction,
  env: EnvLike,
  transport: IntegrationRuntimeTransport,
): Promise<IntegrationRuntimeProviderResult> {
  const rawBase = requireValue(env, "JIRA_BASE_URL", "jira");
  let base: URL;
  try {
    base = new URL(rawBase);
  } catch {
    throw new IntegrationRuntimeConfigurationError("jira");
  }
  if (base.protocol !== "https:" || !base.hostname.toLowerCase().endsWith(".atlassian.net")) {
    throw new IntegrationRuntimeConfigurationError("jira");
  }
  const email = requireValue(env, "JIRA_EMAIL", "jira");
  const token = requireValue(env, "JIRA_API_TOKEN", "jira");
  const updating = Boolean(action.input.issueKey);
  const fields: Record<string, unknown> = {
    summary: action.input.title,
    ...(updating ? {} : {
      project: { key: action.input.projectKey },
      issuetype: { name: action.input.issueType },
    }),
    ...(jiraDescription(action.input.description)
      ? { description: jiraDescription(action.input.description) }
      : {}),
    ...(action.input.dueDate ? { duedate: action.input.dueDate } : {}),
    ...(action.input.assigneeAccountId
      ? { assignee: { accountId: action.input.assigneeAccountId } }
      : {}),
  };
  const url = new URL(
    updating
      ? `/rest/api/3/issue/${encodeURIComponent(action.input.issueKey!)}`
      : "/rest/api/3/issue",
    base,
  );
  const response = await transport.request({
    url: url.href,
    method: updating ? "PUT" : "POST",
    allowedHosts: [".atlassian.net"],
    headers: {
      Authorization: `Basic ${Buffer.from(`${email}:${token}`, "utf8").toString("base64")}`,
    },
    body: JSON.stringify({ fields }),
  });
  const payload = optionalRecord(response.body) ?? {};
  const key = updating ? action.input.issueKey! : text(payload.key);
  if (!key) throw new IntegrationRuntimeExternalError("jira_response_invalid", response.status, true);
  return {
    externalId: key,
    response: {
      providerId: "jira",
      action: action.action,
      mode: updating ? "updated" : "created",
      id: text(payload.id),
      key,
      url: new URL(`/browse/${encodeURIComponent(key)}`, base).href,
    },
  };
}

async function executeTrello(
  action: TrelloAction,
  env: EnvLike,
  transport: IntegrationRuntimeTransport,
): Promise<IntegrationRuntimeProviderResult> {
  const bearer = clean(env.TRELLO_ACCESS_TOKEN);
  const apiKey = clean(env.TRELLO_API_KEY);
  const token = clean(env.TRELLO_TOKEN);
  if (!bearer && (!apiKey || !token)) throw new IntegrationRuntimeConfigurationError("trello");
  const updating = Boolean(action.input.cardId);
  const url = new URL(
    updating
      ? `https://api.trello.com/1/cards/${encodeURIComponent(action.input.cardId!)}`
      : "https://api.trello.com/1/cards",
  );
  if (!bearer) {
    url.searchParams.set("key", apiKey);
    url.searchParams.set("token", token);
  }
  const response = await transport.request({
    url: url.href,
    method: updating ? "PUT" : "POST",
    allowedHosts: ["api.trello.com"],
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
    body: JSON.stringify({
      name: action.input.title,
      desc: action.input.description,
      idList: action.input.listId,
      ...(action.input.dueAt ? { due: action.input.dueAt } : {}),
    }),
  });
  const payload = record(response.body, "trello_response_invalid");
  const id = text(payload.id);
  if (!id) throw new IntegrationRuntimeExternalError("trello_response_invalid", response.status, true);
  return {
    externalId: id,
    response: {
      providerId: "trello",
      action: action.action,
      mode: updating ? "updated" : "created",
      id,
      name: text(payload.name),
      url: publicUrl(payload.url) ?? publicUrl(payload.shortUrl),
      due: text(payload.due),
    },
  };
}

function messageText(input: SlackAction["input"] | TeamsAction["input"]): string {
  return [
    input.title ? `*${input.title}*` : "",
    input.text,
    input.url ?? "",
  ].filter(Boolean).join("\n");
}

async function executeSlack(
  action: SlackAction,
  env: EnvLike,
  transport: IntegrationRuntimeTransport,
): Promise<IntegrationRuntimeProviderResult> {
  const webhook = requireValue(env, "SLACK_WEBHOOK_URL", "slack");
  const response = await transport.request({
    url: webhook,
    method: "POST",
    allowedHosts: ["hooks.slack.com", "hooks.slack-gov.com"],
    body: JSON.stringify({ text: messageText(action.input), unfurl_links: false, unfurl_media: false }),
    maximumResponseBytes: 65_536,
  });
  const accepted = response.body === null || response.body === "ok" || optionalRecord(response.body) !== null;
  if (!accepted) throw new IntegrationRuntimeExternalError("slack_response_invalid", response.status, true);
  return {
    externalId: null,
    response: {
      providerId: "slack",
      action: action.action,
      delivered: true,
      severity: action.input.severity,
      status: response.status,
    },
  };
}

function teamsCard(action: TeamsAction): Record<string, unknown> {
  const color = {
    info: "accent",
    success: "good",
    warning: "warning",
    critical: "attention",
  }[action.input.severity];
  return {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      contentUrl: null,
      content: {
        $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.5",
        body: [
          ...(action.input.title
            ? [{ type: "TextBlock", text: action.input.title, weight: "Bolder", size: "Medium", color }]
            : []),
          { type: "TextBlock", text: action.input.text, wrap: true },
        ],
        actions: action.input.url
          ? [{ type: "Action.OpenUrl", title: "Open ToonStudio", url: action.input.url }]
          : [],
      },
    }],
  };
}

async function executeTeams(
  action: TeamsAction,
  env: EnvLike,
  transport: IntegrationRuntimeTransport,
): Promise<IntegrationRuntimeProviderResult> {
  const webhook = requireValue(env, "MICROSOFT_TEAMS_WEBHOOK_URL", "microsoft-teams");
  const response = await transport.request({
    url: webhook,
    method: "POST",
    allowedHosts: [
      ".logic.azure.com",
      ".api.powerplatform.com",
      ".webhook.office.com",
      ".webhook.office365.com",
      "outlook.office.com",
    ],
    body: JSON.stringify(teamsCard(action)),
    maximumResponseBytes: 65_536,
  });
  return {
    externalId: null,
    response: {
      providerId: "microsoft-teams",
      action: action.action,
      delivered: true,
      severity: action.input.severity,
      status: response.status,
    },
  };
}

function figmaNodeSummary(value: unknown): Record<string, unknown> | null {
  const node = optionalRecord(value);
  if (!node) return null;
  const document = optionalRecord(node.document) ?? node;
  const id = text(document.id);
  const name = text(document.name);
  const type = text(document.type);
  if (!id && !name && !type) return null;
  return { id, name, type };
}

async function executeFigma(
  action: FigmaAction,
  env: EnvLike,
  transport: IntegrationRuntimeTransport,
): Promise<IntegrationRuntimeProviderResult> {
  const token = requireValue(env, "FIGMA_ACCESS_TOKEN", "figma");
  const ids = action.input.nodeIds;
  const endpoint = ids.length > 0
    ? `https://api.figma.com/v1/files/${encodeURIComponent(action.input.fileKey)}/nodes?ids=${encodeURIComponent(ids.join(","))}&depth=1`
    : `https://api.figma.com/v1/files/${encodeURIComponent(action.input.fileKey)}?depth=2`;
  const response = await transport.request({
    url: endpoint,
    allowedHosts: ["api.figma.com"],
    headers: { "X-Figma-Token": token },
  });
  const payload = record(response.body, "figma_response_invalid");
  const document = optionalRecord(payload.document);
  const nodeValues = ids.length > 0
    ? Object.values(optionalRecord(payload.nodes) ?? {})
    : (Array.isArray(document?.children) ? document.children : []);
  const nodes = nodeValues
    .map(figmaNodeSummary)
    .filter((item): item is Record<string, unknown> => Boolean(item));

  let images: Record<string, string | null> | null = null;
  if (action.input.includeImages && ids.length > 0) {
    const imageResponse = await transport.request({
      url: `https://api.figma.com/v1/images/${encodeURIComponent(action.input.fileKey)}?ids=${encodeURIComponent(ids.join(","))}&format=png&scale=1`,
      allowedHosts: ["api.figma.com"],
      headers: { "X-Figma-Token": token },
    });
    const imagePayload = record(imageResponse.body, "figma_image_response_invalid");
    const rawImages = optionalRecord(imagePayload.images) ?? {};
    images = Object.fromEntries(Object.entries(rawImages).map(([id, value]) => [id, publicUrl(value)]));
  }

  const normalized = {
    providerId: "figma",
    action: action.action,
    fileKey: action.input.fileKey,
    name: text(payload.name),
    version: text(payload.version),
    lastModified: text(payload.lastModified),
    nodeCount: nodes.length,
    nodes,
  };
  return {
    externalId: action.input.fileKey,
    response: {
      ...normalized,
      images,
      imagesTransient: images !== null,
    },
    receiptResponse: {
      ...normalized,
      imageReadyNodeIds: images
        ? Object.entries(images).filter(([, url]) => url !== null).map(([id]) => id)
        : [],
      imagesTransient: images !== null,
      transientValuesPersisted: false,
    },
  };
}

async function executeZoom(
  action: ZoomAction,
  env: EnvLike,
  transport: IntegrationRuntimeTransport,
): Promise<IntegrationRuntimeProviderResult> {
  const accountId = requireValue(env, "ZOOM_ACCOUNT_ID", "zoom");
  const clientId = requireValue(env, "ZOOM_CLIENT_ID", "zoom");
  const clientSecret = requireValue(env, "ZOOM_CLIENT_SECRET", "zoom");
  const tokenUrl = new URL("https://zoom.us/oauth/token");
  tokenUrl.searchParams.set("grant_type", "account_credentials");
  tokenUrl.searchParams.set("account_id", accountId);
  const tokenResponse = await transport.request({
    url: tokenUrl.href,
    method: "POST",
    allowedHosts: ["zoom.us"],
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    maximumResponseBytes: 65_536,
  });
  const tokenPayload = record(tokenResponse.body, "zoom_token_response_invalid");
  const accessToken = text(tokenPayload.access_token);
  if (!accessToken) throw new IntegrationRuntimeExternalError("zoom_token_response_invalid", tokenResponse.status, false);

  const response = await transport.request({
    url: `https://api.zoom.us/v2/users/${encodeURIComponent(action.input.userId)}/meetings`,
    method: "POST",
    allowedHosts: ["api.zoom.us"],
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      topic: action.input.topic,
      type: 2,
      start_time: action.input.startTime,
      duration: action.input.durationMinutes,
      timezone: action.input.timezone,
      agenda: action.input.agenda,
      settings: {
        waiting_room: action.input.waitingRoom,
        join_before_host: false,
        mute_upon_entry: true,
      },
    }),
  });
  const payload = record(response.body, "zoom_response_invalid");
  const id = numberOrString(payload.id);
  if (!id) throw new IntegrationRuntimeExternalError("zoom_response_invalid", response.status, true);
  return {
    externalId: id,
    response: {
      providerId: "zoom",
      action: action.action,
      id,
      uuid: text(payload.uuid),
      topic: text(payload.topic),
      joinUrl: publicUrl(payload.join_url),
      startTime: text(payload.start_time),
      timezone: text(payload.timezone),
      durationMinutes: typeof payload.duration === "number" ? payload.duration : action.input.durationMinutes,
    },
  };
}

async function executeNaverDataLab(
  action: NaverDataLabAction,
  env: EnvLike,
  transport: IntegrationRuntimeTransport,
): Promise<IntegrationRuntimeProviderResult> {
  const clientId = requireValue(env, "NAVER_CLIENT_ID", "naver-datalab");
  const clientSecret = requireValue(env, "NAVER_CLIENT_SECRET", "naver-datalab");
  const response = await transport.request({
    url: "https://openapi.naver.com/v1/datalab/search",
    method: "POST",
    allowedHosts: ["openapi.naver.com"],
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
    body: JSON.stringify({
      startDate: action.input.startDate,
      endDate: action.input.endDate,
      timeUnit: action.input.timeUnit,
      keywordGroups: action.input.keywordGroups,
      ...(action.input.device ? { device: action.input.device } : {}),
      ...(action.input.gender ? { gender: action.input.gender } : {}),
      ...(action.input.ages ? { ages: action.input.ages } : {}),
    }),
  });
  const payload = record(response.body, "naver_datalab_response_invalid");
  const results = Array.isArray(payload.results) ? payload.results.slice(0, 5) : [];
  return {
    externalId: null,
    response: {
      providerId: "naver-datalab",
      action: action.action,
      startDate: text(payload.startDate) ?? action.input.startDate,
      endDate: text(payload.endDate) ?? action.input.endDate,
      timeUnit: text(payload.timeUnit) ?? action.input.timeUnit,
      results,
      source: "Naver DataLab",
    },
  };
}

async function executeWikidata(
  action: WikidataAction,
  transport: IntegrationRuntimeTransport,
): Promise<IntegrationRuntimeProviderResult> {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("search", action.input.query);
  url.searchParams.set("language", action.input.language);
  url.searchParams.set("uselang", action.input.language);
  url.searchParams.set("type", "item");
  url.searchParams.set("limit", String(action.input.limit));
  const response = await transport.request({
    url: url.href,
    allowedHosts: ["www.wikidata.org"],
  });
  const payload = record(response.body, "wikidata_response_invalid");
  const raw = Array.isArray(payload.search) ? payload.search : [];
  const results = raw.slice(0, action.input.limit).map((item) => {
    const entity = optionalRecord(item) ?? {};
    const id = text(entity.id);
    return {
      id,
      label: text(entity.label),
      description: text(entity.description),
      url: id ? `https://www.wikidata.org/wiki/${encodeURIComponent(id)}` : null,
    };
  });
  return {
    externalId: null,
    response: {
      providerId: "wikidata",
      action: action.action,
      query: action.input.query,
      language: action.input.language,
      results,
      source: "Wikidata",
    },
  };
}

async function executeGoogleBooks(
  action: GoogleBooksAction,
  env: EnvLike,
  transport: IntegrationRuntimeTransport,
): Promise<IntegrationRuntimeProviderResult> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", action.input.query);
  url.searchParams.set("maxResults", String(action.input.maxResults));
  if (action.input.language) url.searchParams.set("langRestrict", action.input.language);
  const apiKey = clean(env.GOOGLE_BOOKS_API_KEY);
  if (apiKey) url.searchParams.set("key", apiKey);
  const response = await transport.request({
    url: url.href,
    allowedHosts: ["www.googleapis.com"],
  });
  const payload = record(response.body, "google_books_response_invalid");
  const items = Array.isArray(payload.items) ? payload.items : [];
  const results = items.slice(0, action.input.maxResults).map((item) => {
    const volume = optionalRecord(item) ?? {};
    const info = optionalRecord(volume.volumeInfo) ?? {};
    return {
      id: text(volume.id),
      title: text(info.title),
      subtitle: text(info.subtitle),
      authors: Array.isArray(info.authors)
        ? info.authors.filter((value): value is string => typeof value === "string").slice(0, 20)
        : [],
      publishedDate: text(info.publishedDate),
      publisher: text(info.publisher),
      language: text(info.language),
      infoUrl: publicUrl(info.infoLink),
    };
  });
  return {
    externalId: null,
    response: {
      providerId: "google-books",
      action: action.action,
      query: action.input.query,
      totalItems: typeof payload.totalItems === "number" ? payload.totalItems : results.length,
      results,
      source: "Google Books",
    },
  };
}

export class IntegrationRuntimeProviderEngine {
  constructor(
    private readonly env: EnvLike = process.env,
    private readonly transport = new IntegrationRuntimeTransport(),
  ) {}

  connectors(): readonly IntegrationRuntimeConnectorStatus[] {
    return integrationRuntimeConnectorStatuses(this.env);
  }

  status(providerId: IntegrationRuntimeActionDto["providerId"]): IntegrationRuntimeConnectorStatus {
    return integrationRuntimeConnectorStatus(providerId, this.env);
  }

  async execute(action: IntegrationRuntimeActionDto): Promise<IntegrationRuntimeProviderResult> {
    switch (action.providerId) {
      case "notion": return executeNotion(action, this.env, this.transport);
      case "linear": return executeLinear(action, this.env, this.transport);
      case "jira": return executeJira(action, this.env, this.transport);
      case "trello": return executeTrello(action, this.env, this.transport);
      case "slack": return executeSlack(action, this.env, this.transport);
      case "microsoft-teams": return executeTeams(action, this.env, this.transport);
      case "figma": return executeFigma(action, this.env, this.transport);
      case "zoom": return executeZoom(action, this.env, this.transport);
      case "naver-datalab": return executeNaverDataLab(action, this.env, this.transport);
      case "wikidata": return executeWikidata(action, this.transport);
      case "google-books": return executeGoogleBooks(action, this.env, this.transport);
    }
  }
}
