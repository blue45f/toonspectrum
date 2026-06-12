import { Body, Controller, Delete, Get, Headers, Inject, Patch, Post, UnauthorizedException } from "@nestjs/common";
import { MeService } from "./me.service";

interface ReviewPayload {
  titleId?: unknown;
  rating?: unknown;
  text?: unknown;
  tags?: unknown;
  spoiler?: unknown;
}

interface ReviewLikePayload {
  reviewId?: unknown;
}

interface RatingPayload {
  titleId?: unknown;
  value?: unknown;
}

interface ReadPayload {
  titleId?: unknown;
  state?: unknown;
}

interface SubscriptionPayload {
  titleId?: unknown;
}

interface CollectionPayload {
  action?: unknown;
  id?: unknown;
  titleId?: unknown;
  name?: unknown;
  emoji?: unknown;
}

interface ProfilePayload {
  name?: unknown;
  bio?: unknown;
  image?: unknown;
}

interface MergePayload {
  ratings?: Record<string, unknown>;
  reads?: Record<string, unknown>;
  subscriptions?: Record<string, unknown>;
  reviews?: Record<string, unknown>;
  likedReviews?: Record<string, unknown>;
  collections?: unknown[];
}

@Controller("me")
export class MeController {
  constructor(@Inject(MeService) private readonly meService: MeService) {}

  private userIdFromHeader(userId?: string) {
    if (!userId) throw new UnauthorizedException("로그인이 필요해요.");
    return userId;
  }

  @Get()
  async getMe(@Headers("x-user-id") userId?: string) {
    const uid = this.userIdFromHeader(userId);
    return this.meService.getMe(uid);
  }

  @Patch("profile")
  async updateProfile(@Headers("x-user-id") userId: string | undefined, @Body() body: ProfilePayload) {
    const uid = this.userIdFromHeader(userId);
    return this.meService.updateProfile(uid, body);
  }

  @Delete("account")
  async deleteAccount(@Headers("x-user-id") userId: string | undefined) {
    const uid = this.userIdFromHeader(userId);
    return this.meService.deleteAccount(uid);
  }

  @Post("review")
  async upsertReview(@Headers("x-user-id") userId: string | undefined, @Body() body: ReviewPayload) {
    const uid = this.userIdFromHeader(userId);
    return this.meService.upsertReview(uid, body);
  }

  @Delete("review")
  async deleteReview(@Headers("x-user-id") userId: string | undefined, @Body() body: ReviewPayload) {
    const uid = this.userIdFromHeader(userId);
    return this.meService.deleteReview(uid, body);
  }

  @Post("review-like")
  async toggleReviewLike(@Headers("x-user-id") userId: string | undefined, @Body() body: ReviewLikePayload) {
    const uid = this.userIdFromHeader(userId);
    return this.meService.toggleReviewLike(uid, body);
  }

  @Post("rating")
  async upsertRating(@Headers("x-user-id") userId: string | undefined, @Body() body: RatingPayload) {
    const uid = this.userIdFromHeader(userId);
    return this.meService.upsertRating(uid, body);
  }

  @Post("read")
  async upsertRead(@Headers("x-user-id") userId: string | undefined, @Body() body: ReadPayload) {
    const uid = this.userIdFromHeader(userId);
    return this.meService.upsertRead(uid, body);
  }

  @Post("subscription")
  async toggleSubscription(@Headers("x-user-id") userId: string | undefined, @Body() body: SubscriptionPayload) {
    const uid = this.userIdFromHeader(userId);
    return this.meService.toggleSubscription(uid, body);
  }

  @Post("collection")
  async updateCollection(@Headers("x-user-id") userId: string | undefined, @Body() body: CollectionPayload) {
    const uid = this.userIdFromHeader(userId);
    return this.meService.updateCollection(uid, body);
  }

  @Post("merge")
  async mergeMe(@Headers("x-user-id") userId: string | undefined, @Body() body: MergePayload) {
    const uid = this.userIdFromHeader(userId);
    return this.meService.merge(uid, body);
  }
}
