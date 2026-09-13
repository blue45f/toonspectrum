import { Bookmark, ExternalLink, Flag, MessageCircle, PenLine, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { PROMOTION_KINDS, PROMOTION_STAGES, safePromotionUrl } from "../../../../../packages/core/src/promotion";
import { PromotionVideo } from "./PromotionVideo";
import "./promotion-community.css";

import type { PromotionDetail } from "../../../../../packages/core/src/promotion";

import { promotionClient } from "@/infrastructure/promotion-client";
import { getApiErrorMessage } from "@/infrastructure/api";
import { useApp } from "@/shared/lib/store";
import { useDocumentTitle } from "@/hooks/use-document-title";

export function PromotionPostPage() {
  const { id = "" } = useParams(), userId = useApp((state) => state.userId);
  return <PromotionPost key={`${id}:${userId ?? "guest"}`} id={id} userId={userId} />;
}
function PromotionPost({ id, userId }: { id: string; userId: string | null }) {
  const [data, setData] = useState<PromotionDetail | null>(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false);
  const [comment, setComment] = useState(""), [reason, setReason] = useState(""), [notice, setNotice] = useState("");
  const live = useRef(true), actionBusy = useRef(false);
  useDocumentTitle(data ? `${data.post.title} · 작가 홍보` : "작가 홍보 · ToonStudio");
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    promotionClient.detail(id, controller.signal).then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch(async (cause: unknown) => { const message = await getApiErrorMessage(cause, "게시물을 불러오지 못했어요."); if (!controller.signal.aborted) { setError(message); setData(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, revision]);
  const mutate = async (work: () => Promise<unknown>, success: string, done?: () => void) => {
    if (actionBusy.current || !userId || useApp.getState().userId !== userId) return;
    actionBusy.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await work();
      if (live.current && useApp.getState().userId === userId) { done?.(); setNotice(success); setRevision((value) => value + 1); }
    } catch (cause) { const message = await getApiErrorMessage(cause, "요청을 처리하지 못했어요. 작성 내용은 유지됩니다."); if (live.current) setError(message); }
    finally { actionBusy.current = false; if (live.current) setBusy(false); }
  };
  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); if (live.current) setNotice("게시물 링크를 복사했어요."); }
    catch { if (live.current) setNotice("주소창의 게시물 주소를 복사해 공유해 주세요."); }
  };
  const post = data?.post, readingUrl = post ? safePromotionUrl(post.readingUrl) : null;
  return <main className="pc-shell pc-narrow"><Link to="/community/promote">← 신작·작가 홍보</Link>
    {error && <div className="pc-error" role="alert">{error}<button className="pc-button" type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>다시 불러오기</button></div>}{loading && !data && <p role="status">게시물을 불러오고 있어요.</p>}{notice && <p className="pc-notice" role="status">{notice}</p>}
    {data && post && <><article className="pc-post"><div className="pc-tags"><span>{PROMOTION_KINDS[post.kind]}</span><span>{PROMOTION_STAGES[post.stage]}</span><span>{post.genre}</span></div><h1>{post.title}</h1><div className="pc-post-byline"><Link to={`/u/${encodeURIComponent(post.author.id)}`}>{post.author.name}</Link><time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString("ko-KR")}</time></div>{(post.hidden || post.archived) && <p className="pc-notice">{post.hidden ? "운영자에 의해 비공개 처리된 게시물입니다." : "작성자가 보관한 게시물입니다."} 공개 목록에는 나타나지 않습니다.</p>}
      {post.contentWarning && <p className="pc-notice"><strong>콘텐츠 안내</strong> · {post.contentWarning}</p>}{post.cover && <img className="pc-post-cover" src={post.cover} alt={`${post.seriesTitle} 표지`} width={640} height={800} />}<p className="pc-eyebrow">{post.seriesTitle}</p><div className="pc-prose">{post.description}</div><PromotionVideo url={post.videoUrl} title={post.seriesTitle} />
      <div className="pc-tags">{post.tags.map((tag) => <Link key={tag} to={`/community/promote?q=${encodeURIComponent(tag)}`}>#{tag}</Link>)}</div><div className="pc-actions">{readingUrl && <a className="pc-button pc-primary" href={readingUrl} target="_blank" rel="noopener noreferrer">작품 보러 가기 <ExternalLink size={16} aria-hidden="true" /></a>}<button className="pc-button" disabled={!userId || busy || loading} type="button" aria-pressed={post.saved} onClick={() => void mutate(() => promotionClient.save(id, !post.saved), post.saved ? "저장을 해제했어요." : "작품을 저장했어요.")}><Bookmark size={16} aria-hidden="true" />{post.saved ? "저장됨" : "작품 저장"}</button><button className="pc-button" type="button" onClick={() => void share()}><Share2 size={16} aria-hidden="true" />링크 복사</button></div>
      {data.canManage && <div className="pc-actions"><Link className="pc-button" to={`/community/promote/${encodeURIComponent(id)}/edit`}><PenLine size={16} aria-hidden="true" />소개 수정</Link><button className="pc-button" type="button" disabled={busy || loading} onClick={() => void mutate(() => promotionClient.archive(id, !post.archived, post.version), post.archived ? "공개 목록에 복원했어요. 운영 비공개 상태는 유지됩니다." : "게시물을 보관했어요.")}>{post.archived ? "보관 해제" : "공개 목록에서 보관"}</button></div>}
      {data.canModerate && <div className="pc-actions"><button className="pc-button" type="button" disabled={busy || loading} onClick={() => void mutate(() => promotionClient.moderate(id, !post.hidden), "운영 공개 상태를 변경했어요.")}>{post.hidden ? "운영 비공개 해제" : "운영 비공개 처리"}</button><Link to="/community/promote/moderation">신고 관리</Link></div>}
    </article><section className="pc-comments" aria-labelledby="pc-comments-title"><h2 id="pc-comments-title"><MessageCircle size={21} aria-hidden="true" />응원·피드백</h2><p className="pc-caption">최근 댓글 최대 50개를 보여줍니다. 작품에 대한 구체적인 피드백과 따뜻한 응원을 나눠 주세요.</p>{data.comments.length === 0 && <p className="pc-notice">첫 응원을 남겨 주세요.</p>}{data.comments.map((entry) => <article className="pc-comment" key={entry.id}><div className="pc-post-byline"><Link to={`/u/${encodeURIComponent(entry.author.id)}`}>{entry.author.name}</Link><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("ko-KR")}</time></div><p>{entry.text}</p>{(userId === entry.author.id || data.canModerate) && <button className="pc-text-button" disabled={busy || loading} type="button" onClick={() => { if (window.confirm("이 댓글을 삭제할까요? 삭제 후 복원할 수 없습니다.")) void mutate(() => promotionClient.deleteComment(id, entry.id), "댓글을 삭제했어요."); }}>댓글 삭제</button>}</article>)}
      {userId && !post.hidden && !post.archived ? <form className="pc-form" onSubmit={(event) => { event.preventDefault(); void mutate(() => promotionClient.comment(id, comment), "댓글을 등록했어요.", () => setComment("")); }}><label>댓글 작성<textarea required maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} rows={4} placeholder="좋았던 장면이나 궁금한 이야기를 나눠 주세요." /></label><button className="pc-button pc-primary" type="submit" disabled={busy || loading || !comment.trim()}>댓글 등록</button></form> : <p className="pc-caption">{userId ? "비공개 게시물에는 댓글을 작성할 수 없습니다." : "상단에서 로그인하면 저장·댓글·신고에 참여할 수 있어요."}</p>}
    </section>{userId && <details className="pc-report"><summary><Flag size={16} aria-hidden="true" />도용·스팸·부적절한 게시물 신고</summary><form className="pc-form" onSubmit={(event) => { event.preventDefault(); void mutate(() => promotionClient.report(id, reason), "신고를 접수했어요. 운영자가 검토합니다.", () => setReason("")); }}><label>신고 사유<textarea required minLength={10} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} rows={4} placeholder="구체적인 사유와 확인할 수 있는 출처를 적어 주세요. 신고 내용은 공개 댓글에 표시되지 않습니다." /></label><button className="pc-button" disabled={busy || loading} type="submit">신고 보내기</button></form></details>}</>}
  </main>;
}
