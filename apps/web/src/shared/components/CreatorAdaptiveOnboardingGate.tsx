import {
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText,
  translateLocaleBranchForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LayoutDashboard,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useSession } from "@/compat/auth-session-store";
import { getMyProfile, updateMyProfile, type MeProfile } from "@/infrastructure/me-client";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  CREATOR_ROLE_DEFINITIONS,
  CREATOR_ROLE_MAX_SECONDARY,
  CREATOR_STAGE_IDS,
  CREATOR_STAGE_LABELS,
  creatorRoleDefinition,
  creatorRoleSelection,
  creatorText,
  normalizeCreatorRoleProfile,
  type CreatorRoleId,
  type CreatorRoleLocale,
  type CreatorStage,
} from "@/shared/lib/creator-role-contract";
import { creatorRoleExperience } from "@/shared/lib/creator-role-experience";
import {
  CREATOR_ROLE_USAGE_GOALS,
  GLOBAL_CREATOR_ROLE_WORKSPACE_KEY,
  creatorDetailedRoleLens,
  creatorRoleStudioWorkspace,
  normalizeCreatorRoleWorkspacePreference,
  type CreatorRoleUsageGoal,
  type CreatorWorkspaceMode,
} from "@/shared/lib/creator-role-workspace-contract";
import { useCreatorRoleWorkspace } from "@/shared/lib/use-creator-role-workspace";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

const GOAL_LABELS: Readonly<Record<CreatorRoleUsageGoal, { ko: string; en: string }>> = {
  learning: { ko: "웹툰 제작 배우기", en: "Learn webtoon production" },
  "first-project": { ko: "첫 작품 만들기", en: "Create my first project" },
  "personal-project": { ko: "개인 작품 제작", en: "Personal project" },
  serialization: { ko: "연재 작품 제작", en: "Serialized production" },
  "drawing-practice": { ko: "그림·작화 연습", en: "Drawing practice" },
  "story-writing": { ko: "스토리·대본 집필", en: "Story writing" },
  "character-building": { ko: "캐릭터 제작", en: "Character creation" },
  "team-production": { ko: "팀 협업", en: "Team production" },
  portfolio: { ko: "포트폴리오 제작", en: "Portfolio" },
  "studio-management": { ko: "제작팀 관리", en: "Studio management" },
  education: { ko: "학생 교육·수업", en: "Teaching & education" },
  outsourcing: { ko: "외주 작업", en: "Freelance work" },
};

const MODE_COPY: Readonly<Record<CreatorWorkspaceMode, {
  ko: string;
  en: string;
  descriptionKo: string;
  descriptionEn: string;
}>> = {
  guided: {
    ko: "Guided",
    en: "Guided",
    descriptionKo: "큰 동선과 설명, 학습 도움을 더 많이 보여줍니다.",
    descriptionEn: "Shows clearer actions, explanations and learning help.",
  },
  creator: {
    ko: "Creator",
    en: "Creator",
    descriptionKo: "창작 도구와 안내의 균형을 맞춘 기본 작업 환경입니다.",
    descriptionEn: "Balances creation tools with lightweight guidance.",
  },
  production: {
    ko: "Production",
    en: "Production",
    descriptionKo: "현업 제작을 위해 정보 밀도와 빠른 작업 동선을 높입니다.",
    descriptionEn: "Increases information density and fast production paths.",
  },
};

const STEP_LABELS = [
  { ko: "활동 단계", en: "Stage" },
  { ko: "역할", en: "Roles" },
  { ko: "목적", en: "Goals" },
  { ko: "화면", en: "Workspace" },
  { ko: "미리보기", en: "Preview" },
] as const;

function localized(locale: CreatorRoleLocale, ko: string, en: string): string {
  return translateBilingualValueForLocale(locale, "shared.components.CreatorAdaptiveOnboardingGate", ko, en);
}

function selectedRoleLabel(role: CreatorRoleId, locale: CreatorRoleLocale): string {
  const definition = creatorRoleDefinition(role);
  return definition ? creatorText(definition.shortLabel, locale) : role;
}

function toggleDistinct<T>(values: readonly T[], value: T, maximum: number): T[] {
  if (values.includes(value)) return values.filter((entry) => entry !== value);
  if (values.length >= maximum) return [...values];
  return [...values, value];
}

