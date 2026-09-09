import { createHash } from "node:crypto";

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  comicDirectorId,
  comicDirectorInteger,
  parseCreateStudioAiComicArtifactInput,
  parseCreateStudioAiComicApprovalInput,
  parseCreateStudioAiComicDirectorSessionInput,
  parseCreateStudioAiComicJobInput,
  parseCreateStudioAiVisualBibleRevisionInput,
  parseUpdateStudioAiComicDirectorSessionInput,
  parseUpdateStudioAiComicJobInput,
} from "./studio-ai-comic-director.contract";
import {
  STUDIO_AI_COMIC_DIRECTOR_REPOSITORY,
  type StudioAiComicDirectorRepository,
} from "./studio-ai-comic-director.repository";

function stableSerialize(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    .join(",")}}`;
}

export function studioAiComicDirectorDigest(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value), "utf8").digest("hex");
}

@Injectable()
export class StudioAiComicDirectorService {
  constructor(
    @Inject(STUDIO_AI_COMIC_DIRECTOR_REPOSITORY)
    private readonly repository: StudioAiComicDirectorRepository,
  ) {}

  listSessions(userId: string, rawLimit: unknown) {
    const limit = rawLimit === undefined
      ? 20
      : comicDirectorInteger(Number(rawLimit), "limit", 1, 100);
    return this.repository.listSessions(userId, limit);
  }

  createSession(userId: string, body: unknown) {
    return this.repository.createSession(
      userId,
      parseCreateStudioAiComicDirectorSessionInput(body),
    );
  }

  async getSessionBundle(userId: string, rawSessionId: unknown) {
    const sessionId = comicDirectorId(rawSessionId, "sessionId");
    const session = await this.repository.getSession(userId, sessionId);
    if (!session) throw new NotFoundException("AI 코믹 디렉터 세션을 찾을 수 없어요.");
    const [visualBibleRevisions, jobs, artifacts, approval] = await Promise.all([
      this.repository.listVisualBibleRevisions(userId, sessionId),
      this.repository.listJobs(userId, sessionId),
      this.repository.listArtifacts(userId, sessionId),
      this.repository.currentApproval(userId, sessionId),
    ]);
    return {
      session,
      visualBibleRevisions,
      jobs,
      artifacts,
      approval,
    };
  }

  async updateSession(userId: string, rawSessionId: unknown, body: unknown) {
    const sessionId = comicDirectorId(rawSessionId, "sessionId");
    const input = parseUpdateStudioAiComicDirectorSessionInput(body);
    const updated = await this.repository.updateSession(userId, sessionId, input);
    if (updated) return updated;
    const current = await this.repository.getSession(userId, sessionId);
    if (!current) throw new NotFoundException("AI 코믹 디렉터 세션을 찾을 수 없어요.");
    throw new ConflictException({
      message: "세션이 다른 화면에서 변경됐어요. 최신 버전을 다시 불러와 주세요.",
      currentRevision: current.revision,
      currentSession: current,
    });
  }

  async appendVisualBibleRevision(
    userId: string,
    rawSessionId: unknown,
    body: unknown,
  ) {
    const sessionId = comicDirectorId(rawSessionId, "sessionId");
    const input = parseCreateStudioAiVisualBibleRevisionInput(body);
    const revision = await this.repository.appendVisualBibleRevision(
      userId,
      sessionId,
      studioAiComicDirectorDigest(input.payload),
      input,
    );
    if (!revision) throw new NotFoundException("AI 코믹 디렉터 세션을 찾을 수 없어요.");
    return revision;
  }

  async listVisualBibleRevisions(userId: string, rawSessionId: unknown) {
    const sessionId = comicDirectorId(rawSessionId, "sessionId");
    const session = await this.repository.getSession(userId, sessionId);
    if (!session) throw new NotFoundException("AI 코믹 디렉터 세션을 찾을 수 없어요.");
    return this.repository.listVisualBibleRevisions(userId, sessionId);
  }

  async createJob(userId: string, rawSessionId: unknown, body: unknown) {
    const sessionId = comicDirectorId(rawSessionId, "sessionId");
    const job = await this.repository.createJob(
      userId,
      sessionId,
      parseCreateStudioAiComicJobInput(body),
    );
    if (!job) throw new NotFoundException("AI 코믹 디렉터 세션을 찾을 수 없어요.");
    return job;
  }

  async updateJob(
    userId: string,
    rawSessionId: unknown,
    rawJobId: unknown,
    body: unknown,
  ) {
    const sessionId = comicDirectorId(rawSessionId, "sessionId");
    const jobId = comicDirectorId(rawJobId, "jobId");
    const input = parseUpdateStudioAiComicJobInput(body);
    if (
      input.progressDone !== undefined
      && input.progressTotal !== undefined
      && input.progressDone > input.progressTotal
    ) {
      throw new ConflictException("완료 작업 수는 전체 작업 수보다 클 수 없어요.");
    }
    const job = await this.repository.updateJob(userId, sessionId, jobId, input);
    if (!job) throw new NotFoundException("AI 코믹 디렉터 작업을 찾을 수 없어요.");
    return job;
  }

  async listJobs(userId: string, rawSessionId: unknown) {
    const sessionId = comicDirectorId(rawSessionId, "sessionId");
    const session = await this.repository.getSession(userId, sessionId);
    if (!session) throw new NotFoundException("AI 코믹 디렉터 세션을 찾을 수 없어요.");
    return this.repository.listJobs(userId, sessionId);
  }

  async listJobEvents(
    userId: string,
    rawSessionId: unknown,
    rawAfterSequence: unknown,
  ) {
    const sessionId = comicDirectorId(rawSessionId, "sessionId");
    const afterSequence = rawAfterSequence === undefined
      ? 0
      : comicDirectorInteger(Number(rawAfterSequence), "after", 0, 2_147_483_647);
    const session = await this.repository.getSession(userId, sessionId);
    if (!session) throw new NotFoundException("AI 코믹 디렉터 세션을 찾을 수 없어요.");
    return this.repository.listJobEvents(userId, sessionId, afterSequence);
  }

  async createArtifact(userId: string, rawSessionId: unknown, body: unknown) {
    const sessionId = comicDirectorId(rawSessionId, "sessionId");
    const artifact = await this.repository.createArtifact(
      userId,
      sessionId,
      parseCreateStudioAiComicArtifactInput(body),
    );
    if (!artifact) throw new NotFoundException("AI 코믹 디렉터 세션을 찾을 수 없어요.");
    return artifact;
  }

  async listArtifacts(userId: string, rawSessionId: unknown) {
    const sessionId = comicDirectorId(rawSessionId, "sessionId");
    const session = await this.repository.getSession(userId, sessionId);
    if (!session) throw new NotFoundException("AI 코믹 디렉터 세션을 찾을 수 없어요.");
    return this.repository.listArtifacts(userId, sessionId);
  }

  async createApproval(userId: string, rawSessionId: unknown, body: unknown) {
    const sessionId = comicDirectorId(rawSessionId, "sessionId");
    const input = parseCreateStudioAiComicApprovalInput(body);
    const approval = await this.repository.createApproval(userId, sessionId, input);
    if (approval) return approval;
    const current = await this.repository.getSession(userId, sessionId);
    if (!current) throw new NotFoundException("AI 코믹 디렉터 세션을 찾을 수 없어요.");
    throw new ConflictException({
      message: "검수 기준이 바뀌었어요. 최신 후보와 원고 차이를 다시 확인해 주세요.",
      currentRevision: current.revision,
    });
  }

  async currentApproval(userId: string, rawSessionId: unknown) {
    const sessionId = comicDirectorId(rawSessionId, "sessionId");
    const session = await this.repository.getSession(userId, sessionId);
    if (!session) throw new NotFoundException("AI 코믹 디렉터 세션을 찾을 수 없어요.");
    return this.repository.currentApproval(userId, sessionId);
  }
}
