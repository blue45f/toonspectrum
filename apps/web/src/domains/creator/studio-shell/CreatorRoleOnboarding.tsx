import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { updateMyProfile, type MeProfile } from "@/platform/me-client";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  CREATOR_ROLE_DEFINITIONS,
  CREATOR_SPECIALTY_DEFINITIONS,
  CREATOR_USAGE_PURPOSE_DEFINITIONS,
  creatorRoleDefinition,
  creatorRoleSelection,
  creatorText,
  normalizeCreatorRoleProfile,
  recommendedCreatorSpecialties,
  withCreatorRoleOnboarding,
  type CreatorRoleId,
  type CreatorRoleLocale,
  type CreatorRoleProfile,
  type CreatorRoleVisibility,
  type CreatorSpecialtyId,
  type CreatorUsagePurposeId,
} from "@/shared/lib/creator-role-contract";
import { cn } from "@/shared/lib/utils";

const FEATURED_ROLES: readonly CreatorRoleId[] = [
  "story", "line-art", "assistant", "planner", "producer", "creator",
];
const STEP_LABELS = ["직무", "전문 분야", "사용 목적", "공개 범위"] as const;
function patchProfile(
  profile: CreatorRoleProfile,
  patch: Partial<CreatorRoleProfile>,
): CreatorRoleProfile {
  return normalizeCreatorRoleProfile({ ...profile, ...patch });
}