export function CreatorAdaptiveOnboardingGate({ enabled = true }: { readonly enabled?: boolean }) {
  const { status } = useSession();
  const locale: CreatorRoleLocale = useI18n((state) => state.lang);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState<CreatorStage | null>(null);
  const [roles, setRoles] = useState<readonly CreatorRoleId[]>([]);
  const [primaryRole, setPrimaryRole] = useState<CreatorRoleId | null>(null);
  const [goals, setGoals] = useState<readonly CreatorRoleUsageGoal[]>([]);
  const [workspaceMode, setWorkspaceMode] = useState<CreatorWorkspaceMode>("creator");
  const [saving, setSaving] = useState(false);

  const workspace = useCreatorRoleWorkspace(
    GLOBAL_CREATOR_ROLE_WORKSPACE_KEY,
    profile?.creatorRoleProfile,
    status === "authenticated",
  );

  useEffect(() => {
    if (status !== "authenticated") {
      setProfile(null);
      setInitializedFor(null);
      setDismissed(false);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    setProfileLoading(true);
    setProfileError(null);
    getMyProfile(controller.signal)
      .then((next) => {
        if (alive) setProfile(next);
      })
      .catch((cause: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setProfileError(cause instanceof Error
          ? cause.message
          : localized(locale, "개인화 설정을 불러오지 못했습니다.", "Could not load personalization settings."));
      })
      .finally(() => {
        if (alive) setProfileLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [locale, status]);

  useEffect(() => {
    if (!profile || initializedFor === profile.id) return;
    if (workspace.status === "idle" || workspace.status === "loading") return;
    const selected = creatorRoleSelection(profile.creatorRoleProfile);
    setStage(profile.creatorRoleProfile.creatorStage);
    setRoles(selected);
    setPrimaryRole(profile.creatorRoleProfile.primaryRole ?? selected[0] ?? null);
    setGoals(workspace.snapshot.document.usageGoals);
    setWorkspaceMode(workspace.snapshot.document.workspaceMode);
    setInitializedFor(profile.id);
  }, [initializedFor, profile, workspace.snapshot.document, workspace.status]);

  const needsOnboarding = Boolean(
    profile
    && initializedFor === profile.id
    && (
      !profile.creatorRoleProfile.creatorStage
      || !profile.creatorRoleProfile.primaryRole
      || !workspace.snapshot.document.onboardingComplete
    )
  );
  const visible = enabled
    && status === "authenticated"
    && !profileLoading
    && needsOnboarding
    && !dismissed;

  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [visible]);

  const primaryDefinition = creatorRoleDefinition(primaryRole);
  const experience = useMemo(
    () => creatorRoleExperience(primaryRole),
    [primaryRole],
  );
  const canContinue = step === 0
    ? stage !== null
    : step === 1
      ? roles.length > 0 && primaryRole !== null
      : true;

  const toggleRole = (role: CreatorRoleId) => {
    const next = toggleDistinct(roles, role, CREATOR_ROLE_MAX_SECONDARY + 1);
    setRoles(next);
    if (!next.includes(primaryRole as CreatorRoleId)) setPrimaryRole(next[0] ?? null);
    else if (!primaryRole && next.length > 0) setPrimaryRole(next[0]!);
  };

  const complete = async () => {
    if (!profile || !stage || !primaryRole || roles.length === 0 || saving) return;
    setSaving(true);
    setProfileError(null);
    try {
      const roleProfile = normalizeCreatorRoleProfile({
        ...profile.creatorRoleProfile,
        creatorStage: stage,
        primaryRole,
        secondaryRoles: roles.filter((role) => role !== primaryRole),
        activeRole: primaryRole,
      });
      const updated = await updateMyProfile({ creatorRoleProfile: roleProfile });
      setProfile(updated);
      await workspace.save(normalizeCreatorRoleWorkspacePreference({
        ...workspace.snapshot.document,
        activeRole: primaryRole,
        detailedLens: creatorDetailedRoleLens(primaryRole),
        workspacePreset: creatorRoleStudioWorkspace(primaryRole),
        usageGoals: goals,
        workspaceMode,
        onboardingComplete: true,
      }));
    } catch (cause) {
      setProfileError(cause instanceof Error
        ? cause.message
        : localized(locale, "작업 환경을 저장하지 못했습니다.", "Could not save your workspace."));
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="adaptive-onboarding-title"
        tabIndex={-1}
        className="flex max-h-[min(92dvh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-line bg-card shadow-2xl outline-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-accent">
              <Sparkles size={15} aria-hidden="true" />
              <p className="text-[0.68rem] font-black uppercase tracking-[0.16em]">{translateCurrentStaticSourceText("shared.components.CreatorAdaptiveOnboardingGate", "en", "ADAPTIVE WORKSPACE")}</p>
            </div>
            <h1 id="adaptive-onboarding-title" className="mt-1 text-xl font-black tracking-tight text-fg sm:text-2xl">
              {localized(locale, "나에게 맞는 작업 환경 만들기", "Build a workspace around how you create")}
            </h1>
            <p className="mt-1 text-xs leading-5 text-fg-2 sm:text-sm">
              {localized(locale, "기능을 없애지 않고 홈·메뉴·도움말의 우선순위만 조정합니다. 설정에서 언제든 다시 바꿀 수 있습니다.", "We never remove tools—only tune home, menu and guidance priority. You can change everything later.")}
            </p>
          </div>
          <button
            type="button"
            aria-label={localized(locale, "나중에 설정", "Set up later")}
            onClick={() => setDismissed(true)}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-fg-2 hover:bg-raised hover:text-fg"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="shrink-0 px-5 pt-4 sm:px-7">
          <ol className="grid grid-cols-5 gap-1.5" aria-label={localized(locale, "설정 진행 단계", "Setup progress")}>
            {STEP_LABELS.map((label, index) => (
              <li key={label.en} className="min-w-0">
                <div className={cn(
                  "h-1.5 rounded-full",
                  index <= step ? "bg-accent" : "bg-raised",
                )} />
                <p className={cn(
                  "mt-1 truncate text-center text-[0.62rem] font-bold",
                  index === step ? "text-accent" : "text-fg-3",
                )}>
                  {localized(locale, label.ko, label.en)}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          {step === 0 ? (
            <section aria-labelledby="creator-stage-title">
              <h2 id="creator-stage-title" className="text-lg font-black text-fg">
                {localized(locale, "지금 나와 가장 가까운 상태는 무엇인가요?", "Which stage best describes you right now?")}
              </h2>
              <p className="mt-1 text-sm text-fg-2">
                {localized(locale, "실력 등급이 아니라 안내 수준과 추천 콘텐츠를 조정하는 기준입니다.", "This is not a skill score. It only tunes guidance and recommendations.")}
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {CREATOR_STAGE_IDS.map((id) => {
                  const selected = stage === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setStage(id)}
                      className={cn(
                        "flex min-h-20 items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors",
                        selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-fg hover:border-accent/35",
                      )}
                    >
                      <span className="text-sm font-black">{creatorText(CREATOR_STAGE_LABELS[id], locale)}</span>
                      {selected ? <Check size={16} aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section aria-labelledby="creator-role-title">
              <h2 id="creator-role-title" className="text-lg font-black text-fg">
                {localized(locale, "어떤 역할을 하고 있나요?", "What roles do you work in?")}
              </h2>
              <p className="mt-1 text-sm text-fg-2">
                {localized(locale, "여러 역할을 선택하고 대표 역할 하나를 지정하세요. 프로젝트별 실제 권한은 별도로 유지됩니다.", "Choose multiple roles and one primary role. Project permissions remain separate.")}
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {CREATOR_ROLE_DEFINITIONS.map((definition) => {
                  const selected = roles.includes(definition.id);
                  return (
                    <button
                      key={definition.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleRole(definition.id)}
                      className={cn(
                        "min-h-24 rounded-2xl border p-4 text-left transition-colors",
                        selected ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-accent/35",
                      )}
                    >
                      <span className={cn("text-sm font-black", selected ? "text-accent" : "text-fg")}>{creatorText(definition.label, locale)}</span>
                      <span className="mt-1.5 block text-[0.72rem] leading-5 text-fg-2">{creatorText(definition.description, locale)}</span>
                    </button>
                  );
                })}
              </div>
              {roles.length > 0 ? (
                <label className="mt-4 block text-xs font-bold text-fg-2">
                  {localized(locale, "대표 역할", "Primary role")}
                  <select
                    value={primaryRole ?? ""}
                    onChange={(event) => setPrimaryRole(event.currentTarget.value as CreatorRoleId)}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-fg"
                  >
                    {roles.map((role) => <option key={role} value={role}>{selectedRoleLabel(role, locale)}</option>)}
                  </select>
                </label>
              ) : null}
            </section>
          ) : null}

          {step === 2 ? (
            <section aria-labelledby="creator-goal-title">
              <h2 id="creator-goal-title" className="text-lg font-black text-fg">
                {localized(locale, "ToonSpectrum에서 무엇을 하고 싶나요?", "What do you want to do in ToonSpectrum?")}
              </h2>
              <p className="mt-1 text-sm text-fg-2">
                {localized(locale, "복수 선택할 수 있으며 홈의 추천 카드와 빠른 실행 순서에 반영됩니다.", "Choose multiple goals. They tune recommendation cards and quick actions.")}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {CREATOR_ROLE_USAGE_GOALS.map((goal) => {
                  const selected = goals.includes(goal);
                  return (
                    <button
                      key={goal}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setGoals((current) => toggleDistinct(current, goal, CREATOR_ROLE_USAGE_GOALS.length))}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors",
                        selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-fg-2 hover:border-accent/35 hover:text-fg",
                      )}
                    >
                      {selected ? <Check size={14} aria-hidden="true" /> : null}
                      {translateLocaleBranchForLocale(locale, "shared.components.CreatorAdaptiveOnboardingGate", GOAL_LABELS[goal])}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section aria-labelledby="creator-workspace-mode-title">
              <h2 id="creator-workspace-mode-title" className="text-lg font-black text-fg">
                {localized(locale, "어떤 작업 화면을 선호하나요?", "What kind of workspace do you prefer?")}
              </h2>
              <p className="mt-1 text-sm text-fg-2">
                {localized(locale, "기능 접근 권한은 동일하며 정보 밀도와 안내 수준만 달라집니다.", "Tool access stays the same; only information density and guidance change.")}
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {(["guided", "creator", "production"] as const).map((mode) => {
                  const selected = workspaceMode === mode;
                  const copy = MODE_COPY[mode];
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setWorkspaceMode(mode)}
                      className={cn(
                        "min-h-40 rounded-2xl border p-5 text-left transition-colors",
                        selected ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-accent/35",
                      )}
                    >
                      <LayoutDashboard size={20} className={selected ? translateCurrentStaticSourceText("shared.components.CreatorAdaptiveOnboardingGate", "en", "text-accent") : translateCurrentStaticSourceText("shared.components.CreatorAdaptiveOnboardingGate", "en", "text-fg-3")} aria-hidden="true" />
                      <span className={cn("mt-4 block text-base font-black", selected ? "text-accent" : "text-fg")}>{localized(locale, copy.ko, copy.en)}</span>
                      <span className="mt-2 block text-xs leading-5 text-fg-2">{localized(locale, copy.descriptionKo, copy.descriptionEn)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {step === 4 ? (
            <section aria-labelledby="creator-preview-title">
              <h2 id="creator-preview-title" className="text-lg font-black text-fg">
                {localized(locale, "내 작업 환경 미리보기", "Preview your workspace")}
              </h2>
              <p className="mt-1 text-sm text-fg-2">
                {localized(locale, "저장하면 이 구성을 기본값으로 사용합니다. 프로젝트 역할이 있는 경우 프로젝트 역할이 우선합니다.", "This becomes your default. A project-specific role takes priority inside that project.")}
              </p>
              <div className="mt-5 overflow-hidden rounded-3xl border border-accent/30 bg-panel">
                <div className="border-b border-line bg-accent-soft/40 p-5 sm:p-6">
                  <div className="flex flex-wrap gap-2 text-[0.7rem] font-bold">
                    {stage ? <span className="rounded-full bg-card px-3 py-1 text-fg-2">{creatorText(CREATOR_STAGE_LABELS[stage], locale)}</span> : null}
                    {primaryDefinition ? <span className="rounded-full bg-accent px-3 py-1 text-on-accent">{creatorText(primaryDefinition.label, locale)}</span> : null}
                    <span className="rounded-full bg-card px-3 py-1 text-fg-2">{translateLocaleBranchForLocale(locale, "shared.components.CreatorAdaptiveOnboardingGate", MODE_COPY[workspaceMode])}</span>
                  </div>
                  <h3 className="mt-4 text-xl font-black text-fg">
                    {primaryDefinition ? creatorText(primaryDefinition.workspaceTitle, locale) : localized(locale, "내 작업실", "My workspace")}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-fg-2">
                    {primaryDefinition ? creatorText(primaryDefinition.workspaceSummary, locale) : localized(locale, "대표 역할을 선택하면 맞춤 작업실을 미리 볼 수 있습니다.", "Choose a primary role to preview your workspace.")}
                  </p>
                </div>
                <div className={cn("grid gap-3 p-4 sm:p-5", workspaceMode === "production" ? "lg:grid-cols-[0.8fr_1.2fr]" : "lg:grid-cols-[1fr_1.4fr]")}>
                  <div className="rounded-2xl border border-accent/30 bg-accent-soft/30 p-4">
                    <p className="text-[0.66rem] font-black uppercase tracking-[0.14em] text-accent">{translateCurrentStaticSourceText("shared.components.CreatorAdaptiveOnboardingGate", "en", "PRIMARY ACTION")}</p>
                    <p className="mt-2 text-sm font-black text-fg">{localized(locale, experience.primaryAction.labelKo, experience.primaryAction.labelEn)}</p>
                    {workspaceMode !== "production" ? <p className="mt-1 text-xs leading-5 text-fg-2">{localized(locale, experience.primaryAction.descriptionKo, experience.primaryAction.descriptionEn)}</p> : null}
                  </div>
                  <div className={cn("grid gap-2", workspaceMode === "production" ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
                    {experience.navigation.slice(0, workspaceMode === "production" ? 6 : 4).map((item) => (
                      <div key={item.id} className="rounded-xl border border-line bg-card p-3">
                        <p className="text-xs font-black text-fg">{localized(locale, item.labelKo, item.labelEn)}</p>
                        {workspaceMode === "guided" ? <p className="mt-1 text-[0.68rem] leading-5 text-fg-3">{localized(locale, item.descriptionKo, item.descriptionEn)}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-fg-3">
                {localized(locale, "전체 도구는 항상 ‘모든 도구’와 검색에서 접근할 수 있습니다. 개인화는 기능을 숨기거나 권한을 변경하지 않습니다.", "All tools remain available through All Tools and search. Personalization never removes capabilities or changes permissions.")}
              </p>
            </section>
          ) : null}

          {profileError || workspace.error ? (
            <p className="mt-5 rounded-xl border border-bad/35 bg-bad/10 px-3 py-2 text-xs font-semibold text-bad" role="alert">
              {profileError ?? workspace.error}
            </p>
          ) : null}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-panel/70 px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className={buttonClass({ variant: "quiet", size: "sm" })}
          >
            {localized(locale, "나중에 설정", "Set up later")}
          </button>
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => setStep((current) => Math.max(0, current - 1))}
                className={buttonClass({ variant: "quiet", size: "sm", className: "gap-1.5" })}
              >
                <ArrowLeft size={14} aria-hidden="true" />
                {localized(locale, "이전", "Back")}
              </button>
            ) : null}
            {step < STEP_LABELS.length - 1 ? (
              <button
                type="button"
                disabled={!canContinue || saving}
                onClick={() => setStep((current) => Math.min(STEP_LABELS.length - 1, current + 1))}
                className={buttonClass({ size: "sm", className: "gap-1.5" })}
              >
                {localized(locale, "다음", "Next")}
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                disabled={!stage || !primaryRole || saving}
                onClick={() => void complete()}
                className={buttonClass({ size: "sm", className: "gap-1.5" })}
              >
                {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
                {localized(locale, "이 작업실로 시작", "Start with this workspace")}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

export default CreatorAdaptiveOnboardingGate;
