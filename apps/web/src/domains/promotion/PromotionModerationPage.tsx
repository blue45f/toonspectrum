import { Eye, EyeOff, Inbox, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import "./promotion-community.css";

import type { PromotionReport } from "../../../../../packages/core/src/promotion";

import { promotionClient } from "@/platform/promotion-client";
import { getApiErrorMessage } from "@/platform/api";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useI18n } from "@/shared/lib/i18n-core";
import { useApp } from "@/shared/lib/store";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

const SCOPE = "domains.promotion.PromotionModerationPage";

function ReportCardSkeleton() {
  return (
    <article className="pc-comment" aria-hidden="true">
      <div className="skeleton h-5 w-2/3 rounded" />
      <div className="skeleton mt-3 h-4 w-full rounded" />
      <div className="skeleton mt-2 h-4 w-1/3 rounded" />
    </article>
  );
}

function PromotionReports({ userId }: { userId: string | null }) {
  const bt = useBilingual(SCOPE);
  const lang = useI18n((state) => state.lang);
  const dateLocale = lang === "ko" ? "ko-KR" : "en-US";
  const [items, setItems] = useState<PromotionReport[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [moderatingPostId, setModeratingPostId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const actionBusy = useRef(false);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    setItems(null);
    setError("");
    promotionClient
      .reports(controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setItems(rows);
      })
      .catch(async (cause: unknown) => {
        const message = await getApiErrorMessage(cause, bt("신고 목록을 불러오지 못했어요.", "Couldn't load the report list."));
        if (!controller.signal.aborted) setError(message);
      });
    return () => controller.abort();
  }, [userId, revision, bt]);

  const retry = () => setRevision((value) => value + 1);

  // 비공개·복구 인라인 액션 — 서버 계약(PATCH /promotions/posts/:id/visibility)과
  // 클라이언트(promotionClient.moderate)는 상세 페이지에서 이미 실사용 중이라 여기서는 호출만 잇는다.
  // 성공하면 revision 재조회로 같은 게시물의 중복 신고 행까지 서버 값으로 함께 갱신된다.
  async function moderate(item: PromotionReport) {
    if (actionBusy.current || !userId || useApp.getState().userId !== userId) return;
    actionBusy.current = true;
    setModeratingPostId(item.postId);
    setActionError("");
    setNotice("");
    try {
      await promotionClient.moderate(item.postId, !item.hidden);
      setNotice(
        item.hidden
          ? bt("게시물을 다시 공개했어요.", "The post is visible again.")
          : bt("게시물을 비공개로 전환했어요.", "The post is now hidden."),
      );
      setRevision((value) => value + 1);
    } catch (cause) {
      setActionError(
        await getApiErrorMessage(cause, bt("공개 상태를 바꾸지 못했어요.", "Couldn't change the visibility.")),
      );
    } finally {
      actionBusy.current = false;
      setModeratingPostId(null);
    }
  }

  return (
    <div className="pc-shell pc-narrow">
      <Link to="/community/promote">{bt("← 홍보 커뮤니티", "← Promotion community")}</Link>
      <h1>{bt("홍보 신고 관리", "Promotion report moderation")}</h1>
      <p className="pc-caption">
        {bt(
          "운영자 전용 · 최근 신고 100개. 각 신고에서 바로 비공개·복구할 수 있습니다.",
          "Moderator-only · latest 100 reports. Hide or restore right from each report.",
        )}
      </p>

      {!userId && (
        <ActionableEmptyState
          art="none"
          icon={ShieldCheck}
          title={bt("운영자 계정으로 로그인해 주세요", "Sign in with a moderator account")}
          description={bt("신고 관리 기능은 운영자 권한이 필요합니다.", "Report moderation requires moderator access.")}
          primary={{ href: "/login", label: bt("로그인", "Sign in") }}
        />
      )}

      {userId && error && (
        <div className="pc-error" role="alert">
          <p>{error}</p>
          <button className="pc-button" type="button" onClick={retry}>
            <RefreshCw size={15} aria-hidden="true" />
            {bt("다시 시도", "Retry")}
          </button>
        </div>
      )}

      <div className="pc-actions">
        <button className="pc-button" type="button" disabled={!userId || !items} onClick={retry}>
          <RefreshCw size={15} aria-hidden="true" />
          {bt("새로고침", "Refresh")}
        </button>
      </div>

      <section aria-labelledby="pc-reports-title">
        <h2 id="pc-reports-title" className="pc-form-section-title">
          {bt("접수된 신고", "Received reports")}
        </h2>

        {actionError && (
          <div className="pc-error" role="alert">
            <p>{actionError}</p>
          </div>
        )}
        {notice && (
          <p className="pc-caption" role="status">
            {notice}
          </p>
        )}

        {userId && !items && !error && (
          <div role="status" aria-label={bt("신고 목록을 불러오는 중", "Loading reports")}>
            <ReportCardSkeleton />
            <ReportCardSkeleton />
            <ReportCardSkeleton />
          </div>
        )}

        {items?.length === 0 && (
          <ActionableEmptyState
            icon={Inbox}
            title={bt("접수된 신고가 없어요", "No reports yet")}
            description={bt(
              "현재 검토 대기 중인 신고가 없습니다. 새로운 신고가 접수되면 여기에 표시됩니다.",
              "There are no reports waiting for review. New reports will appear here.",
            )}
            primary={{ href: "/community/promote", label: bt("홍보 커뮤니티 보기", "View promotion community") }}
          />
        )}

        {items?.map((item, index) => (
        <article className="pc-comment" key={`${item.postId}:${item.createdAt}:${index}`}>
          <Link to={`/community/promote/${encodeURIComponent(item.postId)}`}>
            <strong>{item.title}</strong>
          </Link>
          <p>{item.reason}</p>
          <p className="pc-caption">
            {item.hidden
              ? bt("비공개 처리됨", "Hidden")
              : bt("공개 중", "Visible")}{" "}
            · {new Date(item.createdAt).toLocaleString(dateLocale)}
          </p>
          <div className="pc-actions">
            <button
              className="pc-button"
              type="button"
              disabled={moderatingPostId !== null}
              onClick={() => void moderate(item)}
            >
              {item.hidden ? (
                <Eye size={15} aria-hidden="true" />
              ) : (
                <EyeOff size={15} aria-hidden="true" />
              )}
              {moderatingPostId === item.postId
                ? bt("처리 중…", "Working…")
                : item.hidden
                  ? bt("비공개 해제", "Restore")
                  : bt("비공개 처리", "Hide")}
            </button>
          </div>
        </article>
        ))}
      </section>
    </div>
  );
}

export function PromotionModerationPage() {
  const bt = useBilingual(SCOPE);
  const userId = useApp((state) => state.userId);
  useDocumentTitle(bt("홍보 커뮤니티 신고 관리 · ToonStudio", "Promotion community report moderation · ToonStudio"));
  return <PromotionReports key={userId ?? "guest"} userId={userId} />;
}
