import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";

import {
  STUDIO_VIRTUAL_DISTRICT_IDS,
  emptyStudioVirtualDecorationState,
  validateStudioVirtualDecorationSave,
  type StudioVirtualDecorationStateDto,
  type StudioVirtualDistrictId,
} from "@toonstudio/contracts/studio-virtual-space-placement-contract";

import { db, studioVirtualSpaceDecorationLayouts, users } from "../../platform/database";

function isDistrict(value: string): value is StudioVirtualDistrictId {
  return (STUDIO_VIRTUAL_DISTRICT_IDS as readonly string[]).includes(value);
}

@Injectable()
export class StudioVirtualSpaceDecorationService {
  /**
   * 유저、活动한 계정만 배치를 소유한다. 계정이 없는 id로 행을 만들면 정리할 수 없는
   * 쓰레기 행이 남으므로 여기서 막는다.
   */
  private async requireActiveUser(userId: string | undefined): Promise<string> {
    const id = userId?.trim();
    if (!id) throw new ForbiddenException("로그인이 필요합니다.");

    const [row] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!row) throw new ForbiddenException("로그인이 필요합니다.");
    if (row.status !== "active") throw new ForbiddenException("사용할 수 없는 계정입니다.");
    return id;
  }

  async getState(userId: string | undefined, districtKey: string): Promise<StudioVirtualDecorationStateDto> {
    const owner = await this.requireActiveUser(userId);
    if (!isDistrict(districtKey)) throw new NotFoundException("알 수 없는 장소입니다.");

    const [row] = await db
      .select()
      .from(studioVirtualSpaceDecorationLayouts)
      .where(
        and(
          eq(studioVirtualSpaceDecorationLayouts.userId, owner),
          eq(studioVirtualSpaceDecorationLayouts.districtKey, districtKey),
        ),
      )
      .limit(1);

    if (!row) return emptyStudioVirtualDecorationState(districtKey);

    return {
      districtKey: row.districtKey as StudioVirtualDistrictId,
      presetKey: row.presetKey as StudioVirtualDecorationStateDto["presetKey"],
      presentationMode: row.presentationMode as StudioVirtualDecorationStateDto["presentationMode"],
      placements: row.placements as StudioVirtualDecorationStateDto["placements"],
      revision: row.revision,
      layoutWidth: row.layoutWidth,
      layoutHeight: row.layoutHeight,
    };
  }

  /**
   * 낙관적 동시성: expectedRevision이 현재 revision과 다르면 덮어쓰지 않는다.
   *
   * 충돌 판정은 rowCount가 아니라 RETURNING으로 받은 행 유무로 한다. INSERT는
   * onConflictDoNothing이라 이미 있으면 0행이 돌아오고, UPDATE는 기대했던
   * revision에 닿았을 때만 1행이 돌아온다. 어느 쪽이든 0행이면 다른 기기가 먼저
   * 쓴 것이다.
   */
  async save(
    userId: string | undefined,
    districtKey: string,
    body: unknown,
  ): Promise<StudioVirtualDecorationStateDto> {
    const owner = await this.requireActiveUser(userId);
    if (!isDistrict(districtKey)) throw new NotFoundException("알 수 없는 장소입니다.");

    const parsed = validateStudioVirtualDecorationSave(body);
    if (!parsed.ok) throw new ConflictException(parsed.error);
    if (parsed.value.districtKey !== districtKey) {
      throw new ConflictException("요청 경로와 본문의 장소가 다릅니다.");
    }

    const { expectedRevision, placements, ...rest } = parsed.value;
    const nextRevision = expectedRevision + 1;

    if (expectedRevision === 0) {
      const inserted = await db
        .insert(studioVirtualSpaceDecorationLayouts)
        .values({
          userId: owner,
          districtKey,
          presetKey: rest.presetKey,
          presentationMode: rest.presentationMode,
          placements: [...placements],
          revision: 1,
          layoutWidth: rest.layoutWidth,
          layoutHeight: rest.layoutHeight,
        })
        .onConflictDoNothing()
        .returning({ revision: studioVirtualSpaceDecorationLayouts.revision });

      if (inserted.length < 1) {
        throw new ConflictException("다른 기기가 먼저 저장했습니다.");
      }
      return { ...rest, districtKey, placements, revision: 1 };
    }

    const updated = await db
      .update(studioVirtualSpaceDecorationLayouts)
      .set({
        presetKey: rest.presetKey,
        presentationMode: rest.presentationMode,
        placements: [...placements],
        revision: nextRevision,
        layoutWidth: rest.layoutWidth,
        layoutHeight: rest.layoutHeight,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(studioVirtualSpaceDecorationLayouts.userId, owner),
          eq(studioVirtualSpaceDecorationLayouts.districtKey, districtKey),
          eq(studioVirtualSpaceDecorationLayouts.revision, expectedRevision),
        ),
      )
      .returning({ revision: studioVirtualSpaceDecorationLayouts.revision });

    if (updated.length < 1) {
      const current = await this.getState(owner, districtKey);
      throw new ConflictException({
        message: "다른 기기가 먼저 저장했습니다.",
        current,
      });
    }

    return { ...rest, districtKey, placements, revision: nextRevision };
  }

  /** 승인된 배치 개수만 세는 집계. 운영 지표에서 쓰인다. */
  async countPlaced(): Promise<{ placements: number }> {
    const [row] = await db
      .select({ placements: sql<number>`coalesce(sum(jsonb_array_length(${studioVirtualSpaceDecorationLayouts.placements})), 0)` })
      .from(studioVirtualSpaceDecorationLayouts);
    return { placements: Number(row?.placements ?? 0) };
  }
}
