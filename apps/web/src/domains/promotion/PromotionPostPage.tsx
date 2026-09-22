import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  Bookmark,
  ExternalLink,
  Flag,
  PenLine,
  Share2,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  PROMOTION_KINDS,
  PROMOTION_STAGES,
  safePromotionUrl,
} from "../../../../../packages/core/src/promotion";
import { PromotionVideo } from "./PromotionVideo";
import "./promotion-community.css";

import type {
  PromotionComment,
  PromotionDetail,
} from "../../../../../packages/core/src/promotion";

import {
  useDocumentTitle,
  useMetaDescription,
  usePageSocialMeta,
} from "@/hooks/use-document-title";
import { getApiErrorMessage } from "@/infrastructure/api";
import { promotionClient } from "@/infrastructure/promotion-client";
import { ThreadedCommentSection } from "@/shared/components/comments/threaded-comment-section";
import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import {
  canSharePromotionPost,
  compactPublicShareDescription,
  publicShareImageUrl,
} from "@/shared/lib/public-share-policy";
import { useApp } from "@/shared/lib/store";

const ShareDialog = lazy(async () => {
  const module = await import("@/shared/components/share-dialog");
  return { default: module.ShareDialog };
});

export function PromotionPostPage() {
  const { id = "" } = useParams();
  const userId = useApp((state) => state.userId);
  return <PromotionPost key={`${id}:${userId ?? "guest"}`} id={id} userId={userId} />;
}