export function CreatorRoleOnboarding({
  profile,
  locale,
  onProfileChange,
  onDismiss,
}: {
  readonly profile: MeProfile;
  readonly locale: CreatorRoleLocale;
  readonly onProfileChange: (profile: MeProfile) => void;
  readonly onDismiss: () => void;
}) {
  const initialStep = profile.creatorRoleProfile.onboarding.status === "in-progress"
    ? profile.creatorRoleProfile.onboarding.step
    : 1;
  const [draft, setDraft] = useState(profile.creatorRoleProfile);
  const [step, setStep] = useState(initialStep);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(profile.creatorRoleProfile), [profile.creatorRoleProfile]);
  const selectedRoles = useMemo(() => creatorRoleSelection(draft), [draft]);
  const recommended = useMemo(
    () => new Set(recommendedCreatorSpecialties(selectedRoles)),
    [selectedRoles],
  );

  const persist = async (next: CreatorRoleProfile, dismiss: boolean) => {
    const previous = profile;
    setSaving(true);
    setError(null);
    setDraft(next);
    onProfileChange({ ...profile, creatorRoleProfile: next });
    try {
      onProfileChange(await updateMyProfile({ creatorRoleProfile: next }));
      if (dismiss) onDismiss();
      return true;
    } catch (cause) {
      onProfileChange(previous);
      setDraft(previous.creatorRoleProfile);
      setError(cause instanceof Error
        ? cause.message
        : locale === "ko"
          ? "직무 설정을 저장하지 못했습니다."
          : "Could not save role settings.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const selectRole = (role: CreatorRoleId) => setDraft((current) => patchProfile(current, {
    primaryRole: role,
    secondaryRoles: current.secondaryRoles.filter((entry) => entry !== role),
    activeRole: role,
  }));
  const toggleSpecialty = (specialty: CreatorSpecialtyId) => setDraft((current) => patchProfile(current, {
    specialties: current.specialties.includes(specialty)
      ? current.specialties.filter((entry) => entry !== specialty)
      : [...current.specialties, specialty],
  }));
  const togglePurpose = (purpose: CreatorUsagePurposeId) => setDraft((current) => patchProfile(current, {
    usagePurposes: current.usagePurposes.includes(purpose)
      ? current.usagePurposes.filter((entry) => entry !== purpose)
      : [...current.usagePurposes, purpose],
  }));
  const setVisibility = (field: keyof CreatorRoleVisibility, checked: boolean) => {
    setDraft((current) => patchProfile(current, {
      visibility: { ...current.visibility, [field]: checked },
    }));
  };

  const goNext = async () => {
    const nextStep = Math.min(4, step + 1) as 1 | 2 | 3 | 4;
    const next = withCreatorRoleOnboarding(draft, {
      status: "in-progress",
      step: nextStep,
    });
    if (await persist(next, false)) setStep(nextStep);
  };

  const finish = async () => {
    if (!draft.primaryRole) return;
    const now = new Date().toISOString();
    await persist(withCreatorRoleOnboarding(draft, {
      status: "completed",
      step: 4,
      completedAt: now,
    }, now), true);
  };
  const skip = async () => persist(withCreatorRoleOnboarding(draft, {
    status: "skipped",
    step,
    completedAt: null,
  }), true);

  return (
    <section
      className="mt-7 overflow-hidden rounded-3xl border border-accent/30 bg-card shadow-sm"
      aria-labelledby="creator-role-onboarding-title"
    >
      <div className="border-b border-line bg-accent-soft/35 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-accent">
              <Sparkles size={15} aria-hidden="true" />
              <p className="text-[0.68rem] font-black uppercase tracking-[0.15em]">ROLE ONBOARDING</p>
            </div>
            <h2 id="creator-role-onboarding-title" className="mt-1 text-xl font-black text-fg">
              {locale === "ko" ? "내 일에 맞는 작업공간 만들기" : "Build a workspace around your role"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-fg-2">
              {locale === "ko"
                ? "직무에 따라 시작 동선, 실제 업무 우선순위와 추천 도구가 달라집니다."
                : "Your role personalizes starting paths, task priority and recommended tools."}
            </p>
          </div>
          <button
            type="button"
            className={buttonClass({ variant: "quiet", size: "sm" })}
            disabled={saving}
            onClick={() => void skip()}
          >
            {locale === "ko" ? "나중에 설정" : "Set up later"}
          </button>
        </div>
        <ol className="mt-4 grid grid-cols-4 gap-2" aria-label="직무 설정 단계">
          {STEP_LABELS.map((label, index) => {
            const number = index + 1;
            const active = number === step;
            const completed = number < step;
            return (
              <li key={label} className="min-w-0">
                <div className={cn("h-1 rounded-full", completed ? "bg-good" : active ? "bg-accent" : "bg-line")} />
                <p className={cn("mt-1 truncate text-[0.65rem] font-bold", active ? "text-accent" : completed ? "text-good" : "text-fg-3")}>
                  {number}. {label}
                </p>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="p-5 sm:p-6">
        {step === 1 ? (
          <div>
            <h3 className="text-base font-black text-fg">지금 주로 어떤 일을 하나요?</h3>
            <p className="mt-1 text-xs leading-5 text-fg-2">대표 직무 하나를 먼저 선택합니다. 언제든 다시 바꿀 수 있습니다.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURED_ROLES.map((role) => {
                const definition = creatorRoleDefinition(role);
                if (!definition) return null;
                const selected = draft.primaryRole === role;
                return (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectRole(role)}
                    className={cn(
                      "min-h-24 rounded-2xl border p-3 text-left transition-colors",
                      selected ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-accent/40",
                    )}
                  >
                    <span className={cn("flex items-center gap-1.5 text-sm font-black", selected ? "text-accent" : "text-fg")}>
                      {selected ? <Check size={14} aria-hidden="true" /> : null}
                      {creatorText(definition.label, locale)}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-fg-2">
                      {creatorText(definition.description, locale)}
                    </span>
                  </button>
                );
              })}
            </div>
            <label className="mt-3 block text-xs font-semibold text-fg-2">
              {locale === "ko" ? "다른 직무 찾기" : "Choose another role"}
              <select
                value={draft.primaryRole ?? ""}
                onChange={(event) => selectRole(event.target.value as CreatorRoleId)}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              >
                <option value="">{locale === "ko" ? "직무 선택" : "Select a role"}</option>
                {CREATOR_ROLE_DEFINITIONS.map((definition) => (
                  <option key={definition.id} value={definition.id}>
                    {creatorText(definition.label, locale)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <h3 className="text-base font-black text-fg">어떤 작업에 강점이 있나요?</h3>
            <p className="mt-1 text-xs leading-5 text-fg-2">현재 직무와 가까운 분야를 먼저 표시합니다. 선택 없이 넘어가도 됩니다.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[...CREATOR_SPECIALTY_DEFINITIONS]
                .sort((left, right) => Number(recommended.has(right.id)) - Number(recommended.has(left.id)))
                .map((definition) => {
                  const selected = draft.specialties.includes(definition.id);
                  return (
                    <button
                      key={definition.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleSpecialty(definition.id)}
                      className={cn(
                        "inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold",
                        selected
                          ? "border-accent/50 bg-accent-soft text-accent"
                          : recommended.has(definition.id)
                            ? "border-line-strong bg-raised text-fg"
                            : "border-line bg-panel text-fg-2",
                      )}
                    >
                      {selected ? <Check size={12} aria-hidden="true" /> : recommended.has(definition.id) ? <Sparkles size={12} aria-hidden="true" /> : null}
                      {creatorText(definition.label, locale)}
                    </button>
                  );
                })}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <h3 className="text-base font-black text-fg">툰스튜디오를 어디에 사용할까요?</h3>
            <p className="mt-1 text-xs leading-5 text-fg-2">목적에 맞는 시작 화면과 체크리스트를 우선 추천합니다.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CREATOR_USAGE_PURPOSE_DEFINITIONS.map((definition) => {
                const selected = draft.usagePurposes.includes(definition.id);
                return (
                  <button
                    key={definition.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => togglePurpose(definition.id)}
                    className={cn(
                      "min-h-20 rounded-2xl border p-3 text-left",
                      selected ? "border-accent/50 bg-accent-soft" : "border-line bg-panel",
                    )}
                  >
                    <span className={cn("flex items-center gap-1.5 text-xs font-black", selected ? "text-accent" : "text-fg")}>
                      {selected ? <Check size={12} aria-hidden="true" /> : null}
                      {creatorText(definition.label, locale)}
                    </span>
                    <span className="mt-1.5 block text-[0.7rem] leading-5 text-fg-3">
                      {creatorText(definition.description, locale)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <h3 className="text-base font-black text-fg">공개할 정보만 선택하세요</h3>
            <p className="mt-1 text-xs leading-5 text-fg-2">모든 항목은 기본 비공개이며, 공개 설정은 작업공간 개인화에 영향을 주지 않습니다.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {([
                ["roles", "대표·보조 직무"],
                ["specialties", "전문 분야"],
                ["experienceLevel", "경력 수준"],
                ["collaborationStatus", "협업 가능 상태"],
              ] as const).map(([field, label]) => {
                const visible = draft.visibility[field];
                return (
                  <label key={field} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-panel px-3 py-3">
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={(event) => setVisibility(field, event.target.checked)}
                      className="size-4 rounded border-line accent-[var(--accent)]"
                    />
                    {visible
                      ? <Eye size={14} className="text-accent" aria-hidden="true" />
                      : <EyeOff size={14} className="text-fg-3" aria-hidden="true" />}
                    <span className="text-xs font-semibold text-fg">{label}</span>
                  </label>
                );
              })}
            </div>
            {draft.primaryRole ? (
              <div className="mt-4 rounded-2xl border border-accent/25 bg-accent-soft/30 p-4">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-accent">PREVIEW</p>
                <p className="mt-2 text-sm font-black text-fg">
                  {creatorText(
                    creatorRoleDefinition(draft.primaryRole)?.label
                      ?? { ko: draft.primaryRole, en: draft.primaryRole },
                    locale,
                  )}
                </p>
                <p className="mt-1 text-xs text-fg-2">
                  전문 분야 {draft.specialties.length}개 · 사용 목적 {draft.usagePurposes.length}개
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-xs font-semibold text-bad" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <button
            type="button"
            className={buttonClass({ variant: "outline", className: "gap-1.5" })}
            disabled={saving || step === 1}
            onClick={() => setStep((current) => Math.max(1, current - 1) as 1 | 2 | 3 | 4)}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            이전
          </button>
          {step < 4 ? (
            <button
              type="button"
              className={buttonClass({ className: "gap-1.5" })}
              disabled={saving || (step === 1 && !draft.primaryRole)}
              onClick={() => void goNext()}
            >
              {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
              다음
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className={buttonClass({ className: "gap-1.5" })}
              disabled={saving || !draft.primaryRole}
              onClick={() => void finish()}
            >
              {saving
                ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                : <Check size={14} aria-hidden="true" />}
              내 작업공간 시작
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
