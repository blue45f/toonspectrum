import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  addComment,
  bumpViews,
  createWork,
  deleteWork,
  getWork,
  listComments,
  listWorks,
  parseCreatorSort,
  toggleLike,
  updateWork,
} from "../../../../../lib/server/creator";

interface ListQuery {
  titleId?: string | null;
  userId?: string | null;
  sort?: string | null;
  tag?: string | null;
}

@Injectable()
export class CreatorService {
  async listWorks(q: ListQuery, viewerId?: string) {
    return listWorks({
      titleId: q.titleId ?? undefined,
      userId: q.userId ?? undefined,
      sort: parseCreatorSort(q.sort),
      tag: q.tag ?? undefined,
      viewerId: viewerId ?? undefined,
    });
  }

  async getWork(id: string, viewerId?: string) {
    const work = await getWork(id, viewerId);
    if (!work) throw new NotFoundException("작품을 찾을 수 없습니다.");
    // 조회수 증가는 best-effort(소유자/뷰어 구분 없이 1 증가).
    await bumpViews(id);
    return work;
  }

  async createWork(userId: string, body: unknown) {
    try {
      // 페이지/문서가 클 수 있으나 다른 모듈과 동일하게 별도 크기 제한은 두지 않는다.
      return await createWork(userId, (body ?? {}) as Record<string, unknown>);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "작품을 저장할 수 없습니다.");
    }
  }

  async updateWork(userId: string, id: string, body: unknown) {
    try {
      return await updateWork(userId, id, (body ?? {}) as Record<string, unknown>);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "작품을 수정할 수 없습니다.");
    }
  }

  async deleteWork(userId: string, id: string, isAdmin: boolean) {
    try {
      return await deleteWork(userId, id, isAdmin);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "작품을 삭제할 수 없습니다.");
    }
  }

  async toggleLike(userId: string, workId: string) {
    try {
      return await toggleLike(userId, workId);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "좋아요를 처리할 수 없습니다.");
    }
  }

  async listComments(workId: string) {
    return listComments(workId);
  }

  async addComment(userId: string, workId: string, body: unknown) {
    const text = (body as { text?: unknown } | null | undefined)?.text;
    try {
      return await addComment(userId, workId, text);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "댓글을 작성할 수 없습니다.");
    }
  }
}
