/**
 * 작가 뉴스레터 구독 토글 — 작가 페이지와 작품 상세에서 사용한다.
 *
 * 작품 단위 "연재 알림"(`SubscribeButton`)과 별개로, 작가 단위 이메일
 * 뉴스레터 구독을 담당한다. 게스트가 누르면 상태를 바꾸지 않고 로그인
 * 모달을 연다(게스트-퍼스트 정책의 보호 동작 규칙).
 */

import { Mail, MailCheck } from "lucide-react";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useAuthActorId } from "@/domains/auth/public/session/use-auth-actor-id";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { formatCount, cn } from "@/shared/lib/utils";

import { countNewsletterSubscribers, findNewsletterSubscription } from "./newsletter-model";
import { useNewsletterStore } from "./newsletter-store";

export function NewsletterSubscribeButton({
  authorName,
  className,
}: {
  authorName: string;
  className?: string;
}) {
  const t = useBilingual("newsletter");
  const actorId = useAuthActorId();
  const subscriptions = useNewsletterStore((state) => state.subscriptions);
  const toggleSubscribe = useNewsletterStore((state) => state.toggleSubscribe);

  const subscribed = actorId
    ? Boolean(findNewsletterSubscription(subscriptions, actorId, authorName))
    : false;
  const subscriberCount = countNewsletterSubscribers(subscriptions, authorName);

  const handleClick = () => {
    const result = toggleSubscribe(authorName, actorId);
    if (result.needsLogin) {
      requestAuthModalOpen({ reason: "protected-action", source: "newsletter-subscribe" });
    }
  };

  return (
    <button
      type="button"
      aria-pressed={subscribed}
      onClick={handleClick}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors duration-150",
        subscribed
          ? "border-accent/50 bg-accent-soft text-accent"
          : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
        className,
      )}
    >
      {subscribed ? <MailCheck size={16} /> : <Mail size={16} />}
      {subscribed
        ? t("뉴스레터 구독 중", "Subscribed to newsletter")
        : t("작가 뉴스레터 구독", "Subscribe to the newsletter")}
      <span className="text-xs font-normal opacity-80">
        {t(
          `구독자 ${formatCount(subscriberCount)}명 · 주 1회 묶음 발송`,
          `${formatCount(subscriberCount)} subscribers · weekly digest`,
        )}
      </span>
    </button>
  );
}
