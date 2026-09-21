import { sendProtectedWebhook } from "./production-webhook-network";
import webPush from "web-push";

import {
  canonicalJson,
  sha256Digest,
} from "./production-integration-artifacts";
import type {
  ProductionIntegrationConfig,
} from "./production-integration-config";
import {
  externalFetchJson,
  webhookSignature,
} from "./production-integration-http";
import type {
  ProductionPushSubscriptionRecord,
} from "./production-integration.repository";
import type {
  ProductionIntegrationNotification,
} from "./production-integration.dto";

export interface ProductionNotificationProviderResult {
  readonly sent: number;
  readonly removedEndpointHashes: readonly string[];
  readonly providerResponse: Record<string, unknown>;
}

async function sendGenericWebhook(
  config: ProductionIntegrationConfig,
  body: Record<string, unknown>,
  deliveryId: string,
  post: typeof sendProtectedWebhook,
): Promise<ProductionNotificationProviderResult> {
  const url = config.notification.genericWebhookUrl;
  const secret = config.notification.genericWebhookSecret;
  if (!url || !secret) throw new Error("generic_webhook_not_configured");
  const serialized = canonicalJson(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const response = await post(url, {
    "Content-Type": "application/json",
    "X-ToonSpectrum-Signature": webhookSignature(secret, serialized),
    "X-ToonSpectrum-Delivery-Id": deliveryId,
    "X-ToonSpectrum-Delivery-Timestamp": timestamp,
    "X-ToonSpectrum-Delivery-Signature": webhookSignature(secret, `${timestamp}\n${deliveryId}\n${serialized}`),
  }, serialized, config.timeoutMs);
  return { sent: 1, removedEndpointHashes: [], providerResponse: response ?? {} };
}
async function sendDiscord(
  config: ProductionIntegrationConfig,
  notification: ProductionIntegrationNotification,
): Promise<ProductionNotificationProviderResult> {
  const url = config.notification.discordWebhookUrl;
  if (!url) throw new Error("discord_webhook_not_configured");
  const response = await externalFetchJson<Record<string, unknown>>(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `**${notification.title}**\n${notification.body}`.slice(0, 2_000),
        allowed_mentions: { parse: [] },
        embeds: notification.url
          ? [{ title: "ToonSpectrum에서 열기", url: notification.url }]
          : [],
      }),
    },
    config.timeoutMs,
  );
  return { sent: 1, removedEndpointHashes: [], providerResponse: response ?? {} };
}

async function sendNtfy(
  config: ProductionIntegrationConfig,
  notification: ProductionIntegrationNotification,
): Promise<ProductionNotificationProviderResult> {
  const baseUrl = config.notification.ntfyBaseUrl;
  const topic = config.notification.ntfyTopic;
  if (!baseUrl || !topic) throw new Error("ntfy_not_configured");
  const headers: Record<string, string> = {
    Title: notification.title,
    Priority: "default",
    Tags: "art,calendar",
  };
  if (notification.url) headers.Click = notification.url;
  if (config.notification.ntfyToken) {
    headers.Authorization = `Bearer ${config.notification.ntfyToken}`;
  }
  const response = await externalFetchJson<Record<string, unknown>>(
    `${baseUrl}/${encodeURIComponent(topic)}`,
    { method: "POST", headers, body: notification.body },
    config.timeoutMs,
  );
  return { sent: 1, removedEndpointHashes: [], providerResponse: response ?? {} };
}
async function sendWebPush(
  config: ProductionIntegrationConfig,
  notification: ProductionIntegrationNotification,
  subscriptions: readonly ProductionPushSubscriptionRecord[],
): Promise<ProductionNotificationProviderResult> {
  const subject = config.notification.vapidSubject;
  const publicKey = config.notification.vapidPublicKey;
  const privateKey = config.notification.vapidPrivateKey;
  if (!subject || !publicKey || !privateKey) {
    throw new Error("web_push_not_configured");
  }
  webPush.setVapidDetails(subject, publicKey, privateKey);
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    url: notification.url ?? "/production",
    tag: "toonspectrum-production",
  });
  const results = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload,
        { TTL: 24 * 60 * 60, urgency: "normal" },
      );
      return subscription.endpointHash;
    }),
  );
  const removedEndpointHashes: string[] = [];
  let sent = 0;
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const subscription = subscriptions[index];
    if (!result || !subscription) continue;
    if (result.status === "fulfilled") {
      sent += 1;
      continue;
    }
    const statusCode = typeof result.reason === "object"
      && result.reason !== null
      && "statusCode" in result.reason
      ? Number(result.reason.statusCode)
      : null;
    if (statusCode === 404 || statusCode === 410) {
      removedEndpointHashes.push(subscription.endpointHash);
    }
  }
  return {
    sent,
    removedEndpointHashes,
    providerResponse: {
      attempted: subscriptions.length,
      sent,
      expired: removedEndpointHashes.length,
    },
  };
}
export async function sendProductionNotification(input: {
  readonly config: ProductionIntegrationConfig;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly notification: ProductionIntegrationNotification;
  readonly subscriptions: readonly ProductionPushSubscriptionRecord[];
}, dependencies: { readonly webhookPost: typeof sendProtectedWebhook } = { webhookPost: sendProtectedWebhook }): Promise<ProductionNotificationProviderResult> {
  const body = {
    version: 1,
    type: "production.notification",
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    title: input.notification.title,
    body: input.notification.body,
    url: input.notification.url ?? null,
    emittedAt: new Date().toISOString(),
  };
  switch (input.notification.channel) {
    case "generic-webhook":
      return sendGenericWebhook(input.config, body, sha256Digest(canonicalJson([input.projectId, input.notification.mutationId])), dependencies.webhookPost);
    case "discord":
      return sendDiscord(input.config, input.notification);
    case "ntfy":
      return sendNtfy(input.config, input.notification);
    case "web-push":
      return sendWebPush(
        input.config,
        input.notification,
        input.subscriptions,
      );
  }
}
