import {
  BriefcaseBusiness,
  GraduationCap,
  HandHeart,
  Lightbulb,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  CREATOR_SUPPORT_CATEGORIES,
  CREATOR_SUPPORT_NEEDS,
  CREATOR_SUPPORT_OFFER_TYPES,
  type CreatorSupportAgeBand,
  type CreatorSupportCategory,
  type CreatorSupportNeed,
  type CreatorSupportOfferType,
  type CreatorSupportProject,
} from "@toonspectrum/core/creator-support";

import "./creator-support-i18n";
import {
  getMyCreatorSupportApplication,
  listCreatorSupportProjects,
  listMyCreatorSupportOffers,
  submitCreatorSupportApplication,
  submitCreatorSupportOffer,
  type CreatorSupportApplicationSnapshot,
  type CreatorSupportReceivedOffer,
} from "./creator-support-api";

import { useSession } from "@/compat/auth-session-store";
import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { getApiErrorMessage } from "@/platform/api";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import { Container } from "@/shared/components/section";
import { useT } from "@/shared/lib/i18n";

const CATEGORY_ICONS: Record<CreatorSupportCategory, typeof GraduationCap> = {
  student: GraduationCap,
  amateur: Lightbulb,
  emerging: Sparkles,
};

const NEED_KEY = (need: CreatorSupportNeed) => `creatorSupport.needs.${need}`;
const formatWon = (value: number) => `₩${value.toLocaleString("ko-KR")}`;

interface ApplicationForm {
  category: CreatorSupportCategory;
  ageBand: CreatorSupportAgeBand;
  applicantRole: "self" | "guardian";
  title: string;
  story: string;
  intendedUse: string;
  supportNeeds: CreatorSupportNeed[];
  portfolioUrl: string;
  estimatedBudgetWon: number;
  guardianConfirmed: boolean;
  consentAccepted: boolean;
}

const INITIAL_APPLICATION: ApplicationForm = {
  category: "student",
  ageBand: "adult",
  applicantRole: "self",
  title: "",
  story: "",
  intendedUse: "",
  supportNeeds: ["mentorship"],
  portfolioUrl: "",
  estimatedBudgetWon: 0,
  guardianConfirmed: false,
  consentAccepted: false,
};

interface OfferForm {
  type: CreatorSupportOfferType;
  contactEmail: string;
  message: string;
  consentAccepted: boolean;
  website: string;
}

const INITIAL_OFFER: OfferForm = {
  type: "mentorship",
  contactEmail: "",
  message: "",
  consentAccepted: false,
  website: "",
};

