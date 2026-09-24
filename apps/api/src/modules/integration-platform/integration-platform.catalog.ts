export type IntegrationCategory =
  | "storage"
  | "work-management"
  | "communication"
  | "creation"
  | "publishing"
  | "trust"
  | "data"
  | "commerce"
  | "developer";

export type IntegrationConnectionMode =
  | "existing"
  | "oauth"
  | "api-key"
  | "webhook"
  | "manual"
  | "protocol";

export type IntegrationActivation =
  | "available"
  | "operator-config"
  | "manual-handoff"
  | "provider-approval";

export type IntegrationCapability =
  | "files.read"
  | "files.write"
  | "tasks.read"
  | "tasks.write"
  | "messages.write"
  | "calendar.write"
  | "meetings.write"
  | "design.read"
  | "design.write"
  | "translate"
  | "assets.search"
  | "assets.import"
  | "publish.write"
  | "publish.manual"
  | "identity.read"
  | "membership.read"
  | "payments.write"
  | "payouts.write"
  | "merch.write"
  | "sign.write"
  | "provenance.verify"
  | "trends.read"
  | "api.expose"
  | "webhooks.read"
  | "webhooks.write"
  | "feeds.write";

export interface IntegrationProviderDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: IntegrationCategory;
  readonly summary: string;
  readonly capabilities: readonly IntegrationCapability[];
  readonly connectionMode: IntegrationConnectionMode;
  readonly activation: IntegrationActivation;
  readonly existingPath?: string;
  readonly requiredConfigGroups?: readonly (readonly string[])[];
  readonly approvalNote?: string;
}

export interface IntegrationProviderStatus extends IntegrationProviderDefinition {
  readonly configured: boolean;
  readonly executable: boolean;
  readonly status: "ready" | "configuration-required" | "manual" | "approval-required";
  readonly statusReason: string;
}

type EnvLike = Record<string, string | undefined>;

const provider = (
  id: string,
  name: string,
  category: IntegrationCategory,
  summary: string,
  capabilities: readonly IntegrationCapability[],
  connectionMode: IntegrationConnectionMode,
  activation: IntegrationActivation,
  options: Pick<IntegrationProviderDefinition, "existingPath" | "requiredConfigGroups" | "approvalNote"> = {},
): IntegrationProviderDefinition => ({
  id,
  name,
  category,
  summary,
  capabilities,
  connectionMode,
  activation,
  ...options,
});

const oauth = (...groups: readonly (readonly string[])[]) => groups;

