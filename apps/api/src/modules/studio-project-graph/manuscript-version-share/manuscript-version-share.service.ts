import {
  GoneException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  ManuscriptVersionShareRepository,
  type CreateManuscriptSnapshotInput,
  type CreateManuscriptVersionShareInput,
  type ManuscriptSnapshotRecord,
  type ManuscriptVersionShareRecord,
  type VersionShareResolution,
} from "./manuscript-version-share.repository";

/**
 * CT-1 서비스: 저장소의 해석 결과를 HTTP 의미로 변환한다.
 * 링크 상태(없음·회수·만료·비밀번호)는 클라이언트 페이지가 상태별로 안내할 수 있게
 * 안정적인 code를 함께 내려준다.
 */
@Injectable()
export class ManuscriptVersionShareService {
  constructor(
    @Inject(ManuscriptVersionShareRepository)
    private readonly repository: ManuscriptVersionShareRepository,
  ) {}

  listSnapshots(
    actorUserId: string,
    artifactId: string,
  ): Promise<readonly ManuscriptSnapshotRecord[]> {
    return this.repository.listSnapshots(actorUserId, artifactId);
  }

  createSnapshot(
    actorUserId: string,
    artifactId: string,
    input: CreateManuscriptSnapshotInput,
  ): Promise<ManuscriptSnapshotRecord> {
    return this.repository.createSnapshot(actorUserId, artifactId, input);
  }

  updateSnapshotMemo(
    actorUserId: string,
    artifactId: string,
    snapshotId: string,
    memo: string,
  ): Promise<ManuscriptSnapshotRecord> {
    return this.repository.updateSnapshotMemo(actorUserId, artifactId, snapshotId, memo);
  }

  listShares(
    actorUserId: string,
    artifactId: string,
  ): Promise<readonly ManuscriptVersionShareRecord[]> {
    return this.repository.listShares(actorUserId, artifactId);
  }

  createShare(
    actorUserId: string,
    artifactId: string,
    input: CreateManuscriptVersionShareInput,
  ): Promise<ManuscriptVersionShareRecord> {
    return this.repository.createShare(actorUserId, artifactId, input);
  }

  revokeShare(
    actorUserId: string,
    artifactId: string,
    linkId: string,
  ): Promise<ManuscriptVersionShareRecord> {
    return this.repository.revokeShare(actorUserId, artifactId, linkId);
  }

  async resolveShare(
    token: string,
    password?: string,
  ): Promise<Extract<VersionShareResolution, { kind: "ok" }>> {
    const resolution = await this.repository.resolveShare(token, password);
    switch (resolution.kind) {
      case "ok":
        return resolution;
      case "missing":
        throw new NotFoundException({
          code: "version_share_not_found",
          message: "공유 링크를 찾을 수 없어요.",
        });
      case "revoked":
        throw new GoneException({
          code: "version_share_revoked",
          message: "회수된 공유 링크예요. 공유한 사람에게 새 링크를 요청해 주세요.",
        });
      case "expired":
        throw new GoneException({
          code: "version_share_expired",
          message: "만료된 공유 링크예요. 공유한 사람에게 새 링크를 요청해 주세요.",
        });
      case "password_required":
        throw new HttpException(
          {
            code: "version_share_password_required",
            message: "이 링크는 비밀번호가 필요해요.",
          },
          401,
        );
      case "password_invalid":
        throw new HttpException(
          {
            code: "version_share_password_invalid",
            message: "비밀번호가 맞지 않아요.",
          },
          401,
        );
    }
  }
}
