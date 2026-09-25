import {
  translateBilingualValueForActiveLocale,
  translateCurrentStaticSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Loader2,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";

import Link from "@/shared/navigation/router-link";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { getMyProfile, updateMyProfile, type MeProfile } from "@/platform/me-client";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  creatorRoleDefinition,
  creatorRoleSelection,
  creatorText,
  normalizeCreatorRoleProfile,
  type CreatorExperienceLevel,
  type CreatorRoleId,
  type CreatorRoleLocale,
} from "@/shared/lib/creator-role-contract";
import { creatorRoleExperience } from "@/shared/lib/creator-role-experience";
import {
  GLOBAL_CREATOR_ROLE_WORKSPACE_KEY,
  creatorExperienceLevelFromLegacyStage,
  creatorWorkspaceStudioUiMode,
  type CreatorWorkspaceMode,
} from "@/shared/lib/creator-role-workspace-contract";
import { useCreatorRoleWorkspace } from "@/shared/lib/use-creator-role-workspace";
import { cn } from "@/shared/lib/utils";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioRoleWorkspacePanel", ko, en);

const ACCOUNT_CONTEXT_LABELS = {
  individual: { ko: "개인", en: "Individual" },
  education: { ko: "교육", en: "Education" },
  studio: { ko: "팀 · 스튜디오", en: "Team · Studio" },
} as const;

const EXPERIENCE_LABELS: Readonly<Record<CreatorExperienceLevel, { ko: string; en: string }>> = {
  beginner: { ko: "입문", en: "Beginner" },
  experienced: { ko: "경험 있음", en: "Experienced" },
  professional: { ko: "현업 · 전문", en: "Professional" },
};

function localized(_locale: CreatorRoleLocale, ko: string, en: string): string {
  return bi(ko, en);
}

function hrefForWorkspaceMode(href: string, mode: CreatorWorkspaceMode): string {
  if (!href.startsWith("/studio")) return href;
  const [pathname, query = ""] = href.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("uiMode", creatorWorkspaceStudioUiMode(mode));
  return `${pathname}?${params.toString()}`;
}