export const INTEGRATION_PROVIDER_DEFINITIONS = Object.freeze([
  provider("google-workspace", "Google Workspace", "work-management", "Calendar, Gmail draft and Drive artifact handoff.", ["calendar.write", "messages.write", "files.write"], "existing", "available", { existingPath: "/production", requiredConfigGroups: oauth(["PRODUCTION_GOOGLE_OAUTH_CLIENT_ID"], ["PRODUCTION_GOOGLE_OAUTH_CLIENT_SECRET"], ["PRODUCTION_INTEGRATION_ENCRYPTION_KEY"]) }),
  provider("google-drive", "Google Drive", "storage", "User-owned project backup and resumable file handoff.", ["files.read", "files.write"], "existing", "available", { existingPath: "/settings", requiredConfigGroups: oauth(["GOOGLE_DRIVE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID"], ["GOOGLE_DRIVE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"]) }),
  provider("dropbox", "Dropbox", "storage", "App-folder project backup with revision-safe conflict detection.", ["files.read", "files.write"], "existing", "available", { existingPath: "/settings", requiredConfigGroups: oauth(["DROPBOX_OAUTH_CLIENT_ID"], ["DROPBOX_OAUTH_CLIENT_SECRET"]) }),
  provider("onedrive", "OneDrive", "storage", "App-folder project backup with ETag conflict detection.", ["files.read", "files.write"], "existing", "available", { existingPath: "/settings", requiredConfigGroups: oauth(["ONEDRIVE_OAUTH_CLIENT_ID"], ["ONEDRIVE_OAUTH_CLIENT_SECRET"]) }),
  provider("slack", "Slack", "communication", "Project alerts and actionable review notifications.", ["messages.write", "webhooks.write"], "oauth", "operator-config", { requiredConfigGroups: oauth(["SLACK_CLIENT_ID"], ["SLACK_CLIENT_SECRET"], ["SLACK_SIGNING_SECRET"]) }),
  provider("microsoft-teams", "Microsoft Teams", "communication", "Team alerts, review cards and workflow handoff.", ["messages.write", "webhooks.write"], "oauth", "operator-config", { requiredConfigGroups: oauth(["MICROSOFT_TEAMS_CLIENT_ID"], ["MICROSOFT_TEAMS_CLIENT_SECRET"]) }),
  provider("discord", "Discord", "communication", "Production notifications through an operator-approved webhook.", ["messages.write", "webhooks.write"], "existing", "available", { existingPath: "/production", requiredConfigGroups: oauth(["PRODUCTION_DISCORD_WEBHOOK_URL"]) }),
  provider("ntfy", "ntfy", "communication", "Self-hostable push-style production notifications.", ["messages.write", "webhooks.write"], "existing", "available", { existingPath: "/production", requiredConfigGroups: oauth(["PRODUCTION_NTFY_BASE_URL"], ["PRODUCTION_NTFY_TOPIC"]) }),
  provider("generic-webhook", "Generic signed webhook", "developer", "HMAC-signed event delivery to n8n, Make, Zapier or private automation.", ["webhooks.write"], "existing", "available", { existingPath: "/production", requiredConfigGroups: oauth(["PRODUCTION_GENERIC_WEBHOOK_URL"], ["PRODUCTION_GENERIC_WEBHOOK_SECRET"]) }),
  provider("notion", "Notion", "work-management", "Synchronize projects, episodes, tasks and review references.", ["tasks.read", "tasks.write", "webhooks.read"], "oauth", "operator-config", { requiredConfigGroups: oauth(["NOTION_OAUTH_CLIENT_ID"], ["NOTION_OAUTH_CLIENT_SECRET"]) }),
  provider("linear", "Linear", "work-management", "Create and update production issues with explicit field authority.", ["tasks.read", "tasks.write", "webhooks.read"], "oauth", "operator-config", { requiredConfigGroups: oauth(["LINEAR_CLIENT_ID"], ["LINEAR_CLIENT_SECRET"]) }),
  provider("jira", "Jira", "work-management", "Map episodes and production tasks into issue workflows.", ["tasks.read", "tasks.write", "webhooks.read"], "oauth", "operator-config", { requiredConfigGroups: oauth(["JIRA_OAUTH_CLIENT_ID"], ["JIRA_OAUTH_CLIENT_SECRET"]) }),
  provider("trello", "Trello", "work-management", "Board and card handoff for lightweight production planning.", ["tasks.read", "tasks.write"], "api-key", "operator-config", { requiredConfigGroups: oauth(["TRELLO_API_KEY"], ["TRELLO_API_SECRET"]) }),
  provider("figma", "Figma", "creation", "Import selected frames, comments, versions and design handoff artifacts.", ["design.read", "files.read", "webhooks.read"], "oauth", "operator-config", { requiredConfigGroups: oauth(["FIGMA_CLIENT_ID"], ["FIGMA_CLIENT_SECRET"]) }),
  provider("canva", "Canva", "creation", "Send approved covers and campaign assets into reusable templates.", ["design.read", "design.write"], "oauth", "operator-config", { requiredConfigGroups: oauth(["CANVA_CLIENT_ID"], ["CANVA_CLIENT_SECRET"]) }),
  provider("google-meet", "Google Meet", "communication", "Create review meetings and observe approved meeting artifacts.", ["calendar.write", "meetings.write"], "oauth", "operator-config", { requiredConfigGroups: oauth(["PRODUCTION_GOOGLE_OAUTH_CLIENT_ID"], ["PRODUCTION_GOOGLE_OAUTH_CLIENT_SECRET"]) }),
  provider("zoom", "Zoom", "communication", "Create review meetings and receive completion events.", ["meetings.write", "webhooks.read"], "oauth", "operator-config", { requiredConfigGroups: oauth(["ZOOM_CLIENT_ID"], ["ZOOM_CLIENT_SECRET"], ["ZOOM_WEBHOOK_SECRET_TOKEN"]) }),
  provider("deepl", "DeepL", "creation", "Machine-translation draft generation for localization review.", ["translate"], "api-key", "operator-config", { requiredConfigGroups: oauth(["DEEPL_API_KEY"]) }),
  provider("libretranslate", "LibreTranslate", "creation", "Self-hostable translation draft generation.", ["translate"], "api-key", "operator-config", { requiredConfigGroups: oauth(["LIBRETRANSLATE_BASE_URL"]) }),
  provider("youtube", "YouTube", "publishing", "Upload approved trailers and Shorts with resumable delivery.", ["publish.write"], "oauth", "operator-config", { requiredConfigGroups: oauth(["YOUTUBE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID"], ["YOUTUBE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"]) }),
  provider("tiktok", "TikTok Direct Post", "publishing", "Direct post only after provider audit and creator consent.", ["publish.write"], "oauth", "provider-approval", { requiredConfigGroups: oauth(["TIKTOK_CLIENT_KEY"], ["TIKTOK_CLIENT_SECRET"]), approvalNote: "TikTok Content Posting API audit and creator authorization are required." }),
  provider("bluesky", "Bluesky", "publishing", "Publish release notes and approved promotional cards.", ["publish.write"], "api-key", "operator-config", { requiredConfigGroups: oauth(["BLUESKY_SERVICE_URL"]) }),
  provider("mastodon", "Mastodon", "publishing", "Publish to an operator-selected Fediverse instance.", ["publish.write"], "api-key", "operator-config", { requiredConfigGroups: oauth(["MASTODON_BASE_URL"]) }),
  provider("external-webtoon-platforms", "External webtoon platforms", "publishing", "Validated ZIP, metadata copy and operator-confirmed manual upload.", ["publish.manual"], "manual", "manual-handoff"),
  provider("rss-json-feed", "RSS and JSON Feed", "publishing", "Generate open subscription feeds for episodes and creator news.", ["feeds.write"], "protocol", "available"),
  provider("activitypub", "ActivityPub", "publishing", "Prepare public activity payloads for a future federated delivery worker.", ["feeds.write", "publish.manual"], "protocol", "available"),
  provider("documenso", "Documenso", "trust", "Self-hosted signature envelopes with explicit hosted-service opt-in.", ["sign.write"], "existing", "available", { existingPath: "/production", requiredConfigGroups: oauth(["DOCUMENSO_BASE_URL"], ["DOCUMENSO_API_TOKEN"]) }),
  provider("c2pa", "C2PA credential signer", "trust", "Sign and verify provenance credentials without mislabeling local hashes.", ["sign.write", "provenance.verify"], "api-key", "operator-config", { requiredConfigGroups: oauth(["C2PA_SIGNER_BASE_URL"], ["C2PA_SIGNER_TOKEN"]) }),
  provider("naver-datalab", "Naver DataLab", "data", "Read dated search-interest signals as a separate insight axis.", ["trends.read"], "api-key", "operator-config", { requiredConfigGroups: oauth(["NAVER_CLIENT_ID"], ["NAVER_CLIENT_SECRET"]) }),
  provider("wikidata", "Wikidata", "data", "Resolve public adaptation and creator metadata with source attribution.", ["trends.read"], "protocol", "available"),
  provider("google-books", "Google Books", "data", "Resolve public book and source-novel metadata.", ["trends.read"], "existing", "available"),
  provider("openverse", "Openverse", "creation", "Search openly licensed image and audio references.", ["assets.search", "assets.import"], "existing", "available", { existingPath: "/research/assets" }),
  provider("pexels", "Pexels", "creation", "Search photo references with provider attribution.", ["assets.search", "assets.import"], "api-key", "operator-config", { requiredConfigGroups: oauth(["PEXELS_API_KEY"]) }),
  provider("pixabay", "Pixabay", "creation", "Search image references with provider attribution.", ["assets.search", "assets.import"], "api-key", "operator-config", { requiredConfigGroups: oauth(["PIXABAY_API_KEY"]) }),
  provider("poly-haven", "Poly Haven", "creation", "Discover CC0 HDRIs, textures and 3D assets.", ["assets.search", "assets.import"], "protocol", "available", { existingPath: "/research/assets" }),
  provider("fab", "Fab", "creation", "Provider-linked 3D asset discovery with license snapshots.", ["assets.search", "assets.import"], "oauth", "operator-config", { requiredConfigGroups: oauth(["FAB_CLIENT_ID"], ["FAB_CLIENT_SECRET"]) }),
  provider("sketchfab", "Sketchfab", "creation", "Provider-linked 3D discovery and source-preserving import.", ["assets.search", "assets.import"], "oauth", "operator-config", { requiredConfigGroups: oauth(["SKETCHFAB_CLIENT_ID"], ["SKETCHFAB_CLIENT_SECRET"]) }),
  provider("vroid-hub", "VRoid Hub", "creation", "Discover creator-authorized character models and usage conditions.", ["assets.search", "assets.import"], "oauth", "operator-config", { requiredConfigGroups: oauth(["VROID_HUB_CLIENT_ID"], ["VROID_HUB_CLIENT_SECRET"]) }),
  provider("blenderkit", "BlenderKit", "creation", "Discover Blender-ready assets through an explicit user account.", ["assets.search", "assets.import"], "api-key", "operator-config", { requiredConfigGroups: oauth(["BLENDERKIT_API_KEY"]) }),
  provider("patreon", "Patreon", "commerce", "Synchronize supporter tier eligibility without copying unnecessary profile data.", ["identity.read", "membership.read", "webhooks.read"], "oauth", "operator-config", { requiredConfigGroups: oauth(["PATREON_CLIENT_ID"], ["PATREON_CLIENT_SECRET"], ["PATREON_WEBHOOK_SECRET"]) }),
  provider("ko-fi", "Ko-fi", "commerce", "Receive supporter eligibility events and benefit receipts.", ["membership.read", "webhooks.read"], "webhook", "operator-config", { requiredConfigGroups: oauth(["KOFI_WEBHOOK_TOKEN"]) }),
  provider("buy-me-a-coffee", "Buy Me a Coffee", "commerce", "Receive supporter events with minimal retained identity.", ["membership.read", "webhooks.read"], "webhook", "operator-config", { requiredConfigGroups: oauth(["BUYMEACOFFEE_WEBHOOK_SECRET"]) }),
  provider("toss-payments", "Toss Payments", "commerce", "Test-first domestic checkout confirmation with live kill switches.", ["payments.write"], "existing", "available", { existingPath: "/production", requiredConfigGroups: oauth(["TOSS_PAYMENTS_SECRET_KEY"]) }),
  provider("portone", "PortOne", "commerce", "Domestic payment orchestration after order and refund ledgers are authoritative.", ["payments.write"], "api-key", "operator-config", { requiredConfigGroups: oauth(["PORTONE_API_SECRET"]) }),
  provider("stripe-connect", "Stripe Connect", "commerce", "Connected-account payments and payouts with reconciliation receipts.", ["payments.write", "payouts.write", "webhooks.read"], "oauth", "operator-config", { requiredConfigGroups: oauth(["STRIPE_SECRET_KEY"], ["STRIPE_WEBHOOK_SECRET"]) }),
  provider("printful", "Printful", "commerce", "Create print-on-demand products from approved artwork.", ["merch.write", "webhooks.read"], "api-key", "operator-config", { requiredConfigGroups: oauth(["PRINTFUL_API_TOKEN"]) }),
  provider("gelato", "Gelato", "commerce", "Create and track print-on-demand fulfillment orders.", ["merch.write", "webhooks.read"], "api-key", "operator-config", { requiredConfigGroups: oauth(["GELATO_API_KEY"]) }),
  provider("developer-api", "Developer REST API", "developer", "Expose scoped public and user-authorized platform capabilities.", ["api.expose", "webhooks.write"], "protocol", "available", { existingPath: "/developers" }),
  provider("mcp", "MCP server", "developer", "Expose reviewed tools with per-operation user approval boundaries.", ["api.expose"], "protocol", "available", { existingPath: "/developers" }),
] as const satisfies readonly IntegrationProviderDefinition[]);

