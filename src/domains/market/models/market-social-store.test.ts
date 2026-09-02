// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  addMarketComment,
  addMarketCommentReply,
  addMarketReview,
  deleteMarketComment,
  getMarketComments,
  getMarketReviews,
  toggleMarketCommentLike,
} from "./market-social-store";

describe("market-social-store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("adds a root comment and retrieves it", () => {
    const resourceId = "res-test-1";
    const comment = addMarketComment(resourceId, {
      authorName: "웹툰작가A",
      authorBadge: "verified_buyer",
      content: "3D 소체 비율이 아주 훌륭합니다!",
    });

    expect(comment.id).toBeDefined();
    expect(comment.author.name).toBe("웹툰작가A");
    expect(comment.likes).toBe(0);

    const list = getMarketComments(resourceId);
    expect(list.some((c) => c.id === comment.id)).toBe(true);
  });

  it("adds a nested reply (대댓글) to a parent comment", () => {
    const resourceId = "res-test-2";
    const parent = addMarketComment(resourceId, {
      authorName: "질문자",
      authorBadge: "pro_artist",
      content: "이 브러시 클립스튜디오 브러시 느낌 나나요?",
    });

    const reply = addMarketCommentReply(resourceId, parent.id, {
      authorName: "배급작가",
      authorBadge: "creator",
      content: "네! 손떨림 보정이 들어가서 아주 매끄럽습니다.",
      replyToAuthorName: "질문자",
    });

    expect(reply).not.toBeNull();
    expect(reply?.replyToAuthorName).toBe("질문자");

    const updatedComments = getMarketComments(resourceId);
    const target = updatedComments.find((c) => c.id === parent.id);
    expect(target?.replies).toHaveLength(1);
    expect(target?.replies[0].content).toContain("손떨림 보정");
  });

  it("toggles comment likes and deletes a comment", () => {
    const resourceId = "res-test-3";
    const comment = addMarketComment(resourceId, {
      authorName: "유저1",
      authorBadge: "verified_buyer",
      content: "좋은 자료 감사합니다.",
    });

    toggleMarketCommentLike(resourceId, comment.id);
    let list = getMarketComments(resourceId);
    expect(list.find((c) => c.id === comment.id)?.likes).toBe(1);

    deleteMarketComment(resourceId, comment.id);
    list = getMarketComments(resourceId);
    expect(list.some((c) => c.id === comment.id)).toBe(false);
  });

  it("adds a review and updates rating stats", () => {
    const resourceId = "res-test-4";
    const review = addMarketReview(resourceId, {
      authorName: "프로작가K",
      authorBadge: "verified_buyer",
      rating: 5,
      title: "최고의 퀄리티",
      content: "웹툰 콘티 짤 때 정말 큰 도움이 되었습니다.",
      tags: ["콘티속도UP", "자연스러운포즈"],
      recommended: true,
    });

    expect(review.rating).toBe(5);
    const { reviews, stats } = getMarketReviews(resourceId);
    expect(reviews.some((r) => r.id === review.id)).toBe(true);
    expect(stats.totalCount).toBeGreaterThanOrEqual(1);
    expect(stats.average).toBeGreaterThanOrEqual(4.0);
    expect(stats.distribution[5]).toBeGreaterThanOrEqual(1);
  });
});