export function CreatorSupportPage() {
  const t = useT();
  const { status: sessionStatus } = useSession();
  useDocumentTitle(t("creatorSupport.documentTitle"));

  const [filter, setFilter] = useState<CreatorSupportCategory | "">("");
  const [projects, setProjects] = useState<CreatorSupportProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<CreatorSupportProject | null>(null);
  const [offer, setOffer] = useState<OfferForm>(INITIAL_OFFER);
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerStatus, setOfferStatus] = useState("");
  const [application, setApplication] = useState<ApplicationForm>(INITIAL_APPLICATION);
  const [applicationBusy, setApplicationBusy] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState("");
  const [myApplication, setMyApplication] =
    useState<CreatorSupportApplicationSnapshot | null>(null);
  const [receivedOffers, setReceivedOffers] =
    useState<CreatorSupportReceivedOffer[]>([]);
  const [privateLoading, setPrivateLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError("");
    listCreatorSupportProjects(filter)
      .then((data) => setProjects(data.items))
      .catch((error) =>
        void getApiErrorMessage(error, t("creatorSupport.error.load")).then(setLoadError),
      )
      .finally(() => setLoading(false));
  }, [filter, t]);

  useEffect(() => {
    load();
  }, [load]);

  const loadPrivate = useCallback(() => {
    if (sessionStatus !== "authenticated") {
      setMyApplication(null);
      setReceivedOffers([]);
      return;
    }
    setPrivateLoading(true);
    Promise.all([
      getMyCreatorSupportApplication(),
      listMyCreatorSupportOffers(),
    ])
      .then(([applicationResponse, offerResponse]) => {
        setMyApplication(applicationResponse.item);
        setReceivedOffers(offerResponse.items);
      })
      .catch(() => {
        setMyApplication(null);
        setReceivedOffers([]);
      })
      .finally(() => setPrivateLoading(false));
  }, [sessionStatus]);

  useEffect(() => {
    loadPrivate();
  }, [loadPrivate]);

  const toggleNeed = (need: CreatorSupportNeed) => {
    setApplication((current) => ({
      ...current,
      supportNeeds: current.supportNeeds.includes(need)
        ? current.supportNeeds.filter((item) => item !== need)
        : [...current.supportNeeds, need],
    }));
  };

  const submitApplication = async (event: FormEvent) => {
    event.preventDefault();
    if (applicationBusy) return;
    setApplicationBusy(true);
    setApplicationStatus("");
    try {
      await submitCreatorSupportApplication(application);
      setApplicationStatus(t("creatorSupport.apply.success"));
      setApplication(INITIAL_APPLICATION);
      loadPrivate();
    } catch (error) {
      setApplicationStatus(
        await getApiErrorMessage(error, t("creatorSupport.error.submit")),
      );
    } finally {
      setApplicationBusy(false);
    }
  };

  const submitOffer = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || offerBusy) return;
    setOfferBusy(true);
    setOfferStatus("");
    try {
      await submitCreatorSupportOffer(selected.id, offer);
      setOfferStatus(t("creatorSupport.offer.success"));
      setOffer(INITIAL_OFFER);
    } catch (error) {
      setOfferStatus(await getApiErrorMessage(error, t("creatorSupport.error.submit")));
    } finally {
      setOfferBusy(false);
    }
  };

  const filters = useMemo(
    () => [
      ["", t("creatorSupport.filters.all")],
      ...CREATOR_SUPPORT_CATEGORIES.map((value) => [
        value,
        t(`creatorSupport.filters.${value}`),
      ]),
    ] as const,
    [t],
  );

  return (
    <Container size="wide" className="py-8 sm:py-12 lg:py-16">
      <PublicStoryHero
        eyebrow={t("creatorSupport.hero.eyebrow")}
        title={t("creatorSupport.hero.title")}
        description={t("creatorSupport.hero.description")}
        image="materials"
        imageAlt="Creator support workspace"
        caption="STUDENT · AMATEUR · EMERGING CREATOR SUPPORT"
      >
        <a
          href="#creator-support-projects"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent"
        >
          <HandHeart size={17} aria-hidden="true" />
          {t("creatorSupport.hero.browse")}
        </a>
        <a
          href="#creator-support-apply"
          className="ml-3 inline-flex min-h-12 items-center text-sm font-semibold text-fg-2 hover:text-accent"
        >
          {t("creatorSupport.hero.apply")}
        </a>
      </PublicStoryHero>

      <section
        id="creator-support-projects"
        className="mt-8"
        aria-labelledby="creator-support-projects-title"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">
              SUPPORT DISCOVERY
            </p>
            <h2 id="creator-support-projects-title" className="mt-1 text-2xl font-bold text-fg">
              {t("creatorSupport.projects.title")}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map(([value, label]) => (
              <button
                key={value || "all"}
                type="button"
                onClick={() => setFilter(value as CreatorSupportCategory | "")}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                  filter === value
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-fg-3">…</p>
        ) : loadError ? (
          <p className="mt-6 rounded-xl border border-bad/30 bg-bad/10 p-4 text-sm text-bad">
            {loadError}
          </p>
        ) : projects.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-line bg-card p-8 text-center text-sm text-fg-3">
            {t("creatorSupport.projects.empty")}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {projects.map((project) => {
              const Icon = CATEGORY_ICONS[project.category];
              return (
                <article key={project.id} className="rounded-3xl border border-line bg-card p-6">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-11 place-items-center rounded-xl border border-line bg-panel text-accent">
                      <Icon size={21} aria-hidden="true" />
                    </span>
                    <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-bold text-fg-3">
                      {t(`creatorSupport.filters.${project.category}`)}
                    </span>
                  </div>
                  <h3 className="mt-4 text-xl font-bold text-fg">{project.title}</h3>
                  <p className="mt-1 text-sm font-semibold text-accent">{project.creatorName}</p>
                  <p className="mt-3 line-clamp-4 text-sm leading-7 text-fg-2">
                    {project.story}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {project.supportNeeds.map((need) => (
                      <span key={need} className="rounded-full bg-panel px-3 py-1 text-xs text-fg-2">
                        {t(NEED_KEY(need))}
                      </span>
                    ))}
                  </div>
                  {project.estimatedBudgetWon > 0 ? (
                    <p className="mt-4 text-sm text-fg-3">
                      {t("creatorSupport.project.budget")} ·{" "}
                      <strong className="text-fg">{formatWon(project.estimatedBudgetWon)}</strong>
                    </p>
                  ) : null}
                  <p className="mt-3 rounded-xl border border-line bg-panel/60 px-4 py-3 text-xs leading-5 text-fg-3">
                    {t(
                      project.monetarySupportEnabled
                        ? "creatorSupport.project.moneyReady"
                        : "creatorSupport.project.moneyPending",
                    )}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(project);
                        setOfferStatus("");
                      }}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent"
                    >
                      <HandHeart size={15} aria-hidden="true" />
                      {t("creatorSupport.project.offer")}
                    </button>
                    {project.portfolioUrl ? (
                      <a
                        href={project.portfolioUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-10 items-center rounded-xl border border-line px-4 text-sm font-semibold text-fg-2"
                      >
                        {t("creatorSupport.project.portfolio")}
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selected ? (
        <section className="mt-6 rounded-3xl border border-accent/30 bg-card p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-accent">PRIVATE OFFER</p>
              <h2 className="mt-1 text-xl font-bold text-fg">{t("creatorSupport.offer.title")}</h2>
              <p className="mt-2 text-sm text-fg-2">{selected.title} · {selected.creatorName}</p>
              <p className="mt-1 text-xs leading-5 text-fg-3">{t("creatorSupport.offer.description")}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-xl border border-line px-3 py-2 text-sm text-fg-2"
            >
              {t("creatorSupport.offer.close")}
            </button>
          </div>
          <form onSubmit={submitOffer} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-fg">
              {t("creatorSupport.offer.type")}
              <select
                value={offer.type}
                onChange={(event) =>
                  setOffer((current) => ({
                    ...current,
                    type: event.target.value as CreatorSupportOfferType,
                  }))
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3"
              >
                {CREATOR_SUPPORT_OFFER_TYPES.map((type) => (
                  <option key={type} value={type}>{t(NEED_KEY(type as CreatorSupportNeed))}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-fg">
              {t("creatorSupport.offer.email")}
              <input
                type="email"
                value={offer.contactEmail}
                onChange={(event) =>
                  setOffer((current) => ({ ...current, contactEmail: event.target.value }))
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3"
              />
            </label>
            <label className="sm:col-span-2 text-sm font-semibold text-fg">
              {t("creatorSupport.offer.message")}
              <textarea
                rows={4}
                maxLength={2000}
                value={offer.message}
                onChange={(event) =>
                  setOffer((current) => ({ ...current, message: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2"
              />
            </label>
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={offer.website}
              onChange={(event) =>
                setOffer((current) => ({ ...current, website: event.target.value }))
              }
              className="hidden"
            />
            <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-line bg-panel/60 p-3 text-sm text-fg-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={offer.consentAccepted}
                onChange={(event) =>
                  setOffer((current) => ({ ...current, consentAccepted: event.target.checked }))
                }
              />
              <span>{t("creatorSupport.offer.consent")}</span>
            </label>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={offerBusy}
                className="min-h-11 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent disabled:opacity-60"
              >
                {t("creatorSupport.offer.submit")}
              </button>
              {offerStatus ? <p className="text-sm text-fg-2">{offerStatus}</p> : null}
            </div>
          </form>
        </section>
      ) : null}

      {sessionStatus === "authenticated" ? (
        <section
          className="mt-8 rounded-3xl border border-line bg-card p-6 sm:p-8"
          aria-labelledby="creator-support-my-title"
        >
          <p className="text-xs font-bold tracking-[0.14em] text-accent">
            PRIVATE SUPPORT INBOX
          </p>
          <h2 id="creator-support-my-title" className="mt-1 text-2xl font-bold text-fg">
            {t("creatorSupport.mine.title")}
          </h2>
          <p className="mt-2 text-sm leading-7 text-fg-2">
            {t("creatorSupport.mine.description")}
          </p>
          {privateLoading ? (
            <p className="mt-5 text-sm text-fg-3">{t("creatorSupport.mine.loading")}</p>
          ) : (
            <div className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
              <article className="rounded-2xl border border-line bg-panel/55 p-5">
                <p className="text-xs font-bold text-fg-3">
                  {t("creatorSupport.mine.application")}
                </p>
                {myApplication ? (
                  <>
                    <h3 className="mt-2 font-bold text-fg">{myApplication.title}</h3>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-line bg-card px-2.5 py-1 text-fg-2">
                        {myApplication.status}
                      </span>
                      <span className="rounded-full border border-line bg-card px-2.5 py-1 text-fg-2">
                        {myApplication.payoutStatus}
                      </span>
                    </div>
                    {myApplication.reviewNote ? (
                      <p className="mt-3 rounded-xl border border-line bg-card p-3 text-sm leading-6 text-fg-2">
                        {myApplication.reviewNote}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-3 text-sm text-fg-3">
                    {t("creatorSupport.mine.noApplication")}
                  </p>
                )}
              </article>
              <article className="rounded-2xl border border-line bg-panel/55 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-fg-3">
                    {t("creatorSupport.mine.offers")}
                  </p>
                  <span className="text-xs text-fg-3">{receivedOffers.length}</span>
                </div>
                {receivedOffers.length ? (
                  <div className="mt-3 space-y-3">
                    {receivedOffers.map((received) => (
                      <div key={received.id} className="rounded-xl border border-line bg-card p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold text-fg">{received.type}</p>
                          <span className="text-[11px] font-semibold text-fg-3">
                            {received.status}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-fg-2">
                          {received.message}
                        </p>
                        <p className="mt-3 text-sm font-semibold text-accent">
                          {received.contactEmail}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-fg-3">{t("creatorSupport.mine.noOffers")}</p>
                )}
              </article>
            </div>
          )}
        </section>
      ) : (
        <section className="mt-8 rounded-3xl border border-line bg-panel/55 p-6">
          <p className="text-sm leading-6 text-fg-2">{t("creatorSupport.mine.signIn")}</p>
        </section>
      )}


      <section
        id="creator-support-apply"
        className="mt-8 rounded-3xl border border-line bg-card p-6 sm:p-8"
        aria-labelledby="creator-support-apply-title"
      >
        <p className="text-xs font-bold tracking-[0.14em] text-accent">APPLY FOR SUPPORT</p>
        <h2 id="creator-support-apply-title" className="mt-1 text-2xl font-bold text-fg">
          {t("creatorSupport.apply.title")}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-fg-2">
          {t("creatorSupport.apply.description")}
        </p>

        <form onSubmit={submitApplication} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-fg">
            {t("creatorSupport.apply.category")}
            <select
              value={application.category}
              onChange={(event) =>
                setApplication((current) => ({
                  ...current,
                  category: event.target.value as CreatorSupportCategory,
                }))
              }
              className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3"
            >
              {CREATOR_SUPPORT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {t(`creatorSupport.filters.${category}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-fg">
            {t("creatorSupport.apply.ageBand")}
            <select
              value={application.ageBand}
              onChange={(event) => {
                const ageBand = event.target.value as CreatorSupportAgeBand;
                setApplication((current) => ({
                  ...current,
                  ageBand,
                  applicantRole: ageBand === "under14_guardian" ? "guardian" : current.applicantRole,
                  guardianConfirmed: ageBand === "adult" ? false : current.guardianConfirmed,
                }));
              }}
              className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3"
            >
              <option value="adult">{t("creatorSupport.apply.ageAdult")}</option>
              <option value="youth_14_18">{t("creatorSupport.apply.ageYouth")}</option>
              <option value="under14_guardian">{t("creatorSupport.apply.ageUnder14")}</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-fg">
            {t("creatorSupport.apply.applicantRole")}
            <select
              value={application.applicantRole}
              disabled={application.ageBand === "under14_guardian"}
              onChange={(event) =>
                setApplication((current) => ({
                  ...current,
                  applicantRole: event.target.value as "self" | "guardian",
                }))
              }
              className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 disabled:opacity-60"
            >
              <option value="self">{t("creatorSupport.apply.self")}</option>
              <option value="guardian">{t("creatorSupport.apply.guardian")}</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-fg">
            {t("creatorSupport.apply.budget")}
            <input
              type="number"
              min={0}
              max={100000000}
              step={10000}
              value={application.estimatedBudgetWon}
              onChange={(event) =>
                setApplication((current) => ({
                  ...current,
                  estimatedBudgetWon: Number(event.target.value),
                }))
              }
              className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3"
            />
          </label>
          <label className="sm:col-span-2 text-sm font-semibold text-fg">
            {t("creatorSupport.apply.projectTitle")}
            <input
              maxLength={120}
              value={application.title}
              onChange={(event) =>
                setApplication((current) => ({ ...current, title: event.target.value }))
              }
              className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3"
            />
          </label>
          <label className="sm:col-span-2 text-sm font-semibold text-fg">
            {t("creatorSupport.apply.story")}
            <textarea
              rows={5}
              maxLength={3000}
              value={application.story}
              onChange={(event) =>
                setApplication((current) => ({ ...current, story: event.target.value }))
              }
              className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2"
            />
          </label>
          <label className="sm:col-span-2 text-sm font-semibold text-fg">
            {t("creatorSupport.apply.intendedUse")}
            <textarea
              rows={4}
              maxLength={2000}
              value={application.intendedUse}
              onChange={(event) =>
                setApplication((current) => ({ ...current, intendedUse: event.target.value }))
              }
              className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2"
            />
          </label>
          <label className="sm:col-span-2 text-sm font-semibold text-fg">
            {t("creatorSupport.apply.portfolio")}
            <input
              type="url"
              maxLength={500}
              value={application.portfolioUrl}
              onChange={(event) =>
                setApplication((current) => ({ ...current, portfolioUrl: event.target.value }))
              }
              className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3"
            />
          </label>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-semibold text-fg">
              {t("creatorSupport.apply.needs")}
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {CREATOR_SUPPORT_NEEDS.map((need) => (
                <label key={need} className="flex items-center gap-2 rounded-xl border border-line bg-panel/60 px-3 py-2 text-sm text-fg-2">
                  <input
                    type="checkbox"
                    checked={application.supportNeeds.includes(need)}
                    onChange={() => toggleNeed(need)}
                  />
                  {t(NEED_KEY(need))}
                </label>
              ))}
            </div>
          </fieldset>
          {application.ageBand !== "adult" ? (
            <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-line bg-panel/60 p-3 text-sm leading-6 text-fg-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={application.guardianConfirmed}
                onChange={(event) =>
                  setApplication((current) => ({
                    ...current,
                    guardianConfirmed: event.target.checked,
                  }))
                }
              />
              <span>{t("creatorSupport.apply.guardianConfirm")}</span>
            </label>
          ) : null}
          <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-line bg-panel/60 p-3 text-sm leading-6 text-fg-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={application.consentAccepted}
              onChange={(event) =>
                setApplication((current) => ({
                  ...current,
                  consentAccepted: event.target.checked,
                }))
              }
            />
            <span>{t("creatorSupport.apply.consent")}</span>
          </label>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={applicationBusy}
              className="min-h-11 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent disabled:opacity-60"
            >
              {t("creatorSupport.apply.submit")}
            </button>
            {applicationStatus ? (
              <p className="text-sm text-fg-2">{applicationStatus}</p>
            ) : null}
          </div>
        </form>
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-panel/55 p-6 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-accent">
            <ShieldCheck size={19} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-fg">{t("creatorSupport.safety.title")}</h2>
            <p className="mt-2 text-sm leading-7 text-fg-2">{t("creatorSupport.safety.body")}</p>
            <p className="mt-3 text-sm leading-7 text-fg-3">{t("creatorSupport.safety.money")}</p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
              <Link href="/privacy" className="text-accent hover:underline">Privacy</Link>
              <Link href="/business?type=sponsorship" className="text-accent hover:underline">
                <BriefcaseBusiness size={14} className="mr-1 inline" aria-hidden="true" />
                Sponsorship
              </Link>
            </div>
          </div>
        </div>
      </section>
    </Container>
  );
}