function PromotionPost({ id, userId }: { id: string; userId: string | null }) {
  const [data, setData] = useState<PromotionDetail | null>(null);
  const [comments, setComments] = useState<PromotionComment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const live = useRef(true);
  const actionBusy = useRef(false);

  const post = data?.post;
  const shareable = post ? canSharePromotionPost(post) : false;
  const sharePath = id ? `/community/promote/${encodeURIComponent(id)}` : "/community/promote";
  const shareTitle = post ? `${post.title} · ${post.seriesTitle}` : "작가 홍보";
  const shareDescription = compactPublicShareDescription(
    post?.contentWarning
      ? `${post.seriesTitle} · 콘텐츠 안내: ${post.contentWarning}`
      : post?.description,
    "웹툰 신작과 창작자의 작업 이야기를 확인해 보세요.",
  );
  const shareImage = publicShareImageUrl(shareable ? post?.cover : null);
  const publicMetaTitle = shareable ? shareTitle : "작가 홍보";
  const publicMetaDescription = shareable
    ? shareDescription
    : "웹툰 신작과 창작자의 작업 이야기를 소개하는 공간입니다.";

  useDocumentTitle(post ? `${post.title} · 작가 홍보` : "작가 홍보 · ToonStudio");
  useMetaDescription(post ? publicMetaDescription : null);
  usePageSocialMeta({
    canonicalPath: sharePath,
    title: publicMetaTitle,
    description: publicMetaDescription,
    type: "article",
    image: shareImage,
  });

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    promotionClient.detail(id, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setComments(result.comments);
      })
      .catch(async (cause: unknown) => {
        const message = await getApiErrorMessage(cause, "게시물을 불러오지 못했어요.");
        if (!controller.signal.aborted) {
          setError(message);
          setData(null);
          setComments([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, revision]);

  async function mutate(work: () => Promise<unknown>, success: string, done?: () => void) {
    if (actionBusy.current || !userId || useApp.getState().userId !== userId) return;
    actionBusy.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      if (live.current && useApp.getState().userId === userId) {
        done?.();
        setNotice(success);
        setRevision((value) => value + 1);
      }
    } catch (cause) {
      const message = await getApiErrorMessage(
        cause,
        "요청을 처리하지 못했어요. 작성 내용은 유지됩니다.",
      );
      if (live.current) setError(message);
    } finally {
      actionBusy.current = false;
      if (live.current) setBusy(false);
    }
  }

  const readingUrl = post ? safePromotionUrl(post.readingUrl) : null;

  return (
    <div className="pc-shell pc-narrow">
      <Link to="/community/promote">{translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "← 신작·작가 홍보")}</Link>

      {error ? (
        <div className="pc-error" role="alert">
          {error}
          <button
            className="pc-button"
            type="button"
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            {translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "다시 불러오기")}</button>
        </div>
      ) : null}
      {loading && !data ? <p role="status">{translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "게시물을 불러오고 있어요.")}</p> : null}
      {notice ? <p className="pc-notice" role="status">{notice}</p> : null}

      {data && post ? (
        <>
          <CampusObjectSource objects={!post.hidden && !post.archived ? [{
            id: post.id,
            title: post.title,
            href: `/community/promote/${encodeURIComponent(post.id)}`,
            kind: "promotion-post",
            exposure: "public",
          }] : []} />
          <article className="pc-post">
            <div className="pc-tags">
              <span>{PROMOTION_KINDS[post.kind]}</span>
              <span>{PROMOTION_STAGES[post.stage]}</span>
              <span>{post.genre}</span>
            </div>
            <h1>{post.title}</h1>
            <div className="pc-post-byline">
              <Link to={`/u/${encodeURIComponent(post.author.id)}`}>{post.author.name}</Link>
              <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString("ko-KR")}</time>
            </div>

            {post.hidden || post.archived ? (
              <p className="pc-notice">
                {post.hidden
                  ? translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "운영자에 의해 비공개 처리된 게시물입니다.")
                  : translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "작성자가 보관한 게시물입니다.")}{" "}
                {translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "공개 목록에는 나타나지 않습니다.")}</p>
            ) : null}
            {post.contentWarning ? (
              <p className="pc-notice"><strong>{translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "콘텐츠 안내")}</strong> · {post.contentWarning}</p>
            ) : null}
            {post.cover ? (
              <img
                className="pc-post-cover"
                src={post.cover}
                alt={formatI18nTemplate(translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "{v0} 표지"), { v0: String(post.seriesTitle) })}
                width={640}
                height={800}
              />
            ) : null}
            <p className="pc-eyebrow">{post.seriesTitle}</p>
            <div className="pc-prose">{post.description}</div>
            <PromotionVideo url={post.videoUrl} title={post.seriesTitle} />

            <div className="pc-tags">
              {post.tags.map((tag) => (
                <Link key={tag} to={formatI18nTemplate(translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "en", "/community/promote?q={v0}"), { v0: String(encodeURIComponent(tag)) })}>#{tag}</Link>
              ))}
            </div>
            <div className="pc-actions">
              {readingUrl ? (
                <a
                  className="pc-button pc-primary"
                  href={readingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "작품 보러 가기 ")}<ExternalLink size={16} aria-hidden />
                </a>
              ) : null}
              <button
                className="pc-button"
                disabled={!userId || busy || loading}
                type="button"
                aria-pressed={post.saved}
                onClick={() => void mutate(
                  () => promotionClient.save(id, !post.saved),
                  post.saved ? "저장을 해제했어요." : "작품을 저장했어요.",
                )}
              >
                <Bookmark size={16} aria-hidden />
                {post.saved ? translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "저장됨") : translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "작품 저장")}
              </button>
              {shareable ? (
                <Suspense fallback={null}>
                  <ShareDialog
                    payload={{
                      title: shareTitle,
                      text: shareDescription,
                      url: sharePath,
                      imageUrl: shareImage,
                      buttonLabel: "소개 보기",
                    }}
                    trigger={
                      <button className="pc-button" type="button">
                        <Share2 size={16} aria-hidden />
                        게시물 공유
                      </button>
                    }
                  />
                </Suspense>
              ) : null}
            </div>

            {data.canManage ? (
              <div className="pc-actions">
                <Link className="pc-button" to={formatI18nTemplate(translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "en", "/community/promote/{v0}/edit"), { v0: String(encodeURIComponent(id)) })}>
                  <PenLine size={16} aria-hidden />
                  {translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "소개 수정")}</Link>
                <button
                  className="pc-button"
                  type="button"
                  disabled={busy || loading}
                  onClick={() => void mutate(
                    () => promotionClient.archive(id, !post.archived, post.version),
                    post.archived
                      ? "공개 목록에 복원했어요. 운영 비공개 상태는 유지됩니다."
                      : "게시물을 보관했어요.",
                  )}
                >
                  {post.archived ? translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "보관 해제") : translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "공개 목록에서 보관")}
                </button>
              </div>
            ) : null}

            {data.canModerate ? (
              <div className="pc-actions">
                <button
                  className="pc-button"
                  type="button"
                  disabled={busy || loading}
                  onClick={() => void mutate(
                    () => promotionClient.moderate(id, !post.hidden),
                    "운영 공개 상태를 변경했어요.",
                  )}
                >
                  {post.hidden ? translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "운영 비공개 해제") : translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "운영 비공개 처리")}
                </button>
                <Link to="/community/promote/moderation">{translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "신고 관리")}</Link>
              </div>
            ) : null}
          </article>

          <ThreadedCommentSection
            comments={comments}
            setComments={setComments}
            viewerId={userId}
            canModerate={data.canModerate}
            disabled={post.hidden || post.archived}
            allowDeleteWhenDisabled
            maxLength={1000}
            maxDepth={4}
            title={translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "응원·피드백")}
            description={translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "작품에 대한 구체적인 피드백과 따뜻한 응원을 나누고, 댓글에도 답해 보세요.")}
            placeholder={translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "좋았던 장면이나 궁금한 이야기를 나눠 주세요.")}
            draftStorageKey={formatI18nTemplate(translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "en", "promotion-comment-drafts:{v0}:{v1}"), { v0: String(id), v1: String(userId ?? "guest") })}
            className="pc-comments"
            authorHref={(comment) => `/u/${encodeURIComponent(comment.author.id)}`}
            onCreate={(text, parentId) => promotionClient.comment(id, text, parentId)}
            onUpdate={(commentId, text) => promotionClient.updateComment(id, commentId, text)}
            onDelete={(commentId) => promotionClient.deleteComment(id, commentId)}
            onToggleLike={(commentId) => promotionClient.toggleCommentLike(id, commentId)}
          />

          {userId ? (
            <details className="pc-report">
              <summary><Flag size={16} aria-hidden />{translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "도용·스팸·부적절한 게시물 신고")}</summary>
              <form
                className="pc-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate(
                    () => promotionClient.report(id, reason),
                    "신고를 접수했어요. 운영자가 검토합니다.",
                    () => setReason(""),
                  );
                }}
              >
                <label>
                  {translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "신고 사유")}<textarea
                    required
                    minLength={10}
                    maxLength={1000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={4}
                    placeholder={translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "구체적인 사유와 확인할 수 있는 출처를 적어 주세요. 신고 내용은 공개 댓글에 표시되지 않습니다.")}
                  />
                </label>
                <button className="pc-button" disabled={busy || loading} type="submit">{translateCurrentStaticSourceText("domains.promotion.PromotionPostPage", "ko", "신고 보내기")}</button>
              </form>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