export function StudioRoleWorkspacePanel({
  locale,
}: {
  readonly locale: CreatorRoleLocale;
}) {
  useBilingualI18nRevision();
  const { status } = useSession();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingRole, setSavingRole] = useState<CreatorRoleId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const globalWorkspace = useCreatorRoleWorkspace(
    GLOBAL_CREATOR_ROLE_WORKSPACE_KEY,
    profile?.creatorRoleProfile,
    status === "authenticated",
  );

  useEffect(() => {
    if (status !== "authenticated") {
      setProfile(null);
      setLoading(false);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getMyProfile(controller.signal)
      .then((result) => {
        if (alive) setProfile(result);
      })
      .catch((cause: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : localized(locale, "직무 설정을 불러오지 못했습니다.", "Could not load role settings."));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [locale, status]);

  if (status !== "authenticated") return null;

  if (loading) {
    return (
      <section className="mt-7 overflow-hidden rounded-3xl border border-line bg-card p-5 sm:p-6" aria-label={localized(locale, "직무별 작업 화면 불러오는 중", "Loading role workspace")}>
        <div className="flex items-center gap-3">
          <span className="skeleton block size-11 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <span className="skeleton block h-4 w-36" />
            <span className="skeleton block h-3 w-2/3" />
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <span key={index} className="skeleton block h-24 rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  if (!profile?.creatorRoleProfile.primaryRole) {
    return (
      <section className="mt-7 overflow-hidden rounded-3xl border border-accent/30 bg-accent-soft/30 p-5 sm:p-6" aria-labelledby="studio-role-setup-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-accent/30 bg-card text-accent">
              <BriefcaseBusiness size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[0.68rem] font-black uppercase tracking-[0.15em] text-accent">{translateCurrentStaticSourceText("domains.creator.studio.shell.StudioRoleWorkspacePanel", "en", "ROLE WORKSPACE")}</p>
              <h2 id="studio-role-setup-title" className="mt-1 text-lg font-black text-fg">
                {localized(locale, "내 직무에 맞는 작업 화면을 설정하세요", "Set up a workspace for your role")}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">
                {localized(
                  locale,
                  "글작가, 그림작가, 어시스턴트, 기획자, 프로듀서 등 실제 맡은 일을 선택하면 시작 동선과 추천 도구가 달라집니다.",
                  "Choose the work you actually do—writer, artist, assistant, planner or producer—to personalize starting paths and recommended tools.",
                )}
              </p>
              {error ? <p className="mt-2 text-xs font-semibold text-bad">{error}</p> : null}
            </div>
          </div>
          <Link href="/me?tab=profile" className={buttonClass({ className: "shrink-0 gap-2" })}>
            <Settings2 size={15} aria-hidden="true" />
            {localized(locale, "직무 설정", "Set roles")}
          </Link>
        </div>
      </section>
    );
  }

  const roleProfile = profile.creatorRoleProfile;
  const activeRole = roleProfile.activeRole ?? roleProfile.primaryRole;
  const activeDefinition = creatorRoleDefinition(activeRole);
  const selectedRoles = creatorRoleSelection(roleProfile);
  if (!activeDefinition) return null;
  const experience = creatorRoleExperience(activeRole);
  const workspaceMode = globalWorkspace.snapshot.document.workspaceMode;
  const accountContext = globalWorkspace.snapshot.document.accountContext;
  const resolvedExperienceLevel = roleProfile.experienceLevel
    ?? creatorExperienceLevelFromLegacyStage(roleProfile.creatorStage);
  const experienceLabel = resolvedExperienceLevel
    ? localized(locale, EXPERIENCE_LABELS[resolvedExperienceLevel].ko, EXPERIENCE_LABELS[resolvedExperienceLevel].en)
    : null;
  const contextAssist = accountContext === "studio"
    ? {
        title: localized(locale, "팀 제작 흐름을 바로 확인하세요", "Open your team production flow"),
        description: localized(locale, "배정·마감·검수·인계 상태를 Production에서 우선 확인합니다.", "Review assignments, deadlines, reviews and handoffs in Production."),
        href: "/production",
        action: localized(locale, "Production 열기", "Open Production"),
      }
    : accountContext === "education"
      ? {
          title: localized(locale, "학습과 실습을 제작 흐름에 연결하세요", "Connect learning directly to practice"),
          description: localized(locale, "교육 자료와 실습 프로젝트를 오가며 같은 전문 도구를 사용할 수 있습니다.", "Move between learning resources and practice projects while keeping the same professional tools."),
          href: "/learn",
          action: localized(locale, "교육 자료 보기", "Browse learning resources"),
        }
      : workspaceMode === "guided"
        ? {
            title: localized(locale, "필요할 때 배우고 바로 실습하세요", "Learn only when you need it, then practice immediately"),
            description: localized(locale, "Guided 모드는 설명과 추천 학습 동선을 더 보여주지만 모든 전문 도구는 그대로 사용할 수 있습니다.", "Guided mode surfaces explanations and learning paths while keeping every professional tool available."),
            href: "/learn",
            action: localized(locale, "교육 자료 보기", "Browse learning resources"),
          }
        : null;

  const changeRole = async (role: CreatorRoleId) => {
    if (role === activeRole || savingRole) return;
    const previous = profile;
    const nextRoleProfile = normalizeCreatorRoleProfile({ ...roleProfile, activeRole: role });
    setSavingRole(role);
    setError(null);
    setProfile({ ...profile, creatorRoleProfile: nextRoleProfile });
    try {
      const updated = await updateMyProfile({ creatorRoleProfile: nextRoleProfile });
      setProfile(updated);
    } catch (cause) {
      setProfile(previous);
      setError(cause instanceof Error ? cause.message : localized(locale, "작업 모드를 바꾸지 못했습니다.", "Could not change workspace mode."));
    } finally {
      setSavingRole(null);
    }
  };

  return (
    <section
      className={cn(
        "relative mt-7 overflow-hidden rounded-3xl border border-accent/30 bg-card shadow-sm",
        workspaceMode === "production" && "border-line-strong",
      )}
      aria-labelledby="studio-role-workspace-title"
      data-workspace-mode={workspaceMode}
    >
      <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
      <div className="relative p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="flex items-center gap-2 text-accent">
              <Sparkles size={15} aria-hidden="true" />
              <p className="text-[0.68rem] font-black uppercase tracking-[0.15em]">{translateCurrentStaticSourceText("domains.creator.studio.shell.StudioRoleWorkspacePanel", "en", "ROLE WORKSPACE")}</p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h2 id="studio-role-workspace-title" className="text-xl font-black tracking-tight text-fg sm:text-2xl">
                {creatorText(activeDefinition.workspaceTitle, locale)}
              </h2>
              <span className="inline-flex min-h-7 items-center rounded-full border border-accent/35 bg-accent-soft px-2.5 text-xs font-black text-accent">
                {creatorText(activeDefinition.label, locale)}
              </span>
              <span className="inline-flex min-h-7 items-center rounded-full border border-line bg-panel px-2.5 text-xs font-bold text-fg-2">
                {localized(locale, ACCOUNT_CONTEXT_LABELS[accountContext].ko, ACCOUNT_CONTEXT_LABELS[accountContext].en)}
              </span>
              {experienceLabel ? (
                <span className="inline-flex min-h-7 items-center rounded-full border border-line bg-panel px-2.5 text-xs font-bold text-fg-2">
                  {experienceLabel}
                </span>
              ) : null}
              <span className="inline-flex min-h-7 items-center rounded-full border border-line bg-panel px-2.5 text-xs font-bold text-fg-2">
                {workspaceMode === "guided" ? translateCurrentStaticSourceText("domains.creator.studio.shell.StudioRoleWorkspacePanel", "en", "Guided") : workspaceMode === "production" ? translateCurrentStaticSourceText("domains.creator.studio.shell.StudioRoleWorkspacePanel", "en", "Production") : translateCurrentStaticSourceText("domains.creator.studio.shell.StudioRoleWorkspacePanel", "en", "Creator")}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-fg-2">
              {creatorText(activeDefinition.workspaceSummary, locale)}
            </p>
          </div>
          <Link href="/me?tab=profile" className={buttonClass({ variant: "quiet", size: "sm", className: "shrink-0 gap-1.5" })}>
            <Settings2 size={14} aria-hidden="true" />
            {localized(locale, "직무 편집", "Edit roles")}
          </Link>
        </div>

        {selectedRoles.length > 1 ? (
          <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label={localized(locale, "작업 모드 선택", "Select workspace mode")}>
            <span className="mr-1 text-[0.7rem] font-bold text-fg-3">
              {localized(locale, "현재 관점", "Current lens")}
            </span>
            {selectedRoles.map((role) => {
              const definition = creatorRoleDefinition(role);
              if (!definition) return null;
              const selected = role === activeRole;
              return (
                <button
                  key={role}
                  type="button"
                  aria-pressed={selected}
                  disabled={Boolean(savingRole)}
                  onClick={() => void changeRole(role)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors disabled:cursor-wait disabled:opacity-60",
                    selected
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-panel text-fg-2 hover:border-accent/35 hover:text-fg",
                  )}
                >
                  {savingRole === role ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : selected ? <CheckCircle2 size={12} aria-hidden="true" /> : null}
                  {creatorText(definition.shortLabel, locale)}
                </button>
              );
            })}
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-xs font-semibold text-bad" role="alert">
            {error}
          </p>
        ) : null}

        <div className={cn(
          "mt-5 grid gap-3",
          workspaceMode === "production"
            ? "xl:grid-cols-[minmax(15rem,0.7fr)_minmax(0,1.8fr)]"
            : "xl:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.65fr)]",
        )}>
          <Link
            href={hrefForWorkspaceMode(experience.primaryAction.href, workspaceMode)}
            className={cn(
              "group flex flex-col justify-between rounded-2xl border border-accent/35 bg-accent-soft/45 p-5 transition-all hover:-translate-y-0.5 hover:border-accent/55 hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transform-none",
              workspaceMode === "production" ? "min-h-36" : "min-h-44",
            )}
          >
            <div>
              <p className="text-[0.66rem] font-black uppercase tracking-[0.15em] text-accent">{translateCurrentStaticSourceText("domains.creator.studio.shell.StudioRoleWorkspacePanel", "en", "TODAY · PRIMARY ACTION")}</p>
              <h3 className="mt-3 text-lg font-black text-fg">
                {localized(locale, experience.primaryAction.labelKo, experience.primaryAction.labelEn)}
              </h3>
              {workspaceMode !== "production" ? (
                <p className="mt-2 text-sm leading-6 text-fg-2">
                  {localized(locale, experience.primaryAction.descriptionKo, experience.primaryAction.descriptionEn)}
                </p>
              ) : null}
            </div>
            <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-black text-accent">
              {localized(locale, "바로 이어가기", "Resume now")}
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </span>
          </Link>

          <nav
            aria-label={localized(locale, "직무별 주요 메뉴", "Role navigation")}
            className={cn("grid gap-2", workspaceMode === "production" ? "sm:grid-cols-3" : "sm:grid-cols-2")}
          >
            {experience.navigation.map((item, index) => (
              <Link
                key={`${experience.role}-${item.id}`}
                href={hrefForWorkspaceMode(item.href, workspaceMode)}
                className={cn(
                  "group flex items-start gap-3 rounded-2xl border border-line bg-panel p-3.5 transition-colors hover:border-accent/40 hover:bg-raised",
                  workspaceMode === "production" ? "min-h-16" : "min-h-20",
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-card text-[0.68rem] font-black text-accent">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-black text-fg">{localized(locale, item.labelKo, item.labelEn)}</span>
                  {workspaceMode !== "production" ? (
                    <span className="mt-1 block text-[0.7rem] leading-5 text-fg-3">{localized(locale, item.descriptionKo, item.descriptionEn)}</span>
                  ) : null}
                </span>
                <ArrowRight size={13} className="mt-1 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </div>

        {contextAssist ? (
          <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <Sparkles size={16} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-black text-fg">{contextAssist.title}</p>
                <p className="mt-1 text-[0.7rem] leading-5 text-fg-3">{contextAssist.description}</p>
              </div>
            </div>
            <Link href={contextAssist.href} className={buttonClass({ variant: "quiet", size: "sm", className: "shrink-0 gap-1.5" })}>
              {contextAssist.action}
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
