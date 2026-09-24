import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import {
  STUDIO_REVIEW_VOICE_NOTE_MAX_BYTES,
  studioReviewVoiceNoteContentTypeSchema,
  studioReviewVoiceNoteCreateSchema,
  studioReviewVoiceNoteDeleteSchema,
  studioReviewVoiceNoteSubjectSchema,
  type StudioReviewVoiceNoteCreate,
  type StudioReviewVoiceNoteDelete,
  type StudioReviewVoiceNoteSubject,
} from "@toonspectrum/studio-project-model/review-voice-note";
import {
  LocatedPrivateObjectReferenceSchema,
  PrivateSignedReadUrlSchema,
} from "../../infrastructure/private-object-storage/private-object-storage.contract";
import {
  PRIVATE_OBJECT_STORAGE_PORT,
  type PrivateObjectStoragePort,
} from "../../infrastructure/private-object-storage/private-object-storage.port";
import type { StudioWorkAssetUploadFile } from "../creator/studio-work-asset.service";
import {
  StudioReviewVoiceNoteRepository,
  StudioReviewVoiceNoteRepositoryError,
} from "./studio-review-voice-note.repository";

function unavailable(): never {
  throw new ServiceUnavailableException({ code: "studio_review_voice_note_unavailable" });
}

function exactMime(file: StudioWorkAssetUploadFile): string {
  const contentType = file.mimetype.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const parsed = studioReviewVoiceNoteContentTypeSchema.safeParse(contentType);
  if (!parsed.success) throw new UnsupportedMediaTypeException({ code: "studio_review_voice_note_media_type" });
  const bytes = file.buffer;
  const starts = (...expected: number[]) => expected.every((value, index) => bytes[index] === value);
  const ascii = (offset: number, value: string) => [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
  const matched = contentType === "audio/webm" ? starts(0x1a, 0x45, 0xdf, 0xa3)
    : contentType === "audio/ogg" ? ascii(0, "OggS")
      : contentType === "audio/wav" ? ascii(0, "RIFF") && ascii(8, "WAVE")
        : contentType === "audio/mp4" ? bytes.length >= 12 && ascii(4, "ftyp")
          : contentType === "audio/mpeg" ? ascii(0, "ID3") || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
            : false;
  if (!matched) throw new UnsupportedMediaTypeException({ code: "studio_review_voice_note_signature" });
  return parsed.data;
}

@Injectable()
export class StudioReviewVoiceNoteService {
  constructor(
    @Inject(StudioReviewVoiceNoteRepository) readonly repository: StudioReviewVoiceNoteRepository,
    @Optional() @Inject(PRIVATE_OBJECT_STORAGE_PORT) private readonly storage?: PrivateObjectStoragePort,
  ) {}

  private async run<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); }
    catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof StudioReviewVoiceNoteRepositoryError) {
        if (error.code === "forbidden") throw new ForbiddenException({ code: "studio_review_voice_note_forbidden" });
        if (error.code === "not-found") throw new NotFoundException({ code: "studio_review_voice_note_not_found" });
        if (["idempotency", "conflict"].includes(error.code)) throw new ConflictException({ code: `studio_review_voice_note_${error.code}` });
        if (error.code === "invalid-source") throw new BadRequestException({ code: "studio_review_voice_note_invalid_source" });
      }
      throw new ServiceUnavailableException({ code: "studio_review_voice_note_unavailable" });
    }
  }

  private requireStorage(): PrivateObjectStoragePort {
    if (!this.storage) return unavailable();
    return this.storage;
  }

  async create(actor: string, workId: string, raw: StudioReviewVoiceNoteCreate, file: StudioWorkAssetUploadFile | undefined) {
    const input = studioReviewVoiceNoteCreateSchema.parse(raw);
    if (!file || !Buffer.isBuffer(file.buffer) || file.size !== file.buffer.byteLength || file.size <= 0) {
      throw new BadRequestException({ code: "studio_review_voice_note_file_required" });
    }
    if (file.size > STUDIO_REVIEW_VOICE_NOTE_MAX_BYTES) {
      throw new PayloadTooLargeException({ code: "studio_review_voice_note_too_large" });
    }
    const contentType = exactMime(file);
    await this.run(() => this.repository.authorizeCreate(actor, workId, input.subject));
    const storage = this.requireStorage();
    await this.run(() => storage.verifyPrivatePurposeBuckets({}, ["derived"]));
    const bytes = Uint8Array.from(file.buffer);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const object = LocatedPrivateObjectReferenceSchema.parse(await this.run(() => storage.uploadImmutable({
      purpose: "derived",
      contentType,
      bytes,
      controlMetadata: {
        documentId: workId,
        operationId: input.operationId,
        labels: { kind: "review-voice-note", reviewId: input.subject.reviewId, revisionId: input.subject.revisionId },
      },
    })));
    try {
      return await this.run(() => this.repository.create(actor, workId, input, {
        contentType, byteLength: file.size, sha256, object,
      }));
    } catch (error) {
      const referenced = await this.repository.objectReferenced(object).catch(() => true);
      if (!referenced) await storage.deleteGeneratedObject({ object }).catch(() => undefined);
      throw error;
    }
  }

  list(actor: string, workId: string, subjectValue: StudioReviewVoiceNoteSubject) {
    const subject = studioReviewVoiceNoteSubjectSchema.parse(subjectValue);
    return this.run(async () => {
      await this.pruneExpired();
      return this.repository.list(actor, workId, subject);
    });
  }

  async signedRead(actor: string, workId: string, noteId: string) {
    const storage = this.requireStorage();
    return this.run(async () => {
      const first = await this.repository.read(actor, workId, noteId);
      const signed = PrivateSignedReadUrlSchema.parse(await storage.createSignedReadUrl({ object: first.object, expiresInSeconds: 300 }));
      const current = await this.repository.read(actor, workId, noteId);
      if (current.view.note.sha256 !== first.view.note.sha256 || JSON.stringify(current.object) !== JSON.stringify(first.object)) {
        throw new ConflictException({ code: "studio_review_voice_note_changed_during_read" });
      }
      return { ...current.view, signedRead: signed };
    });
  }

  async delete(actor: string, workId: string, noteId: string, raw: StudioReviewVoiceNoteDelete) {
    const input = studioReviewVoiceNoteDeleteSchema.parse(raw);
    const storage = this.requireStorage();
    return this.run(async () => {
      const result = await this.repository.delete(actor, workId, noteId, input);
      if (result.deleteObject) await storage.deleteGeneratedObject({ object: result.object });
      return { ...result.view, replayed: result.replayed };
    });
  }

  async pruneExpired(): Promise<void> {
    if (!this.storage) return;
    const candidates = await this.repository.claimExpired(20).catch(() => []);
    for (const candidate of candidates) {
      if (candidate.deleteObject) await this.storage.deleteGeneratedObject({ object: candidate.object }).catch(() => undefined);
    }
  }
}
