import { BadRequestException, HttpException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";

import {
  APPLICATION_STATUS, COLLABORATION_MODES, COLLABORATION_PAY, COLLABORATION_ROLES,
  COLLABORATION_STATUS, COLLABORATION_TYPES, collaborationCursor, collaborationRecord, collaborationText,
  isCollaborationKey, validateCollaborationApplication, validateCollaborationInput,
} from "../../../../../packages/core/src/collaboration";

import { CollaborationRepository } from "./collaboration.repository";

import type { CollaborationQuery } from "./collaboration.repository";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export function requireCollaborationUser(userId?: string): string {
  if (typeof userId !== "string" || !userId) throw new UnauthorizedException("로그인이 필요해요.");
  return userId;
}
function idOf(value: string): string {
  if (!uuidPattern.test(value)) throw new BadRequestException("올바른 공고·지원서 주소가 아니에요.");
  return value;
}
function versionOf(body: Record<string, unknown>): number {
  if (typeof body.version !== "number" || !Number.isSafeInteger(body.version) || body.version < 1) throw new BadRequestException("수정 버전을 확인해 주세요.");
  return body.version;
}
function filter(map: object, value: unknown, fallback = "all"): string {
  if (value === undefined || value === "") return fallback;
  if (value === "all" || isCollaborationKey(map, value)) return value;
  throw new BadRequestException("검색 조건을 확인해 주세요.");
}
export function parseCollaborationQuery(raw: Record<string, unknown>, userId?: string): CollaborationQuery {
  const view = raw.view === undefined || raw.view === "" ? "all" : raw.view;
  if (view !== "all" && view !== "mine" && view !== "saved" && view !== "applied") throw new BadRequestException("목록 범위를 확인해 주세요.");
  if (view !== "all") requireCollaborationUser(userId);
  if (raw.q !== undefined && (typeof raw.q !== "string" || raw.q.length > 100)) throw new BadRequestException("검색어는 100자 이내로 입력해 주세요.");
  let cursor: CollaborationQuery["cursor"];
  try { cursor = collaborationCursor(raw.cursor); }
  catch { throw new BadRequestException("페이지 주소를 확인해 주세요."); }
  return { view, q: collaborationText(raw.q), cursor, type: filter(COLLABORATION_TYPES, raw.type),
    role: filter(COLLABORATION_ROLES, raw.role), payType: filter(COLLABORATION_PAY, raw.payType),
    workMode: filter(COLLABORATION_MODES, raw.workMode), status: filter(COLLABORATION_STATUS, raw.status, view === "all" ? "open" : "all") };
}
@Injectable()
export class CollaborationService {
  private readonly logger = new Logger("CollaborationService");
  constructor(private readonly repository = new CollaborationRepository()) {}
  private async boundary<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn("Collaboration persistence unavailable; request was not acknowledged as successful.");
      throw new ServiceUnavailableException("구인·의뢰 저장소에 연결하지 못했어요. 등록·지원 완료로 처리되지 않았습니다. 잠시 후 다시 시도해 주세요.");
    }
  }
  async list(raw: Record<string, unknown>, viewerId?: string) {
    const query = parseCollaborationQuery(raw, viewerId);
    return this.boundary(async () => {
      const [page, canModerate] = await Promise.all([this.repository.list(query, viewerId), this.repository.isModerator(viewerId)]);
      return { ...page, canModerate };
    });
  }
  async detail(id: string, viewerId?: string) {
    idOf(id);
    return this.boundary(async () => {
      const canModerate = await this.repository.isModerator(viewerId);
      const post = await this.repository.get(id, viewerId, canModerate);
      const application = await this.repository.ownApplication(id, viewerId);
      return { post, application, canManage: post.author.id === viewerId, canModerate };
    });
  }
  async create(viewerId: string | undefined, input: unknown) {
    const userId = requireCollaborationUser(viewerId);
    const parsed = validateCollaborationInput(input);
    if (parsed.error || !parsed.value) throw new BadRequestException(parsed.error);
    const value = parsed.value;
    return this.boundary(() => this.repository.create(userId, value));
  }
  async update(id: string, viewerId: string | undefined, input: unknown) {
    const userId = requireCollaborationUser(viewerId); idOf(id);
    const version = versionOf(collaborationRecord(input));
    const parsed = validateCollaborationInput(input);
    if (parsed.error || !parsed.value) throw new BadRequestException(parsed.error);
    const value = parsed.value;
    await this.boundary(() => this.repository.update(id, userId, value, version));
    return { ok: true };
  }
  async setStatus(id: string, viewerId: string | undefined, input: unknown) {
    const userId = requireCollaborationUser(viewerId); idOf(id);
    const body = collaborationRecord(input); const version = versionOf(body);
    if (!isCollaborationKey(COLLABORATION_STATUS, body.status)) throw new BadRequestException("모집 상태를 확인해 주세요.");
    const status = body.status;
    await this.boundary(() => this.repository.setStatus(id, userId, status, version)); return { ok: true };
  }
  async remove(id: string, viewerId?: string) {
    const userId = requireCollaborationUser(viewerId); idOf(id);
    await this.boundary(() => this.repository.remove(id, userId)); return { ok: true };
  }
  async apply(id: string, viewerId: string | undefined, input: unknown) {
    const userId = requireCollaborationUser(viewerId); idOf(id);
    const parsed = validateCollaborationApplication(input);
    if (parsed.error || !parsed.value) throw new BadRequestException(parsed.error);
    const value = parsed.value;
    await this.boundary(() => this.repository.apply(id, userId, value)); return { ok: true };
  }
  async applications(id: string, viewerId?: string) {
    const userId = requireCollaborationUser(viewerId); idOf(id);
    return this.boundary(() => this.repository.applications(id, userId));
  }
  async withdraw(id: string, viewerId?: string) {
    const userId = requireCollaborationUser(viewerId); idOf(id);
    await this.boundary(() => this.repository.withdraw(id, userId)); return { ok: true };
  }
  async applicationStatus(id: string, applicationId: string, viewerId: string | undefined, input: unknown) {
    const userId = requireCollaborationUser(viewerId); idOf(id); idOf(applicationId);
    const body = collaborationRecord(input);
    if (!isCollaborationKey(APPLICATION_STATUS, body.status) || body.status === "withdrawn") throw new BadRequestException("지원 처리 상태를 확인해 주세요.");
    const status = body.status;
    await this.boundary(() => this.repository.setApplicationStatus(id, applicationId, userId, status)); return { ok: true };
  }
  async bookmark(id: string, viewerId: string | undefined, input: unknown) {
    const userId = requireCollaborationUser(viewerId); idOf(id);
    const body = collaborationRecord(input);
    if (typeof body.saved !== "boolean") throw new BadRequestException("저장 여부를 확인해 주세요.");
    const saved = body.saved;
    await this.boundary(() => this.repository.bookmark(id, userId, saved)); return { ok: true };
  }
  async report(id: string, viewerId: string | undefined, input: unknown) {
    const userId = requireCollaborationUser(viewerId); idOf(id);
    const reason = collaborationText(collaborationRecord(input).reason);
    if (reason.length < 10 || reason.length > 1000) throw new BadRequestException("신고 사유를 10~1000자로 입력해 주세요.");
    await this.boundary(() => this.repository.report(id, userId, reason)); return { ok: true };
  }
  async reports(viewerId?: string) {
    const userId = requireCollaborationUser(viewerId);
    return this.boundary(() => this.repository.reports(userId));
  }
  async moderate(id: string, viewerId: string | undefined, input: unknown) {
    const userId = requireCollaborationUser(viewerId); idOf(id);
    const body = collaborationRecord(input);
    if (typeof body.hidden !== "boolean") throw new BadRequestException("공개 여부를 확인해 주세요.");
    const hidden = body.hidden;
    await this.boundary(() => this.repository.moderate(id, userId, hidden)); return { ok: true };
  }
}
