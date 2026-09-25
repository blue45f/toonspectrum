import { z } from "zod";

import { INTEGRATION_ACTIONS, INTEGRATION_EVENTS } from "./integration-platform.catalog";

export const IntegrationRecipeActionSchema = z.object({
  type: z.enum(INTEGRATION_ACTIONS),
  providerId: z.string().trim().min(1).max(80),
});

export const IntegrationRecipeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  trigger: z.enum(INTEGRATION_EVENTS),
  actions: z.array(IntegrationRecipeActionSchema).min(1).max(16),
});
export type IntegrationRecipeDto = z.infer<typeof IntegrationRecipeSchema>;

export const PublishPackageSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5_000).default(""),
  canonicalUrl: z.string().url().max(2_048),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  channels: z.array(z.string().trim().min(1).max(80)).min(1).max(16),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  contentWarning: z.string().trim().max(500).optional(),
});
export type PublishPackageDto = z.infer<typeof PublishPackageSchema>;

const FeedItemSchema = z.object({
  id: z.string().trim().min(1).max(300),
  url: z.string().url().max(2_048),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(5_000).default(""),
  datePublished: z.string().datetime({ offset: true }),
});

export const FeedPreviewSchema = z.object({
  title: z.string().trim().min(1).max(200),
  homePageUrl: z.string().url().max(2_048),
  feedUrl: z.string().url().max(2_048),
  description: z.string().trim().max(2_000).default(""),
  items: z.array(FeedItemSchema).max(50),
});
export type FeedPreviewDto = z.infer<typeof FeedPreviewSchema>;