function configured(definition: IntegrationProviderDefinition, env: EnvLike): boolean {
  const groups = definition.requiredConfigGroups ?? [];
  if (groups.length === 0) return definition.activation !== "operator-config";
  return groups.every((group) => group.some((key) => Boolean(env[key]?.trim())));
}

export function resolveIntegrationProviderStatus(
  definition: IntegrationProviderDefinition,
  env: EnvLike,
): IntegrationProviderStatus {
  const isConfigured = configured(definition, env);
  if (definition.activation === "manual-handoff") {
    return { ...definition, configured: true, executable: true, status: "manual", statusReason: "Manual handoff is available without provider credentials." };
  }
  if (definition.activation === "provider-approval") {
    return {
      ...definition,
      configured: isConfigured,
      executable: false,
      status: "approval-required",
      statusReason: definition.approvalNote ?? "Provider approval is required before activation.",
    };
  }
  if (!isConfigured) {
    return { ...definition, configured: false, executable: false, status: "configuration-required", statusReason: "Operator credentials or endpoint configuration are not active." };
  }
  return { ...definition, configured: true, executable: true, status: "ready", statusReason: "The source capability is configured or available without credentials." };
}

export function integrationProviderCatalog(env: EnvLike): readonly IntegrationProviderStatus[] {
  return INTEGRATION_PROVIDER_DEFINITIONS.map((definition) => resolveIntegrationProviderStatus(definition, env));
}

