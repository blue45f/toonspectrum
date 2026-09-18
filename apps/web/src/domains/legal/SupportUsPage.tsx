import { Building2, HandCoins, Handshake, ShieldCheck } from "lucide-react";

import "./support-us-i18n";
import { SupporterCheckoutPanel } from "./SupporterCheckoutPanel";
import { SupporterTransparencyPanel } from "./SupporterTransparencyPanel";

import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import { Container } from "@/shared/components/section";
import { useT } from "@/shared/lib/i18n";

const PRINCIPLE_KEYS = [
  "supportUs.principles.hosted",
  "supportUs.principles.noWallet",
  "supportUs.principles.noSecurities",
  "supportUs.principles.noDonationReceipt",
] as const;

export function SupportUsPage() {
  const t = useT();
  useDocumentTitle(t("supportUs.documentTitle"));

  return (
    <Container size="wide" className="py-8 sm:py-12 lg:py-16">
      <PublicStoryHero
        eyebrow={t("supportUs.hero.eyebrow")}
        title={t("supportUs.hero.title")}
        description={t("supportUs.hero.description")}
        image="materials"
        imageAlt="ToonSpectrum creator workspace materials"
        caption={translateCurrentStaticSourceText("domains.legal.SupportUsPage", "en", "SUPPORTER · SPONSORSHIP · CLEAR BOUNDARIES")}
      >
        <a
          href="#supporter-checkout"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
        >
          {t("supportUs.hero.checkout")}
          <HandCoins size={16} aria-hidden="true" />
        </a>
        <Link
          href="/support-creators"
          className="ml-4 inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-fg-2 hover:text-accent"
        >
          {t("supportUs.hero.creators")}
          <HandCoins size={16} aria-hidden="true" />
        </Link>
        <Link
          href="/business?type=sponsorship"
          className="ml-4 inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-fg-2 hover:text-accent"
        >
          {t("supportUs.hero.sponsor")}
          <Handshake size={16} aria-hidden="true" />
        </Link>
      </PublicStoryHero>

      <section
        className="mt-8 grid gap-4 lg:grid-cols-3"
        aria-label={t("supportUs.documentTitle")}
      >
        <article className="rounded-3xl border border-accent/35 bg-accent-soft/45 p-6">
          <p className="text-xs font-bold tracking-[0.14em] text-accent">
            {t("supportUs.individual.kicker")}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl border border-line bg-card text-accent">
              <HandCoins size={22} aria-hidden="true" />
            </span>
            <h2 className="text-xl font-bold text-fg">
              {t("supportUs.individual.title")}
            </h2>
          </div>
          <p className="mt-4 text-sm leading-7 text-fg-2">
            {t("supportUs.individual.body")}
          </p>
          <p className="mt-4 rounded-xl border border-line bg-card/70 px-4 py-3 text-sm font-semibold text-fg">
            {t("supportUs.individual.enabled")}
          </p>
        </article>

        <article className="rounded-3xl border border-line bg-card p-6">
          <p className="text-xs font-bold tracking-[0.14em] text-accent">
            {t("supportUs.business.kicker")}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl border border-line bg-panel text-accent">
              <Building2 size={22} aria-hidden="true" />
            </span>
            <h2 className="text-xl font-bold text-fg">
              {t("supportUs.business.title")}
            </h2>
          </div>
          <p className="mt-4 text-sm leading-7 text-fg-2">
            {t("supportUs.business.body")}
          </p>
          <Link
            href="/business?type=sponsorship"
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-panel px-4 text-sm font-bold text-fg transition-colors hover:border-accent/45 hover:text-accent"
          >
            {t("supportUs.business.cta")}
          </Link>
        </article>

        <article className="rounded-3xl border border-line bg-card p-6">
          <p className="text-xs font-bold tracking-[0.14em] text-accent">
            {t("supportUs.donation.kicker")}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl border border-line bg-panel text-accent">
              <ShieldCheck size={22} aria-hidden="true" />
            </span>
            <h2 className="text-xl font-bold text-fg">
              {t("supportUs.donation.title")}
            </h2>
          </div>
          <p className="mt-4 text-sm leading-7 text-fg-2">
            {t("supportUs.donation.body")}
          </p>
        </article>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section
          className="rounded-3xl border border-line bg-card p-6 sm:p-7"
          aria-labelledby="support-boundaries-title"
        >
          <h2
            id="support-boundaries-title"
            className="text-xl font-bold text-fg"
          >
            {t("supportUs.principles.title")}
          </h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {PRINCIPLE_KEYS.map((key) => (
              <li
                key={key}
                className="flex gap-3 rounded-2xl border border-line bg-panel/55 p-4 text-sm leading-6 text-fg-2"
              >
                <ShieldCheck
                  size={18}
                  className="mt-0.5 shrink-0 text-accent"
                  aria-hidden="true"
                />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </section>

        <aside
          id="supporter-status"
          className="rounded-3xl border border-line bg-panel/65 p-6"
        >
          <p className="text-xs font-bold tracking-[0.14em] text-accent">
            {t("supportUs.status.title")}
          </p>
          <h2 className="mt-2 text-lg font-bold text-fg">
            {t("supportUs.status.enabledTitle")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-fg-2">
            {t("supportUs.status.enabledBody")}
          </p>
        </aside>
      </div>

      <SupporterTransparencyPanel />

      <SupporterCheckoutPanel />

      <section
        className="mt-6 rounded-3xl border border-line bg-card p-6 sm:p-7"
        aria-labelledby="support-legal-title"
      >
        <h2 id="support-legal-title" className="text-xl font-bold text-fg">
          {t("supportUs.legal.title")}
        </h2>
        <p className="mt-3 text-sm leading-7 text-fg-2">
          {t("supportUs.legal.body")}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <p className="rounded-2xl border border-line bg-panel/55 p-4 text-sm leading-6 text-fg-2">
            {t("supportUs.legal.tax")}
          </p>
          <p className="rounded-2xl border border-line bg-panel/55 p-4 text-sm leading-6 text-fg-2">
            {t("supportUs.legal.refund")}
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/terms" className="text-accent hover:underline">
            {t("route.terms")}
          </Link>
          <Link href="/privacy" className="text-accent hover:underline">
            {t("route.privacy")}
          </Link>
          <Link href="/business" className="text-accent hover:underline">
            {t("route.business")}
          </Link>
        </div>
      </section>
    </Container>
  );
}
