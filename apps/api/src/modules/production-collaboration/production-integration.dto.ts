import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { PRODUCTION_GOOGLE_DRIVE_ARTIFACTS } from "./production-integration-artifacts";

const IdentitySchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u);
const MutationIdSchema = z.string().uuid();
const EmailSchema = z.email().max(320);

export const ProductionIntegrationProjectParamsSchema = z.object({
  projectId: IdentitySchema,
}).strict();

export const ProductionIntegrationGoogleStartQuerySchema = z.object({
  redirectPath: z
    .string()
    .max(512)
    .regex(/^\/production(?:\/|$)/u)
    .default("/production"),
}).strict();

export const ProductionIntegrationGoogleCallbackQuerySchema = z.object({
  state: z.string().min(32).max(1024),
  code: z.string().min(1).max(4096).optional(),
  error: z.string().min(1).max(256).optional(),
}).strict().refine(
  (value) => Boolean(value.code) !== Boolean(value.error),
  "Google OAuth callback requires exactly one of code or error",
);export const ProductionIntegrationMutationSchema = z.object({
  mutationId: MutationIdSchema,
}).strict();

export const ProductionGoogleDriveUploadSchema = z.object({
  mutationId: MutationIdSchema,
  artifact: z.enum(PRODUCTION_GOOGLE_DRIVE_ARTIFACTS),
  folderId: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_-]+$/u)
    .optional(),
}).strict();

export const ProductionIntegrationEmailDraftSchema = z.object({
  mutationId: MutationIdSchema,
  to: z.array(EmailSchema).min(1).max(20),
  cc: z.array(EmailSchema).max(20).default([]),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
}).strict();

export const ProductionIntegrationNotificationSchema = z.object({
  mutationId: MutationIdSchema,
  channel: z.enum([
    "web-push",
    "generic-webhook",
    "discord",
    "ntfy",
  ]),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2_000),
  url: z.string().max(2_048).optional(),
}).strict();

export const ProductionPushUnsubscribeSchema = z.object({
  endpoint: z.url().max(4_096).refine(
    (value) => new URL(value).protocol === "https:",
    "Push endpoint must use HTTPS",
  ),
}).strict();

export const ProductionPushSubscriptionSchema = z.object({
  endpoint: z.url().max(4_096).refine(
    (value) => new URL(value).protocol === "https:",
    "Push endpoint must use HTTPS",
  ),
  expirationTime: z.number().int().min(0).nullable().default(null),
  keys: z.object({
    p256dh: z.string().min(32).max(512),
    auth: z.string().min(8).max(256),
  }).strict(),
}).strict();const DocumensoFieldSchema = z.object({
  type: z.enum(["SIGNATURE", "NAME", "DATE", "INITIALS"]),
  page: z.number().int().min(1).max(10_000),
  positionX: z.number().min(0).max(100),
  positionY: z.number().min(0).max(100),
  width: z.number().positive().max(100),
  height: z.number().positive().max(100),
}).strict();

export const ProductionDocumensoEnvelopeMetadataSchema = z.object({
  mutationId: MutationIdSchema,
  title: z.string().trim().min(1).max(200),
  distribute: z.boolean().default(false),
  recipients: z.array(z.object({
    email: EmailSchema,
    name: z.string().trim().min(1).max(120),
    role: z.enum(["SIGNER", "APPROVER", "CC", "VIEWER"]),
    fields: z.array(DocumensoFieldSchema).max(30).default([]),
  }).strict()).min(1).max(20),
}).strict();

export const ProductionTossConfirmSchema = z.object({
  mutationId: MutationIdSchema,
  paymentKey: z.string().trim().min(1).max(200),
  orderId: z
    .string()
    .min(6)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/u),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  invoiceId: IdentitySchema,
}).strict();

export type ProductionDocumensoEnvelopeMetadata = z.infer<
  typeof ProductionDocumensoEnvelopeMetadataSchema
>;export class ProductionIntegrationProjectParamsDto extends createZodDto(
  ProductionIntegrationProjectParamsSchema,
) {}
export class ProductionIntegrationGoogleStartQueryDto extends createZodDto(
  ProductionIntegrationGoogleStartQuerySchema,
) {}
export class ProductionIntegrationGoogleCallbackQueryDto extends createZodDto(
  ProductionIntegrationGoogleCallbackQuerySchema,
) {}
export class ProductionIntegrationMutationDto extends createZodDto(
  ProductionIntegrationMutationSchema,
) {}
export class ProductionGoogleDriveUploadDto extends createZodDto(
  ProductionGoogleDriveUploadSchema,
) {}
export class ProductionIntegrationEmailDraftDto extends createZodDto(
  ProductionIntegrationEmailDraftSchema,
) {}
export class ProductionIntegrationNotificationDto extends createZodDto(
  ProductionIntegrationNotificationSchema,
) {}
export class ProductionPushUnsubscribeDto extends createZodDto(
  ProductionPushUnsubscribeSchema,
) {}
export class ProductionPushSubscriptionDto extends createZodDto(
  ProductionPushSubscriptionSchema,
) {}
export class ProductionTossConfirmDto extends createZodDto(
  ProductionTossConfirmSchema,
) {}

export type ProductionGoogleDriveUpload = z.infer<
  typeof ProductionGoogleDriveUploadSchema
>;
export type ProductionIntegrationEmailDraft = z.infer<
  typeof ProductionIntegrationEmailDraftSchema
>;
export type ProductionIntegrationNotification = z.infer<
  typeof ProductionIntegrationNotificationSchema
>;
export type ProductionPushSubscription = z.infer<
  typeof ProductionPushSubscriptionSchema
>;
export type ProductionTossConfirm = z.infer<
  typeof ProductionTossConfirmSchema
>;