export const INTEGRATION_EVENTS = Object.freeze([
  "project.created",
  "episode.created",
  "episode.approved",
  "review.requested",
  "review.completed",
  "task.assigned",
  "task.overdue",
  "asset.updated",
  "localization.ready",
  "publication.ready",
  "publication.published",
  "payment.completed",
  "license.expiring",
  "member.joined",
] as const);

export const INTEGRATION_ACTIONS = Object.freeze([
  "calendar.create",
  "meeting.create",
  "file.upload",
  "task.upsert",
  "message.send",
  "translation.draft",
  "signature.request",
  "publication.package",
  "publication.publish",
  "feed.generate",
  "webhook.emit",
  "membership.sync",
  "payment.reconcile",
  "merch.create",
] as const);

export const INTEGRATION_RECIPE_TEMPLATES = Object.freeze([
  { id: "episode-approval-delivery", name: "Episode approval delivery", trigger: "episode.approved", actions: ["file.upload", "task.upsert", "message.send"] },
  { id: "review-meeting", name: "Review meeting", trigger: "review.requested", actions: ["calendar.create", "meeting.create", "message.send"] },
  { id: "publication-release", name: "Publication release", trigger: "publication.ready", actions: ["publication.package", "publication.publish", "feed.generate", "message.send"] },
  { id: "localization-review", name: "Localization review", trigger: "localization.ready", actions: ["translation.draft", "task.upsert", "message.send"] },
  { id: "rights-signing", name: "Rights and signature", trigger: "episode.approved", actions: ["signature.request", "file.upload"] },
  { id: "asset-update", name: "External asset update", trigger: "asset.updated", actions: ["task.upsert", "message.send"] },
  { id: "membership-entitlement", name: "Membership entitlement", trigger: "member.joined", actions: ["membership.sync", "webhook.emit"] },
  { id: "payment-reconciliation", name: "Payment reconciliation", trigger: "payment.completed", actions: ["payment.reconcile", "webhook.emit"] },
  { id: "merch-release", name: "Merch release", trigger: "publication.published", actions: ["merch.create", "message.send"] },
  { id: "license-expiry", name: "License expiry warning", trigger: "license.expiring", actions: ["task.upsert", "calendar.create", "message.send"] },
] as const);
