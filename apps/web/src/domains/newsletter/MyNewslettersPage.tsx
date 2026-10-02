/**
 * 내 뉴스레터 구독 관리 페이지(`/newsletter`).
 *
 * 독자가 구독 중인 작가 목록, 발송 주기(주 1회 묶음/새 화마다) 변경,
 * 구독 해지를 한곳에서 처리한다. 메일 하단의 구독 해지 링크도 여기로 온다.
 * 게스트에게는 목록 대신 로그인 유도를 보여준다(보호 동작 규칙).
 */

import { Mail, PenLine } from "lucide-react";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useAuthActorId } from "@/domains/auth/public/session/use-auth-actor-id";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import { listMyNewsletterSubscriptions } from "./newsletter-model";
import { useNewsletterStore } from "./newsletter-store";
import type { NewsletterCadence } from "./newsletter-types";

export function MyNewslettersPage() {
  const t = useBilingual("newsletter");
  const actorId = useAuthActorId();
  const subscriptions = useNewsletterStore((state) => state.subscriptions);
  const unsubscribe = useNewsletterStore((state) => state.unsubscribe);
  const setCadence = useNewsletterStore((state) => state.setCadence);

  const mySubscriptions = actorId ? listMyNewsletterSubscriptions(subscriptions, actorId) : [];

  return (
    <Container size="wide" className="py-10">
      <header className="mb-8">
        <p className="eyebrow flex items-center gap-1.5 text-accent">
          <Mail size={13} /> {t("뉴스레터", "NEWSLETTER")}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {t("내 뉴스레터 구독", "My newsletter subscriptions")}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-2">
          {t(
            "구독한 작가의 새 화 소식을 이메일로 받아 봅니다. 기본은 주 1회 묶음 발송이라 메일함이 붐비지 않아요.",
            "Get new-episode news from authors you subscribe to by email. The default is a weekly digest, so your inbox stays calm.",
          )}
        </p>
      </header>

      <img
        src="/images/hero-main.webp"
        alt=""
        loading="lazy"
        decoding="async"
        className="mb-8 h-36 w-full rounded-3xl object-cover sm:h-44"
      />

      {!actorId ? (
        <section className="rounded-2xl border border-line bg-panel/50 p-6">
          <h2 className="text-base font-semibold text-fg">
            {t("로그인하면 구독을 관리할 수 있어요", "Sign in to manage your subscriptions")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">
            {t(
              "구독 목록과 해지는 내 계정에 묶여 있어요. 둘러보기는 로그인 없이 계속할 수 있습니다.",
              "Your subscription list is tied to your account. You can keep browsing without signing in.",
            )}
          </p>
          <button
            type="button"
            onClick={() => requestAuthModalOpen({ reason: "protected-action", mode: "login" })}
            className="mt-4 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {t("로그인하기", "Sign in")}
          </button>
        </section>
      ) : mySubscriptions.length === 0 ? (
        <ActionableEmptyState
          icon={Mail}
          title={t("아직 구독 중인 작가가 없어요", "No author subscriptions yet")}
          description={t(
            "작가 페이지나 작품 상세에서 '작가 뉴스레터 구독'을 누르면 새 화 소식을 메일로 받아 볼 수 있어요.",
            "Tap “Subscribe to the newsletter” on an author page or a title page to get new-episode news by email.",
          )}
          primary={{ href: "/authors", label: t("작가 둘러보기", "Browse authors") }}
          secondary={{ href: "/newsletter/compose", label: t("뉴스레터 보내기", "Send a newsletter") }}
          art="library"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {mySubscriptions.map((sub) => (
            <li
              key={`${sub.readerId}-${sub.authorName}`}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-panel/50 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <Link
                  href={`/author/${encodeURIComponent(sub.authorName)}`}
                  className="text-base font-semibold text-fg transition-colors hover:text-accent"
                >
                  {sub.authorName}
                </Link>
                <p className="mt-1 text-xs text-fg-3">
                  {t(
                    `${new Date(sub.subscribedAt).toLocaleDateString()}부터 구독 중`,
                    `Subscribed since ${new Date(sub.subscribedAt).toLocaleDateString()}`,
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-fg-2">
                  {t("발송 주기", "Cadence")}
                  <select
                    value={sub.cadence}
                    onChange={(event) =>
                      setCadence(sub.authorName, actorId, event.target.value as NewsletterCadence)
                    }
                    className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-fg"
                  >
                    <option value="weekly">{t("주 1회 묶음", "Weekly digest")}</option>
                    <option value="instant">{t("새 화마다 바로", "Every new episode")}</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => unsubscribe(sub.authorName, actorId)}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
                >
                  {t("구독 해지", "Unsubscribe")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {actorId && (
        <section className="mt-10 flex flex-col gap-3 rounded-2xl border border-line bg-panel/50 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
              <PenLine size={16} className="text-accent" />
              {t("작가로 활동 중이신가요?", "Publishing your own work?")}
            </h2>
            <p className="mt-1 text-sm text-fg-2">
              {t(
                "내 구독자에게 새 화 소식 뉴스레터를 보낼 수 있어요.",
                "Send a newsletter to your own subscribers when a new episode drops.",
              )}
            </p>
          </div>
          <Link
            href="/newsletter/compose"
            className="rounded-xl bg-accent px-4 py-2.5 text-center text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {t("뉴스레터 보내기", "Send a newsletter")}
          </Link>
        </section>
      )}
    </Container>
  );
}
