import { BadRequestException, Injectable } from "@nestjs/common";
import {
  createFeedbackPost,
  createFeedbackReply,
  isOfficialUser,
  listFeedbackPosts,
  listFeedbackReplies,
  parseFeedbackCategoryFilter,
  parseFeedbackSort,
  parseFeedbackStatusFilter,
  validateFeedbackPost,
  validateFeedbackReply,
} from "../../../../../lib/server/feedback";

interface ListQuery {
  category?: string | null;
  status?: string | null;
  q?: string | null;
  tag?: string | null;
  sort?: string | null;
  cursor?: string | null;
  limit?: number | string | null;
}

@Injectable()
export class FeedbackService {
  async listPosts(q: ListQuery) {
    return listFeedbackPosts({
      category: parseFeedbackCategoryFilter(q.category),
      status: parseFeedbackStatusFilter(q.status),
      query: q.q ?? undefined,
      tag: q.tag ?? undefined,
      sort: parseFeedbackSort(q.sort),
      cursor: q.cursor ?? null,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  }

  async createPost(userId: string, body: unknown) {
    const parsed = validateFeedbackPost(body);
    if (parsed.error || !parsed.value) throw new BadRequestException(parsed.error ?? "잘못된 입력입니다.");
    return createFeedbackPost(userId, parsed.value);
  }

  async listReplies(postId: string) {
    return listFeedbackReplies(postId);
  }

  async createReply(postId: string, userId: string, body: unknown) {
    const parsed = validateFeedbackReply(body);
    if (parsed.error || !parsed.text) throw new BadRequestException(parsed.error ?? "잘못된 입력입니다.");
    const isOfficial = await isOfficialUser(userId);
    try {
      return await createFeedbackReply({
        postId,
        parentId: parsed.parentId ?? null,
        userId,
        text: parsed.text,
        isOfficial,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "답변을 작성할 수 없습니다.");
    }
  }
}
