import { z } from "zod";

import { studioReviewTaskReferenceSchema } from "./review-task-reference";

export const STUDIO_REVIEW_VOICE_NOTE_MAX_BYTES = 5 * 1024 * 1024;
export const STUDIO_REVIEW_VOICE_NOTE_MAX_DURATION_MS = 120_000;
export const STUDIO_REVIEW_VOICE_NOTE_DEFAULT_RETENTION_DAYS = 14;

const id = z.string().trim().min(1).max(160);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const at = z.iso.datetime({ offset: true });

export const studioReviewVoiceNoteContentTypeSchema = z.enum([
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
]);

export const studioReviewVoiceNoteSubjectSchema = studioReviewTaskReferenceSchema.shape.subject;

export const studioReviewVoiceNoteCreateSchema = z.object({
  operationId: id,
  noteId: id,
  subject: studioReviewVoiceNoteSubjectSchema,
  title: z.string().trim().min(1).max(160),
  transcript: z.string().trim().min(1).max(4_000),
  durationMs: z.number().int().positive().max(STUDIO_REVIEW_VOICE_NOTE_MAX_DURATION_MS),
  retentionDays: z.number().int().min(1).max(30).default(STUDIO_REVIEW_VOICE_NOTE_DEFAULT_RETENTION_DAYS),
}).strict();

export const studioReviewVoiceNoteSchema = z.object({
  contract: z.literal("studio-review-voice-note-v1"),
  id,
  subject: studioReviewVoiceNoteSubjectSchema,
  authorUserId: id,
  title: z.string().max(160),
  transcript: z.string().max(4_000),
  durationMs: z.number().int().positive().max(STUDIO_REVIEW_VOICE_NOTE_MAX_DURATION_MS),
  contentType: studioReviewVoiceNoteContentTypeSchema,
  byteLength: z.number().int().positive().max(STUDIO_REVIEW_VOICE_NOTE_MAX_BYTES),
  sha256: digest,
  createdAt: at,
  expiresAt: at,
  deletedAt: at.nullable(),
}).strict();

export const studioReviewVoiceNoteViewSchema = z.object({
  note: studioReviewVoiceNoteSchema,
  canDelete: z.boolean(),
}).strict();

export const studioReviewVoiceNoteListSchema = z.object({
  items: z.array(studioReviewVoiceNoteViewSchema).max(100),
}).strict();

export const studioReviewVoiceNoteDeleteSchema = z.object({
  operationId: id,
  expectedSha256: digest,
}).strict();

export const studioReviewVoiceNoteSignedReadSchema = z.object({
  url: z.url({ protocol: /^https$/u }),
  expiresAtEpochMs: z.number().int().positive(),
}).strict();

export type StudioReviewVoiceNoteContentType = z.infer<typeof studioReviewVoiceNoteContentTypeSchema>;
export type StudioReviewVoiceNoteSubject = z.infer<typeof studioReviewVoiceNoteSubjectSchema>;
export type StudioReviewVoiceNoteCreate = z.infer<typeof studioReviewVoiceNoteCreateSchema>;
export type StudioReviewVoiceNote = z.infer<typeof studioReviewVoiceNoteSchema>;
export type StudioReviewVoiceNoteView = z.infer<typeof studioReviewVoiceNoteViewSchema>;
export type StudioReviewVoiceNoteList = z.infer<typeof studioReviewVoiceNoteListSchema>;
export type StudioReviewVoiceNoteDelete = z.infer<typeof studioReviewVoiceNoteDeleteSchema>;
export type StudioReviewVoiceNoteSignedRead = z.infer<typeof studioReviewVoiceNoteSignedReadSchema>;
