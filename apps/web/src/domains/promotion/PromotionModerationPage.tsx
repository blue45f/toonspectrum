import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import "./promotion-community.css";

import type { PromotionReport } from "../../../../../packages/core/src/promotion";

import { promotionClient } from "@/infrastructure/promotion-client";
import { getApiErrorMessage } from "@/infrastructure/api";
import { useApp } from "@/shared/lib/store";
import { useDocumentTitle } from "@/hooks/use-document-title";

export function PromotionModerationPage() {
  const userId = useApp((state) => state.userId);
  useDocumentTitle("홍보 커뮤니티 신고 관리 · ToonStudio");
  return <PromotionReports key={userId ?? translateCurrentStaticSourceText("domains.promotion.PromotionModerationPage", "en", "guest")} userId={userId} />;
}
function PromotionReports({ userId }: { userId: string | null }) {
  const [items, setItems] = useState<PromotionReport[] | null>(null), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController(); setItems(null); setError("");
    promotionClient.reports(controller.signal).then((rows) => { if (!controller.signal.aborted) setItems(rows); }).catch(async (cause: unknown) => { const message = await getApiErrorMessage(cause, "신고 목록을 불러오지 못했어요."); if (!controller.signal.aborted) setError(message); });
    return () => controller.abort();
  }, [userId, revision]);
  return <div className="pc-shell pc-narrow"><Link to="/community/promote">{translateCurrentStaticSourceText("domains.promotion.PromotionModerationPage", "ko", "← 홍보 커뮤니티")}</Link><h1>{translateCurrentStaticSourceText("domains.promotion.PromotionModerationPage", "ko", "홍보 신고 관리")}</h1><p className="pc-caption">{translateCurrentStaticSourceText("domains.promotion.PromotionModerationPage", "ko", "운영자 전용 · 최근 신고 100개. 게시물 상세에서 확인 후 비공개·복구할 수 있습니다.")}</p>{!userId && <p className="pc-notice">{translateCurrentStaticSourceText("domains.promotion.PromotionModerationPage", "ko", "운영자 계정으로 로그인해 주세요.")}</p>}{error && <p className="pc-error" role="alert">{error}</p>}{userId && !items && !error && <p role="status">{translateCurrentStaticSourceText("domains.promotion.PromotionModerationPage", "ko", "신고를 불러오고 있어요.")}</p>}<button className="pc-button" type="button" disabled={!userId} onClick={() => setRevision((value) => value + 1)}>{translateCurrentStaticSourceText("domains.promotion.PromotionModerationPage", "ko", "새로고침")}</button>{items?.length === 0 && <p className="pc-notice">{translateCurrentStaticSourceText("domains.promotion.PromotionModerationPage", "ko", "접수된 신고가 없습니다.")}</p>}{items?.map((item, index) => <article className="pc-comment" key={`${item.postId}:${item.createdAt}:${index}`}><Link to={formatI18nTemplate(translateCurrentStaticSourceText("domains.promotion.PromotionModerationPage", "en", "/community/promote/{v0}"), { v0: String(encodeURIComponent(item.postId)) })}><strong>{item.title}</strong></Link><p>{item.reason}</p><p className="pc-caption">{item.hidden ? translateCurrentStaticSourceText("domains.promotion.PromotionModerationPage", "ko", "비공개 처리됨") : translateCurrentStaticSourceText("domains.promotion.PromotionModerationPage", "ko", "공개 중")} · {new Date(item.createdAt).toLocaleString("ko-KR")}</p></article>)}</div>;
}
