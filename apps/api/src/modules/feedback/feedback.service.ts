import { BadRequestException, HttpException, Injectable, UnauthorizedException } from "@nestjs/common";

import {
  feedbackPageLimit, feedbackText, isFeedbackProgress,
} from "../../../../../packages/core/src/feedback";
import {
  createFeedbackPost, createFeedbackReply, FeedbackError, getFeedbackPost, isOfficialUser,
  listFeedbackPosts, listFeedbackReplies, parseFeedbackCategoryFilter, parseFeedbackStatusFilter,
  setFeedbackVote, updateFeedbackProgress, validateFeedbackPost, validateFeedbackReply,
} from "../../server/feedback";

export interface FeedbackListQuery {
  category?: unknown;
  status?: unknown;
  progress?: unknown;
  q?: unknown;
  tag?: unknown;
  cursor?: unknown;
  limit?: unknown;
  mine?: unknown;
}
function stringQuery(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
async function boundary<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof FeedbackError) throw new HttpException(error.message, error.statusCode);
    // Keep database exceptions out of client-facing messages; Nest's default handler logs them.
    throw error;
  }
}
@Injectable()
export class FeedbackService {
  async listPosts(query: FeedbackListQuery, viewerId?: string) {
    const mine = query.mine === "true" || query.mine === true;
    if (mine && !viewerId) throw new UnauthorizedException("내 제보를 보려면 로그인해 주세요.");
    return boundary(async () => {
      const [page, canManage] = await Promise.all([
        listFeedbackPosts({
          category: parseFeedbackCategoryFilter(query.category), status: parseFeedbackStatusFilter(query.status),
          progress: isFeedbackProgress(query.progress) ? query.progress : "all",
          query: stringQuery(query.q), tag: stringQuery(query.tag), cursor: stringQuery(query.cursor),
          limit: feedbackPageLimit(query.limit), viewerId, mine,
        }),
        viewerId ? isOfficialUser(viewerId) : Promise.resolve(false),
      ]);
      return { ...page, canManage, contractVersion: 2 as const };
    });
  }
  async getPost(postId: string, viewerId?: string) { return boundary(() => getFeedbackPost(postId, viewerId)); }
  async createPost(userId: string, body: unknown) {
    const parsed = validateFeedbackPost(body);
    if (parsed.error || !parsed.value) throw new BadRequestException(parsed.error ?? "잘못된 입력입니다.");
    const value = parsed.value;
    return boundary(() => createFeedbackPost(userId, value));
  }
  async listReplies(postId: string) { return boundary(() => listFeedbackReplies(postId)); }
  async createReply(postId: string, userId: string, body: unknown) {
    const parsed = validateFeedbackReply(body);
    if (parsed.error || !parsed.text) throw new BadRequestException(parsed.error ?? "잘못된 입력입니다.");
    const text = parsed.text;
    return boundary(async () => createFeedbackReply({
      postId, parentId: parsed.parentId ?? null, userId, text, isOfficial: await isOfficialUser(userId),
    }));
  }
  async vote(postId: string, userId: string, body: unknown) {
    if (!body || typeof body !== "object" || !("voted" in body) || typeof body.voted !== "boolean") {
      throw new BadRequestException("공감 여부를 확인해 주세요.");
    }
    const voted = body.voted;
    return boundary(() => setFeedbackVote(postId, userId, voted));
  }
  async changeProgress(postId: string, userId: string, input: unknown) {
    const body = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
    if (!isFeedbackProgress(body.progress) || !isFeedbackProgress(body.expectedProgress)) {
      throw new BadRequestException("처리 상태를 확인해 주세요.");
    }
    const note = feedbackText(body.note);
    if (note.length < 2 || note.length > 1000) throw new BadRequestException("처리 안내를 2~1000자로 입력해 주세요.");
    const { progress, expectedProgress } = body;
    return boundary(() => updateFeedbackProgress(postId, userId, progress, note, expectedProgress));
  }
}
