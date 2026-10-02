/**
 * CreatorEarlyAccessPage.tsx
 *
 * 창작자용 얼리 액세스 정책 관리 (`/creator/early-access`).
 * 작품별 서포터 선공개 기간을 설정한다.
 */
import { CalendarClock, Plus, Trash2, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { Container } from "@/shared/components/section";
import { LoadingState } from "@/shared/components/LoadingState";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import {
  EARLY_ACCESS_DAYS_MAX,
  EARLY_ACCESS_DAYS_MIN,
  validateEarlyAccessPolicy,
  type EarlyAccessPolicy,
} from "../models/paywall-model";
import {
  deleteEarlyAccessPolicy,
  listEarlyAccessPolicies,
  subscribePaywallStore,
  upsertEarlyAccessPolicy,
} from "../models/paywall-store";

export function CreatorEarlyAccessPage() {
  const t = useT();
  const { data: session, ready, status } = useSession();
  const [policies, setPolicies] = useState<readonly EarlyAccessPolicy[]>([]);
  const [titleId, setTitleId] = useState("");
  const [titleName, setTitleName] = useState("");
  const [days, setDays] = useState("14");
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const creatorId = session?.user.id ?? null;
  const authenticated = ready && status === "authenticated" && Boolean(creatorId);

  const refresh = useCallback(() => {
    if (creatorId) setPolicies(listEarlyAccessPolicies(creatorId));
  }, [creatorId]);

  useEffect(() => {
    refresh();
    return subscribePaywallStore(refresh);
  }, [refresh]);

  useDocumentTitle(t("paywall.creatorPage.documentTitle"));

  const handleSave = () => {
    if (!creatorId) return;
    const earlyAccessDays = Number(days.replace(/[^0-9]/g, "")) || 0;
    const key = validateEarlyAccessPolicy({ titleId, titleName, earlyAccessDays });
    if (key) {
      setErrorKey(key);
      return;
    }
    setErrorKey(null);
    upsertEarlyAccessPolicy({
      creatorId,
      titleId,
      titleName,
      enabled: true,
      earlyAccessDays,
    });
    setTitleId("");
    setTitleName("");
    setDays("14");
    refresh();
  };

  const toggleEnabled = (policy: EarlyAccessPolicy) => {
    upsertEarlyAccessPolicy({
      creatorId: policy.creatorId,
      titleId: policy.titleId,
      titleName: policy.titleName,
      enabled: !policy.enabled,
      earlyAccessDays: policy.earlyAccessDays,
    });
    refresh();
  };

  if (!ready) {
    return (
      <Container className="py-16">
        <LoadingState label={t("paywall.creatorPage.loading")} />
      </Container>
    );
  }

  if (!authenticated) {
    return (
      <Container className="py-16 text-center">
        <CalendarClock className="mx-auto h-10 w-10 text-muted/50" aria-hidden />
        <h1 className="mt-3 text-xl font-bold text-fg">{t("paywall.creatorPage.title")}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          {t("paywall.creatorPage.loginRequired")}
        </p>
        <button
          type="button"
          onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "creator-early-access", mode: "login" })}
          className={cn(buttonClass({ variant: "solid" }), "mt-4")}
        >
          {t("paywall.creatorPage.login")}
        </button>
      </Container>
    );
  }

  return (
    <Container className="py-8">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-fg">
          <CalendarClock className="h-6 w-6 text-accent" aria-hidden />
          {t("paywall.creatorPage.title")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t("paywall.creatorPage.subtitle")}</p>
      </header>

      <section aria-label={t("paywall.creatorPage.formTitle")} className="mt-6 rounded-2xl border border-line p-4 sm:p-6">
        <h2 className="text-base font-bold text-fg">{t("paywall.creatorPage.formTitle")}</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="eap-title-name" className="text-sm font-semibold text-fg">
              {t("paywall.creatorPage.titleNameLabel")}
            </label>
            <input
              id="eap-title-name"
              type="text"
              value={titleName}
              onChange={(event) => setTitleName(event.target.value)}
              placeholder={t("paywall.creatorPage.titleNamePlaceholder")}
              className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted/60 focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="eap-title-id" className="text-sm font-semibold text-fg">
              {t("paywall.creatorPage.titleIdLabel")}
            </label>
            <input
              id="eap-title-id"
              type="text"
              value={titleId}
              onChange={(event) => setTitleId(event.target.value)}
              placeholder={t("paywall.creatorPage.titleIdPlaceholder")}
              className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted/60 focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="eap-days" className="text-sm font-semibold text-fg">
              {t("paywall.creatorPage.daysLabel")}
            </label>
            <input
              id="eap-days"
              type="text"
              inputMode="numeric"
              value={days}
              onChange={(event) => setDays(event.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm tabular-nums text-fg focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-xs text-muted">
              {t("paywall.creatorPage.daysHint", { min: EARLY_ACCESS_DAYS_MIN, max: EARLY_ACCESS_DAYS_MAX })}
            </p>
          </div>
        </div>

        {errorKey && (
          <p role="alert" className="mt-4 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-fg">
            {t(`paywall.creatorPage.error.${errorKey}`)}
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          className={cn(buttonClass({ variant: "solid" }), "mt-4 gap-1.5")}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("paywall.creatorPage.save")}
        </button>
      </section>

      <section aria-label={t("paywall.creatorPage.listTitle")} className="mt-6 space-y-3">
        {policies.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center">
            <Zap className="mx-auto h-8 w-8 text-muted/50" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fg">{t("paywall.creatorPage.emptyTitle")}</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted">{t("paywall.creatorPage.emptyBody")}</p>
          </div>
        ) : (
          policies.map((policy) => (
            <article key={policy.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line p-4">
              <div>
                <h3 className="text-sm font-bold text-fg">{policy.titleName}</h3>
                <p className="text-xs tabular-nums text-muted">
                  {t("paywall.creatorPage.policySummary", { days: policy.earlyAccessDays })}
                  {" · "}
                  {policy.enabled ? t("paywall.creatorPage.enabled") : t("paywall.creatorPage.disabled")}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => toggleEnabled(policy)}
                  className={buttonClass({ variant: "outline", size: "sm" })}
                  aria-pressed={policy.enabled}
                >
                  {policy.enabled ? t("paywall.creatorPage.disable") : t("paywall.creatorPage.enable")}
                </button>
                <button
                  type="button"
                  onClick={() => { deleteEarlyAccessPolicy(policy.id); refresh(); }}
                  className={cn(buttonClass({ variant: "outline", size: "sm" }), "gap-1 text-bad")}
                  aria-label={t("paywall.creatorPage.delete", { name: policy.titleName })}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </Container>
  );
}
