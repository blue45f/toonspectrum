import {
  STUDIO_REVIEW_VOICE_NOTE_MAX_BYTES,
  studioReviewVoiceNoteCreateSchema,
  studioReviewVoiceNoteDeleteSchema,
  studioReviewVoiceNoteListSchema,
  studioReviewVoiceNoteSignedReadSchema,
  studioReviewVoiceNoteSubjectSchema,
  studioReviewVoiceNoteViewSchema,
  type StudioReviewVoiceNoteCreate,
  type StudioReviewVoiceNoteDelete,
  type StudioReviewVoiceNoteSubject,
  type StudioReviewVoiceNoteView,
} from "@toonspectrum/studio-project-model/review-voice-note";
import { z } from "zod";
import { api, apiPath } from "@/platform/api";

const base = (workId: string) => `/studio-project-graph/works/${encodeURIComponent(workId)}/review-voice-notes`;
const createdSchema = z.object({ view: studioReviewVoiceNoteViewSchema, replayed: z.boolean() }).strict();
const readSchema = studioReviewVoiceNoteViewSchema.extend({ signedRead: studioReviewVoiceNoteSignedReadSchema }).strict();
const deletedSchema = studioReviewVoiceNoteViewSchema.extend({ replayed: z.boolean() }).strict();

export async function listStudioReviewVoiceNotes(subjectValue: StudioReviewVoiceNoteSubject, signal?: AbortSignal) {
  const subject = studioReviewVoiceNoteSubjectSchema.parse(subjectValue);
  const raw = await api.post<unknown>(`${base(subject.workId)}/query`, { subject }, { signal, retry: 0, cache: "no-store" });
  return studioReviewVoiceNoteListSchema.parse(raw);
}

export async function uploadStudioReviewVoiceNote(inputValue: StudioReviewVoiceNoteCreate, file: Blob, signal?: AbortSignal) {
  const input = studioReviewVoiceNoteCreateSchema.parse(inputValue);
  if (!(file instanceof Blob) || file.size <= 0 || file.size > STUDIO_REVIEW_VOICE_NOTE_MAX_BYTES) throw new Error("studio_review_voice_note_file_invalid");
  const form = new FormData();
  form.set("metadata", JSON.stringify(input));
  form.set("file", file, `review-voice-${input.noteId}.${file.type.includes("ogg") ? "ogg" : file.type.includes("mpeg") ? "mp3" : file.type.includes("mp4") ? "m4a" : file.type.includes("wav") ? "wav" : "webm"}`);
  const raw = await api.raw.post(apiPath(base(input.subject.workId)), { body: form, signal, timeout: 60_000, retry: 0 }).json<unknown>();
  return createdSchema.parse(raw);
}

export async function readStudioReviewVoiceNote(workId: string, noteId: string, signal?: AbortSignal) {
  const raw = await api.post<unknown>(`${base(workId)}/${encodeURIComponent(noteId)}/read`, {}, { signal, retry: 0, cache: "no-store" });
  return readSchema.parse(raw);
}

export async function deleteStudioReviewVoiceNote(workId: string, noteId: string, inputValue: StudioReviewVoiceNoteDelete, signal?: AbortSignal) {
  const input = studioReviewVoiceNoteDeleteSchema.parse(inputValue);
  const raw = await api.post<unknown>(`${base(workId)}/${encodeURIComponent(noteId)}/delete`, input, { signal, retry: 0, cache: "no-store" });
  return deletedSchema.parse(raw);
}

export type { StudioReviewVoiceNoteCreate, StudioReviewVoiceNoteSubject, StudioReviewVoiceNoteView };
