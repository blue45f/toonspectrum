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
} from "@/shared/seo/use-document-title";
import { getApiErrorMessage } from "@/platform/api";
import { isNotFoundError } from "@/platform/api-error";
import { promotionClient } from "@/platform/promotion-client";
import { NotFoundPage } from "@/shared/components/feedback/NotFoundPage";
import { ThreadedCommentSection } from "@/shared/components/comments/threaded-comment-section";
import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import {
  canSharePromotionPost,
  compactPublicShareDescription,
  publicShareImageUrl,
} from "@/shared/lib/public-share-policy";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";

const SCOPE = "domains.promotion.PromotionPostPage";

const KIND_EN: Record<keyof typeof PROMOTION_KINDS, string> = {
  series: "Series · new work",
  trailer: "Promo video",
  process: "Work in progress",
  feedback: "Feedback request",
};
const STAGE_EN: Record<keyof typeof PROMOTION_STAGES, string> = {
  amateur: "Amateur",
  debut: "Debut · new work",
  serializing: "Serializing creator",
};
const GENRE_EN: Record<string, string> = {
  "판타지": "Fantasy",
  "로맨스": "Romance",
  "드라마": "Drama",
  "액션": "Action",
  "일상": "Slice of life",
  "코미디": "Comedy",
  "스릴러": "Thriller",
  "SF": "Sci-fi",
  "무협": "Martial arts",
  "기타": "Other",
};

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
  const bt = useBilingual(SCOPE);
  const [data, setData] = useState<PromotionDetail | null>(null);
  const [comments, setComments] = useState<PromotionComment[]>([]);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
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
  const shareTitle = post ? `${post.title} · ${post.seriesTitle}` : bt("작가 홍보", "Creator spotlight");
  const shareDescription = compactPublicShareDescription(
    post?.contentWarning
      ? `${post.seriesTitle} · ${bt("콘텐츠 안내", "Content notes")}: ${post.contentWarning}`
      : post?.description,
    bt("웹툰 신작과 창작자의 작업 이야기를 확인해 보세요.", "Check out new webtoons and creators' stories."),
  );
  const shareImage = publicShareImageUrl(shareable ? post?.cover : null);
  const publicMetaTitle = shareable ? shareTitle : bt("작가 홍보", "Creator spotlight");
  const publicMetaDescription = shareable
    ? shareDescription
    : bt("웹툰 신작과 창작자의 작업 이야기를 소개하는 공간입니다.", "A place introducing new webtoons and creators' stories.");

  useDocumentTitle(post ? `${post.title} · ${bt("작가 홍보", "Creator spotlight")}` : bt("작가 홍보 · ToonStudio", "Creator spotlight · ToonStudio"));
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
    setNotFound(false);
    promotionClient.detail(id, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setComments(result.comments);
      })
      .catch(async (cause: unknown) => {
        if (controller.signal.aborted) return;
        // 존재하지 않는 홍보글 id는 404 전용 화면으로 분리한다(일시 오류와 구분).
        if (isNotFoundError(cause)) {
          setNotFound(true);
          setData(null);
          setComments([]);
          return;
        }
        const message = await getApiErrorMessage(cause, bt("게시물을 불러오지 못했어요.", "Couldn't load the post."));
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
  }, [id, revision, bt]);

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
        bt("요청을 처리하지 못했어요. 작성 내용은 유지됩니다.", "Couldn't process the request. Your input is kept."),
      );
      if (live.current) setError(message);
    } finally {
      actionBusy.current = false;
      if (live.current) setBusy(false);
    }
  }

  const readingUrl = post ? safePromotionUrl(post.readingUrl) : null;

  if (notFound) return <NotFoundPage />;

  return (
    <div className="pc-shell pc-narrow">
      <Link to="/community/promote">{bt("← 신작·작가 홍보", "← New works & creators")}</Link>

      {error ? (
        <div className="pc-error" role="alert">
          {error}
          <button
            className="pc-button"
            type="button"
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            {bt("다시 불러오기", "Reload")}
          </button>
        </div>
      ) : null}
      {loading && !data ? <p role="status">{bt("게시물을 불러오고 있어요.", "Loading the post…")}</p> : null}
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
              <span>{bt(PROMOTION_KINDS[post.kind], KIND_EN[post.kind] ?? PROMOTION_KINDS[post.kind])}</span>
              <span>{bt(PROMOTION_STAGES[post.stage], STAGE_EN[post.stage] ?? PROMOTION_STAGES[post.stage])}</span>
              <span>{bt(post.genre, GENRE_EN[post.genre] ?? post.genre)}</span>
            </div>
            <h1>{post.title}</h1>
            <div className="pc-post-byline">
              <Link to={`/u/${encodeURIComponent(post.author.id)}`}>{post.author.name}</Link>
              <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString("ko-KR")}</time>
            </div>

            {post.hidden || post.archived ? (
              <p className="pc-notice">
                {post.hidden
                  ? bt("운영자에 의해 비공개 처리된 게시물입니다.", "This post was hidden by moderators.")
                  : bt("작성자가 보관한 게시물입니다.", "This post was archived by the author.")}{" "}
                {bt("공개 목록에는 나타나지 않습니다.", "It doesn't appear in public lists.")}</p>
            ) : null}
            {post.contentWarning ? (
              <p className="pc-notice"><strong>{bt("콘텐츠 안내", "Content notes")}</strong> · {post.contentWarning}</p>
            ) : null}
            {post.cover ? (
              <img
                className="pc-post-cover"
                src={post.cover}
                alt={bt(`${post.seriesTitle} 표지`, `${post.seriesTitle} cover`)}
                width={640}
                height={800}
              />
            ) : null}
            <p className="pc-eyebrow">{post.seriesTitle}</p>
            <div className="pc-prose">{post.description}</div>
            <PromotionVideo url={post.videoUrl} title={post.seriesTitle} />

            <div className="pc-tags">
              {post.tags.map((tag) => (
                <Link key={tag} to={`/community/promote?q=${encodeURIComponent(tag)}`}>#{tag}</Link>
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
                  {bt("작품 보러 가기", "Read the work")} <ExternalLink size={16} aria-hidden />
                </a>
              ) : null}
              <button
                className="pc-button"
                disabled={!userId || busy || loading}
                type="button"
                aria-pressed={post.saved}
                onClick={() => void mutate(
                  () => promotionClient.save(id, !post.saved),
                  post.saved ? bt("저장을 해제했어요.", "Unsaved.") : bt("작품을 저장했어요.", "Saved the work."),
                )}
              >
                <Bookmark size={16} aria-hidden />
                {post.saved ? bt("저장됨", "Saved") : bt("작품 저장", "Save work")}
              </button>
              {shareable ? (
                <Suspense fallback={null}>
                  <ShareDialog
                    payload={{
                      title: shareTitle,
                      text: shareDescription,
                      url: sharePath,
                      imageUrl: shareImage,
                      buttonLabel: bt("소개 보기", "View intro"),
                    }}
                    trigger={
                      <button className="pc-button" type="button">
                        <Share2 size={16} aria-hidden />
                        {bt("게시물 공유", "Share post")}
                      </button>
                    }
                  />
                </Suspense>
              ) : null}
            </div>

            {data.canManage ? (
              <div className="pc-actions">
                <Link className="pc-button" to={`/community/promote/${encodeURIComponent(id)}/edit`}>
                  <PenLine size={16} aria-hidden />
                  {bt("소개 수정", "Edit intro")}</Link>
                <button
                  className="pc-button"
                  type="button"
                  disabled={busy || loading}
                  onClick={() => void mutate(
                    () => promotionClient.archive(id, !post.archived, post.version),
                    post.archived
                      ? bt("공개 목록에 복원했어요. 운영 비공개 상태는 유지됩니다.", "Restored to public lists. Moderator-hidden status is kept.")
                      : bt("게시물을 보관했어요.", "Archived the post."),
                  )}
                >
                  {post.archived ? bt("보관 해제", "Unarchive") : bt("공개 목록에서 보관", "Archive from public")}
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
                    bt("운영 공개 상태를 변경했어요.", "Moderation visibility updated."),
                  )}
                >
                  {post.hidden ? bt("운영 비공개 해제", "Unhide") : bt("운영 비공개 처리", "Hide as moderator")}
                </button>
                <Link to="/community/promote/moderation">{bt("신고 관리", "Reports")}</Link>
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
            title={bt("응원·피드백", "Cheers · feedback")}
            description={bt("작품에 대한 구체적인 피드백과 따뜻한 응원을 나누고, 댓글에도 답해 보세요.", "Share specific feedback and warm support, and reply to comments.")}
            placeholder={bt("좋았던 장면이나 궁금한 이야기를 나눠 주세요.", "Tell us about a favorite scene or something you're curious about.")}
            draftStorageKey={`promotion-comment-drafts:${id}:${userId ?? "guest"}`}
            className="pc-comments"
            authorHref={(comment) => `/u/${encodeURIComponent(comment.author.id)}`}
            onCreate={(text, parentId) => promotionClient.comment(id, text, parentId)}
            onUpdate={(commentId, text) => promotionClient.updateComment(id, commentId, text)}
            onDelete={(commentId) => promotionClient.deleteComment(id, commentId)}
            onToggleLike={(commentId) => promotionClient.toggleCommentLike(id, commentId)}
          />

          {userId ? (
            <details className="pc-report">
              <summary><Flag size={16} aria-hidden />{bt("도용·스팸·부적절한 게시물 신고", "Report plagiarism · spam · inappropriate posts")}</summary>
              <form
                className="pc-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate(
                    () => promotionClient.report(id, reason),
                    bt("신고를 접수했어요. 운영자가 검토합니다.", "Report received. Moderators will review it."),
                    () => setReason(""),
                  );
                }}
              >
                <label>
                  {bt("신고 사유", "Reason")}<textarea
                    required
                    minLength={10}
                    maxLength={1000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={4}
                    placeholder={bt("구체적인 사유와 확인할 수 있는 출처를 적어 주세요. 신고 내용은 공개 댓글에 표시되지 않습니다.", "Describe the reason with verifiable sources. Reports don't appear in public comments.")}
                  />
                </label>
                <button className="pc-button" disabled={busy || loading} type="submit">{bt("신고 보내기", "Send report")}</button>
              </form>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
