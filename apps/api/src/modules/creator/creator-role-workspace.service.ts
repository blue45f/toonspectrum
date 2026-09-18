import {
  ConflictException,
  Injectable,
} from "@nestjs/common";

import {
  normalizeCreatorRoleWorkspacePreference,
  type CreatorRoleWorkspacePreference,
} from "../../../../web/src/shared/lib/creator-role-workspace-contract";
import type {
  BatchCreatorRoleProfilesDto,
  CreatorRoleDirectoryQueryDto,
} from "./creator-role-workspace.dto";
import {
  CreatorRoleWorkspaceRepository,
  type CreatorRoleWorkspaceRecord,
} from "./creator-role-workspace.repository";

@Injectable()
export class CreatorRoleWorkspaceService {
  constructor(
    private readonly repository: CreatorRoleWorkspaceRepository,
  ) {}

  async getWorkspace(
    userId: string,
    projectKey: string,
  ): Promise<CreatorRoleWorkspaceRecord> {
    return this.repository.get(userId, projectKey);
  }

  async saveWorkspace(
    userId: string,
    projectKey: string,
    baseRevision: number,
    document: CreatorRoleWorkspacePreference,
  ): Promise<CreatorRoleWorkspaceRecord> {
    const saved = await this.repository.save(
      userId,
      projectKey,
      baseRevision,
      normalizeCreatorRoleWorkspacePreference(document),
    );
    if (saved) return saved;
    const latest = await this.repository.get(userId, projectKey);
    throw new ConflictException({
      message: "다른 화면에서 직무 작업 설정이 먼저 변경되었습니다.",
      latest,
    });
  }

  async batchProfiles(
    _userId: string,
    input: BatchCreatorRoleProfilesDto,
  ) {
    const items = await this.repository.batchPublicProfiles(input.userIds);
    return { items };
  }

  async directory(query: CreatorRoleDirectoryQueryDto) {
    return this.repository.directory({
      role: query.role,
      specialty: query.specialty,
      collaborationStatus: query.collaborationStatus,
      q: query.q,
      limit: query.limit,
      offset: query.offset,
    });
  }
}
