import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";

import {
  INTEGRATION_ACTIONS,
  INTEGRATION_EVENTS,
  INTEGRATION_PROVIDER_DEFINITIONS,
  INTEGRATION_RECIPE_TEMPLATES,
  integrationProviderCatalog,
  type IntegrationCapability,
  type IntegrationProviderStatus,
} from "./integration-platform.catalog";
import type {
  FeedPreviewDto,
  IntegrationRecipeDto,
  PublishPackageDto,
} from "./integration-platform.dto";

type EnvLike = Record<string, string | undefined>;

const ACTION_CAPABILITY: Readonly<Record<(typeof INTEGRATION_ACTIONS)[number], IntegrationCapability>> = {
  "calendar.create": "calendar.write",
  "meeting.create": "meetings.write",
  "file.upload": "files.write",
  "task.upsert": "tasks.write",
  "message.send": "messages.write",
  "translation.draft": "translate",
  "signature.request": "sign.write",
  "publication.package": "publish.manual",
  "publication.publish": "publish.write",
  "feed.generate": "feeds.write",
  "webhook.emit": "webhooks.write",
  "membership.sync": "membership.read",
  "payment.reconcile": "payments.write",
  "merch.create": "merch.write",
};

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

@Injectable()
export class IntegrationPlatformService {
  catalog(env: EnvLike = process.env) {
    return {
      generatedAt: new Date().toISOString(),
      providers: integrationProviderCatalog(env),
      categories: [
        "storage",
        "work-management",
        "communication",
        "creation",
        "publishing",
        "trust",
        "data",
        "commerce",
        "developer",
      ],
    };
  }

  recipes() {
    return {
      events: INTEGRATION_EVENTS,
      actions: INTEGRATION_ACTIONS,
      templates: INTEGRATION_RECIPE_TEMPLATES,
    };
  }

  runtime(env: EnvLike = process.env) {
    const providers = integrationProviderCatalog(env);
    const count = (status: IntegrationProviderStatus["status"]) =>
      providers.filter((provider) => provider.status === status).length;
    return {
      generatedAt: new Date().toISOString(),
      totalProviders: providers.length,
      ready: count("ready"),
      manual: count("manual"),
      configurationRequired: count("configuration-required"),
      approvalRequired: count("approval-required"),
      providers: providers.map(({ id, name, category, status, executable, statusReason }) => ({
        id,
        name,
        category,
        status,
        executable,
        statusReason,
      })),
    };
  }

  validateRecipe(input: IntegrationRecipeDto, env: EnvLike = process.env) {
    const catalog = integrationProviderCatalog(env);
    const byId = new Map(catalog.map((provider) => [provider.id, provider]));
    const errors: string[] = [];
    const warnings: string[] = [];
    const plan = input.actions.map((action, index) => {
      const provider = byId.get(action.providerId);
      const requiredCapability = ACTION_CAPABILITY[action.type];
      if (!provider) {
        errors.push(`Action ${index + 1}: unknown provider ${action.providerId}.`);
        return { ...action, requiredCapability, executable: false };
      }
      if (!provider.capabilities.includes(requiredCapability)) {
        errors.push(`Action ${index + 1}: ${provider.name} does not support ${requiredCapability}.`);
      } else if (!provider.executable) {
        warnings.push(`Action ${index + 1}: ${provider.name} is not active (${provider.status}).`);
      }
      return {
        ...action,
        providerName: provider.name,
        requiredCapability,
        providerStatus: provider.status,
        executable: provider.executable && provider.capabilities.includes(requiredCapability),
      };
    });
    return {
      valid: errors.length === 0,
      executable: errors.length === 0 && plan.every((action) => action.executable),
      errors,
      warnings,
      plan,
      recipeDigest: digest(input),
    };
  }

