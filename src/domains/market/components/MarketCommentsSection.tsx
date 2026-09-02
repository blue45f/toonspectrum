import {
  CornerDownRight,
  Heart,
  MessageSquare,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import {
  addMarketComment,
  addMarketCommentReply,
  deleteMarketComment,
  deleteMarketCommentReply,
  getMarketComments,
  toggleMarketCommentLike,
  MARKET_SOCIAL_EVENT,
  type MarketComment,
} from "../models/market-social-store";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";
import { useSession } from "@/src/compat/auth-session-store";

interface MarketCommentsSectionProps {
  resourceId: string;
  publisherId?: string;
}

function formatRelativeTime(dateString: string): string {
  try {
    const timestamp = new Date(dateString).getTime();
    if (Number.isNaN(timestamp)) return "방금 전";
    const diff = Math.max(0, Date.now() - timestamp);
    const minutes = Math.floor(diff / (60 * 1000));
    if (minutes < 1) return "방금 전";
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}일 전`;
    return dateString.slice(0, 10);
  } catch {
    return "방금 전";
  }
}

export function MarketCommentsSection({
  resourceId,
  publisherId,
}: MarketCommentsSectionProps) {
  const session = useSession();
  const loggedInUserName =
    session.status === "authenticated"
      ? (session.data as { name?: string; nickname?: string })?.nickname
        || (session.data as { name?: string; nickname?: string })?.name
      : undefined;

  const [comments, setComments] = useState<MarketComment[]>(() =>
    getMarketComments(resourceId),
  );
  const [commentInput, setCommentInput] = useState("");
  const [authorNameInput, setAuthorNameInput] = useState(loggedInUserName ?? "");
  const [replyingCommentId, setReplyingCommentId] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState("");
  const [replyAuthorName, setReplyAuthorName] = useState(loggedInUserName ?? "");

  useEffect(() => {
    const refresh = () => setComments(getMarketComments(resourceId));
    window.addEventListener(MARKET_SOCIAL_EVENT, refresh);
    return () => window.removeEventListener(MARKET_SOCIAL_EVENT, refresh);
  }, [resourceId]);

  useEffect(() => {
    if (loggedInUserName && !authorNameInput) {
      setAuthorNameInput(loggedInUserName);
    }
  }, [loggedInUserName, authorNameInput]);

  const handleCreateComment = (e: FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;

    addMarketComment(resourceId, {
      content: commentInput,
      authorName: authorNameInput || "웹툰 창작자",
      authorBadge: "verified_buyer",
    });

    setCommentInput("");
    setComments(getMarketComments(resourceId));
  };

  const handleCreateReply = (commentId: string, replyToName: string) => {
    if (!replyInput.trim()) return;

    addMarketCommentReply(resourceId, commentId, {
      content: replyInput,
      authorName: replyAuthorName || authorNameInput || "웹툰 창작자",
      replyToAuthorName: replyToName,
      authorBadge: "user",
    });

    setReplyInput("");
    setReplyingCommentId(null);
    setComments(getMarketComments(resourceId));
  };

  const totalCommentsAndReplies = comments.reduce(
    (total, c) => total + 1 + c.replies.length,
    0,
  );

  return (
    <section
      aria-labelledby="market-comments-heading"
      className="rounded-xl border border-line bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h2
            id="market-comments-heading"
            className="flex items-center gap-2 text-base font-bold text-fg sm:text-lg"
          >
            <MessageSquare className="size-4 text-accent" aria-hidden="true" />
            <span>Q&A 및 커뮤니티 피드백</span>
            <span className="numeral tnum ml-1 rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-accent">
              {totalCommentsAndReplies}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-fg-3">
            에셋 활용법, 웹툰 연재 적용 문의, 작가 피드백을 자유롭게 남겨보세요.
          </p>
        </div>
      </div>

      {/* New Root Comment Form */}
      <form onSubmit={handleCreateComment} className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="닉네임 (미입력 시 '웹툰 창작자')"
            value={authorNameInput}
            onChange={(e) => setAuthorNameInput(e.target.value)}
            maxLength={20}
            className="h-8 w-44 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <span className="text-[0.68rem] text-fg-3">
            네티켓을 지키며 유익한 창작 커뮤니티를 만들어주세요.
          </span>
        </div>
        <div className="relative">
          <textarea
            rows={3}
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            placeholder="에셋에 대한 궁금한 점이나 피드백을 작성해 주세요..."
            maxLength={500}
            className="w-full rounded-xl border border-line bg-panel p-3 text-xs leading-relaxed text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="mt-1 flex items-center justify-between px-1">
            <span className="text-[0.65rem] text-fg-3">
              {commentInput.length} / 500자
            </span>
            <button
              type="submit"
              disabled={!commentInput.trim()}
              className={buttonClass({
                variant: "solid",
                size: "sm",
                className: "gap-1 disabled:opacity-40",
              })}
            >
              <Send className="size-3" aria-hidden="true" />
              <span>댓글 등록</span>
            </button>
          </div>
        </div>
      </form>

      {/* Comments List */}
      <div className="mt-6 space-y-4">
        {comments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-panel/50 py-8 text-center">
            <p className="text-xs font-medium text-fg-2">
              아직 등록된 댓글이 없어요. 첫 번째 질문이나 소감을 남겨보세요!
            </p>
          </div>
        ) : (
          comments.map((comment) => {
            const isCreator =
              comment.author.badge === "creator"
              || (publisherId && comment.author.id === publisherId);

            return (
              <div
                key={comment.id}
                className="rounded-xl border border-line/60 bg-panel/30 p-4 transition-colors"
              >
                {/* Comment Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex size-7 items-center justify-center rounded-full bg-accent/20 text-accent font-bold text-xs">
                      {comment.author.name[0] ?? "U"}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-fg">
                          {comment.author.name}
                        </span>
                        {isCreator ? (
                          <span className="inline-flex items-center gap-0.5 rounded bg-accent/20 px-1.5 py-0.2 text-[0.62rem] font-bold text-accent">
                            <Sparkles className="size-2.5" /> 배급자
                          </span>
                        ) : comment.author.badge === "verified_buyer" ? (
                          <span className="rounded bg-good/15 px-1.5 py-0.2 text-[0.62rem] font-medium text-good">
                            구매 인증
                          </span>
                        ) : comment.author.badge === "pro_artist" ? (
                          <span className="rounded bg-cool/15 px-1.5 py-0.2 text-[0.62rem] font-medium text-cool">
                            프로 작가
                          </span>
                        ) : null}
                      </div>
                      <time
                        dateTime={comment.createdAt}
                        className="text-[0.65rem] text-fg-3"
                      >
                        {formatRelativeTime(comment.createdAt)}
                      </time>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      deleteMarketComment(resourceId, comment.id);
                      setComments(getMarketComments(resourceId));
                    }}
                    title="댓글 삭제"
                    className="p-1 text-fg-3 opacity-60 hover:text-warn hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">삭제</span>
                  </button>
                </div>

                {/* Comment Body */}
                <p className="mt-2 text-xs leading-relaxed text-fg-2 whitespace-pre-wrap">
                  {comment.content}
                </p>

                {/* Comment Actions */}
                <div className="mt-3 flex items-center gap-3 border-t border-line/40 pt-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      toggleMarketCommentLike(resourceId, comment.id);
                      setComments(getMarketComments(resourceId));
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 text-[0.7rem] font-medium transition-colors",
                      comment.likedByMe
                        ? "text-warn"
                        : "text-fg-3 hover:text-warn",
                    )}
                  >
                    <Heart
                      className={cn(
                        "size-3.5",
                        comment.likedByMe && "fill-warn text-warn",
                      )}
                      aria-hidden="true"
                    />
                    <span>좋아요 {comment.likes > 0 ? comment.likes : ""}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReplyingCommentId(
                        replyingCommentId === comment.id ? null : comment.id,
                      );
                      setReplyInput("");
                    }}
                    className="text-[0.7rem] font-medium text-fg-3 hover:text-accent transition-colors"
                  >
                    답글 달기
                  </button>
                </div>

                {/* Nested Replies (대댓글) */}
                {comment.replies.length > 0 ? (
                  <div className="mt-3 space-y-2.5 border-l-2 border-accent/30 pl-3 sm:pl-4">
                    {comment.replies.map((reply) => {
                      const replyIsCreator =
                        reply.author.badge === "creator"
                        || (publisherId && reply.author.id === publisherId);

                      return (
                        <div
                          key={reply.id}
                          className="rounded-lg bg-card/60 p-3 border border-line/40"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <CornerDownRight
                                className="size-3 text-fg-3 shrink-0"
                                aria-hidden="true"
                              />
                              <span className="text-xs font-bold text-fg">
                                {reply.author.name}
                              </span>
                              {replyIsCreator ? (
                                <span className="inline-flex items-center gap-0.5 rounded bg-accent/20 px-1 py-0.2 text-[0.6rem] font-bold text-accent">
                                  <Sparkles className="size-2" /> 배급자
                                </span>
                              ) : null}
                              {reply.replyToAuthorName ? (
                                <span className="text-[0.65rem] text-accent font-medium">
                                  @{reply.replyToAuthorName}
                                </span>
                              ) : null}
                              <time
                                dateTime={reply.createdAt}
                                className="text-[0.62rem] text-fg-3"
                              >
                                {formatRelativeTime(reply.createdAt)}
                              </time>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                deleteMarketCommentReply(
                                  resourceId,
                                  comment.id,
                                  reply.id,
                                );
                                setComments(getMarketComments(resourceId));
                              }}
                              title="답글 삭제"
                              className="text-fg-3 opacity-60 hover:text-warn hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="size-3" aria-hidden="true" />
                              <span className="sr-only">삭제</span>
                            </button>
                          </div>

                          <p className="mt-1.5 pl-4 text-xs leading-relaxed text-fg-2 whitespace-pre-wrap">
                            {reply.content}
                          </p>

                          <div className="mt-2 pl-4 flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                toggleMarketCommentLike(
                                  resourceId,
                                  comment.id,
                                  reply.id,
                                );
                                setComments(getMarketComments(resourceId));
                              }}
                              className={cn(
                                "inline-flex items-center gap-1 text-[0.65rem] font-medium transition-colors",
                                reply.likedByMe
                                  ? "text-warn"
                                  : "text-fg-3 hover:text-warn",
                              )}
                            >
                              <Heart
                                className={cn(
                                  "size-3",
                                  reply.likedByMe && "fill-warn text-warn",
                                )}
                                aria-hidden="true"
                              />
                              <span>
                                좋아요 {reply.likes > 0 ? reply.likes : ""}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {/* Inline Reply Input Box */}
                {replyingCommentId === comment.id ? (
                  <div className="mt-3 rounded-lg border border-accent/40 bg-card p-3">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-semibold text-accent flex items-center gap-1">
                        <CornerDownRight className="size-3" />
                        <span>@{comment.author.name} 님에게 답글 작성</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setReplyingCommentId(null)}
                        className="text-fg-3 hover:text-fg text-[0.7rem]"
                      >
                        취소
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="답글 작성자 닉네임"
                        value={replyAuthorName}
                        onChange={(e) => setReplyAuthorName(e.target.value)}
                        className="h-8 w-36 rounded-md border border-line bg-panel px-2 text-xs text-fg focus:border-accent focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="답글 내용을 입력하세요..."
                        value={replyInput}
                        onChange={(e) => setReplyInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleCreateReply(comment.id, comment.author.name);
                          }
                        }}
                        className="h-8 flex-1 rounded-md border border-line bg-panel px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleCreateReply(comment.id, comment.author.name)
                        }
                        disabled={!replyInput.trim()}
                        className={buttonClass({
                          variant: "solid",
                          size: "sm",
                          className: "disabled:opacity-40",
                        })}
                      >
                        답글
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
