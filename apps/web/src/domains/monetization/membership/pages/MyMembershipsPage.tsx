/**
 * MyMembershipsPage.tsx
 *
 * 팬용 내 멤버십 관리 페이지 (`/memberships`).
 * 가입 중인 멤버십 목록과 해지를 제공한다.
 */
import { Crown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { Container } from "@/shared/components/section";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import type { MembershipSubscription } from "../models/membership-model";
import {
  listSubscriptionsByMember,
  subscribeMembershipStore,
} from "../models/membership-store";
import { MyMembershipCard } from "../components/MyMembershipCard";

export function MyMembershipsPage() {
  const t = useT();
  const { data: session, ready, status } = useSession();
  const [subscriptions, setSubscriptions] = useState<readonly MembershipSubscription[]>([]);

  const memberId = session?.user.id ?? null;
  const authenticated = ready && status === "authenticated" && Boolean(memberId);

  const refresh = useCallback(() => {
    if (memberId) setSubscriptions(listSubscriptionsByMember(memberId));
  }, [memberId]);

  useEffect(() => {
    refresh();
    return subscribeMembershipStore(refresh);
  }, [refresh]);

  useDocumentTitle(t("membership.myPage.documentTitle"));

  if (!ready) {
    return (
      <Container className="py-16 text-center text-sm text-muted">
        {t("membership.myPage.loading")}
      </Container>
    );
  }

  if (!authenticated) {
    return (
      <Container className="py-16 text-center">
        <Crown className="mx-auto h-10 w-10 text-muted/50" aria-hidden />
        <h1 className="mt-3 text-xl font-bold text-fg">{t("membership.myPage.title")}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          {t("membership.myPage.loginRequired")}
        </p>
        <button
          type="button"
          onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "my-memberships", mode: "login" })}
          className={cn(buttonClass({ variant: "solid" }), "mt-4")}
        >
          {t("membership.myPage.login")}
        </button>
      </Container>
    );
  }

  return (
    <Container className="py-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-fg">
          <Crown className="h-6 w-6 text-accent" aria-hidden />
          {t("membership.myPage.title")}
        </h1>
        <p className="mt-1 text-sm text-muted">{t("membership.myPage.subtitle")}</p>
      </header>

      {subscriptions.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line p-10 text-center">
          <Crown className="mx-auto h-8 w-8 text-muted/50" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-fg">{t("membership.myPage.emptyTitle")}</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted">
            {t("membership.myPage.emptyBody")}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {subscriptions.map((subscription) => (
            <MyMembershipCard
              key={subscription.id}
              subscription={subscription}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </Container>
  );
}
