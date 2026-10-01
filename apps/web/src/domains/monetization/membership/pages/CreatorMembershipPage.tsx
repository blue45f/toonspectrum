/**
 * CreatorMembershipPage.tsx
 *
 * 창작자용 멤버십 관리 페이지 (`/creator/membership`).
 * 티어 생성·수정, 멤버 수, 월 recurring 수익 추정치를 보여준다.
 */
import { Crown, Pencil, Plus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { Container } from "@/shared/components/section";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import {
  formatMembershipKrw,
  sumMonthlyRecurring,
  type MembershipTier,
} from "../models/membership-model";
import {
  listTiersByCreator,
  subscribeMembershipStore,
} from "../models/membership-store";
import { MembershipTierEditor } from "../components/MembershipTierEditor";

export function CreatorMembershipPage() {
  const t = useT();
  const { data: session, ready, status } = useSession();
  const [tiers, setTiers] = useState<readonly MembershipTier[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTier, setEditingTier] = useState<MembershipTier | null>(null);

  const creatorId = session?.user.id ?? null;
  const authenticated = ready && status === "authenticated" && Boolean(creatorId);

  const refresh = useCallback(() => {
    if (creatorId) setTiers(listTiersByCreator(creatorId));
  }, [creatorId]);

  useEffect(() => {
    refresh();
    return subscribeMembershipStore(refresh);
  }, [refresh]);

  useDocumentTitle(t("membership.creatorPage.documentTitle"));

  const handleSaved = () => {
    setShowEditor(false);
    setEditingTier(null);
    refresh();
  };

  if (!ready) {
    return (
      <Container className="py-16 text-center text-sm text-muted">
        {t("membership.creatorPage.loading")}
      </Container>
    );
  }

  if (!authenticated) {
    return (
      <Container className="py-16 text-center">
        <Crown className="mx-auto h-10 w-10 text-muted/50" aria-hidden />
        <h1 className="mt-3 text-xl font-bold text-fg">{t("membership.creatorPage.title")}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          {t("membership.creatorPage.loginRequired")}
        </p>
        <button
          type="button"
          onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "creator-membership", mode: "login" })}
          className={cn(buttonClass({ variant: "solid" }), "mt-4")}
        >
          {t("membership.creatorPage.login")}
        </button>
      </Container>
    );
  }

  return (
    <Container className="py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-fg">
            <Crown className="h-6 w-6 text-accent" aria-hidden />
            {t("membership.creatorPage.title")}
          </h1>
          <p className="mt-1 text-sm text-muted">{t("membership.creatorPage.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => { setEditingTier(null); setShowEditor((v) => !v); }}
          className={cn(buttonClass({ variant: "solid" }), "gap-1.5")}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("membership.creatorPage.newTier")}
        </button>
      </header>

      {tiers.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-line p-4">
            <p className="text-xs text-muted">{t("membership.creatorPage.statTiers")}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-fg">{tiers.length}</p>
          </div>
          <div className="rounded-2xl border border-line p-4">
            <p className="text-xs text-muted">{t("membership.creatorPage.statMembers")}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-fg">
              {tiers.reduce((sum, tier) => sum + tier.memberCount, 0)}
            </p>
          </div>
          <div className="rounded-2xl border border-line p-4">
            <p className="text-xs text-muted">{t("membership.creatorPage.statMonthly")}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-fg">
              {formatMembershipKrw(sumMonthlyRecurring(tiers))}
            </p>
          </div>
        </div>
      )}

      {showEditor && creatorId && (
        <div className="mt-6">
          <MembershipTierEditor
            creatorId={creatorId}
            editingTier={editingTier}
            onSaved={handleSaved}
            onCancel={() => { setShowEditor(false); setEditingTier(null); }}
          />
        </div>
      )}

      <section aria-label={t("membership.creatorPage.tierList")} className="mt-6 space-y-3">
        {tiers.length === 0 && !showEditor ? (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center">
            <Users className="mx-auto h-8 w-8 text-muted/50" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fg">{t("membership.creatorPage.emptyTitle")}</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted">
              {t("membership.creatorPage.emptyBody")}
            </p>
          </div>
        ) : (
          tiers.map((tier) => (
            <article key={tier.id} className="rounded-2xl border border-line p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-fg">{tier.name}</h2>
                  <p className="mt-0.5 text-sm tabular-nums text-muted">
                    {t("membership.creatorPage.tierPrice", { amount: formatMembershipKrw(tier.monthlyPriceKrw) })}
                    {" · "}
                    {t("membership.creatorPage.tierMembers", { count: tier.memberCount })}
                  </p>
                  {tier.description && (
                    <p className="mt-1 text-sm text-muted">{tier.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tier.perks.map((perk) => (
                      <span
                        key={perk}
                        className="rounded-full bg-fg/5 px-2.5 py-1 text-xs text-fg"
                      >
                        {t(`membership.perk.${perk}`)}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setEditingTier(tier); setShowEditor(true); }}
                  className={cn(buttonClass({ variant: "outline", size: "sm" }), "gap-1.5")}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  {t("membership.creatorPage.edit")}
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </Container>
  );
}
