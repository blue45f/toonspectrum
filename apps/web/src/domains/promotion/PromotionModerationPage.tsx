import { Inbox, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import "./promotion-community.css";

import type { PromotionReport } from "../../../../../packages/core/src/promotion";

import { promotionClient } from "@/platform/promotion-client";
import { getApiErrorMessage } from "@/platform/api";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
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
  const [items, setItems] = useState<PromotionReport[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

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

  return (
    <div className="pc-shell pc-narrow">
      <Link to="/community/promote">{bt("← 홍보 커뮤니티", "← Promotion community")}</Link>
      <h1>{bt("홍보 신고 관리", "Promotion report moderation")}</h1>
      <p className="pc-caption">
        {bt(
          "운영자 전용 · 최근 신고 100개. 게시물 상세에서 확인 후 비공개·복구할 수 있습니다.",
          "Moderator-only · latest 100 reports. Review a post, then hide or restore it.",
        )}
      </p>

      {!userId && (
        <div className="pc-empty">
          <ShieldCheck size={38} aria-hidden="true" />
          <h3>{bt("운영자 계정으로 로그인해 주세요", "Sign in with a moderator account")}</h3>
          <p>{bt("신고 관리 기능은 운영자 권한이 필요합니다.", "Report moderation requires moderator access.")}</p>
        </div>
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

      {userId && !items && !error && (
        <div role="status" aria-label={bt("신고 목록을 불러오는 중", "Loading reports")}>
          <ReportCardSkeleton />
          <ReportCardSkeleton />
          <ReportCardSkeleton />
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
            · {new Date(item.createdAt).toLocaleString("ko-KR")}
          </p>
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