  buildPublishPackage(input: PublishPackageDto, env: EnvLike = process.env) {
    const catalog = integrationProviderCatalog(env);
    const byId = new Map(catalog.map((provider) => [provider.id, provider]));
    const channels = [...new Set(input.channels)].map((channelId) => {
      const provider = byId.get(channelId);
      if (!provider || provider.category !== "publishing") {
        return {
          id: channelId,
          valid: false,
          executable: false,
          mode: "unsupported" as const,
          reason: "The requested channel is not a registered publishing provider.",
        };
      }
      const manual = provider.capabilities.includes("publish.manual")
        || provider.connectionMode === "manual";
      return {
        id: provider.id,
        name: provider.name,
        valid: true,
        executable: provider.executable,
        mode: manual ? "manual-handoff" as const : "provider-api" as const,
        status: provider.status,
        reason: provider.statusReason,
      };
    });
    const manifest = {
      schema: "toonspectrum.publish-package/1",
      createdAt: new Date().toISOString(),
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      canonicalUrl: input.canonicalUrl,
      scheduledAt: input.scheduledAt ?? null,
      tags: [...new Set(input.tags)],
      contentWarning: input.contentWarning ?? null,
      channels,
    };
    return {
      ...manifest,
      packageDigest: digest(manifest),
      ready: channels.every((channel) => channel.valid),
      directlyExecutable: channels.every((channel) => channel.valid && channel.executable),
      notices: [
        "This package does not store third-party passwords or bypass provider upload controls.",
        "Manual channels require a human confirmation receipt after upload.",
      ],
    };
  }

  buildFeedPreview(input: FeedPreviewDto) {
    const jsonFeed = {
      version: "https://jsonfeed.org/version/1.1",
      title: input.title,
      home_page_url: input.homePageUrl,
      feed_url: input.feedUrl,
      description: input.description,
      items: input.items.map((item) => ({
        id: item.id,
        url: item.url,
        title: item.title,
        content_text: item.summary,
        date_published: item.datePublished,
      })),
    };
    const rssItems = input.items.map((item) => [
      "    <item>",
      `      <guid isPermaLink="false">${xmlEscape(item.id)}</guid>`,
      `      <link>${xmlEscape(item.url)}</link>`,
      `      <title>${xmlEscape(item.title)}</title>`,
      `      <description>${xmlEscape(item.summary)}</description>`,
      `      <pubDate>${new Date(item.datePublished).toUTCString()}</pubDate>`,
      "    </item>",
    ].join("\n")).join("\n");
    const rss = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0">',
      "  <channel>",
      `    <title>${xmlEscape(input.title)}</title>`,
      `    <link>${xmlEscape(input.homePageUrl)}</link>`,
      `    <description>${xmlEscape(input.description)}</description>`,
      `    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${xmlEscape(input.feedUrl)}" rel="self" type="application/rss+xml" />`,
      rssItems,
      "  </channel>",
      "</rss>",
    ].join("\n");
    const activityPub = input.items.map((item) => ({
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Create",
      id: `${item.url}#activity`,
      actor: input.homePageUrl,
      published: item.datePublished,
      object: {
        type: "Article",
        id: item.url,
        url: item.url,
        name: item.title,
        content: item.summary,
      },
    }));
    return { rss, jsonFeed, activityPub, digest: digest({ rss, jsonFeed, activityPub }) };
  }

  developerManifest() {
    return {
      schema: "toonspectrum.integration-developer-manifest/1",
      events: INTEGRATION_EVENTS,
      actions: INTEGRATION_ACTIONS,
      scopes: [
        "catalog.read",
        "profile.read",
        "project.read",
        "project.task.write",
        "review.read",
        "review.write",
        "asset.metadata.read",
        "publication.read",
        "publication.write",
        "automation.write",
      ],
      webhook: {
        signatureHeader: "x-toonspectrum-signature",
        timestampHeader: "x-toonspectrum-timestamp",
        algorithm: "HMAC-SHA256",
        replayWindowSeconds: 300,
        deliveryStates: ["succeeded", "failed", "uncertain"],
      },
      safety: {
        rawProjectFilesRequireSeparateGrant: true,
        providerPasswordsAccepted: false,
        automaticPaidFallback: false,
        idempotencyRequiredForWrites: true,
      },
      providers: INTEGRATION_PROVIDER_DEFINITIONS.length,
    };
  }
}
