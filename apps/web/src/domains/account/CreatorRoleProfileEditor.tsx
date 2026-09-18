import {
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText,
  translateLocaleBranchForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  BriefcaseBusiness,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useMemo } from "react";

import {
  CREATOR_COLLABORATION_LABELS,
  CREATOR_EXPERIENCE_LABELS,
  CREATOR_ROLE_DEFINITIONS,
  CREATOR_ROLE_MAX_SECONDARY,
  CREATOR_ROLE_MAX_SPECIALTIES,
  CREATOR_SPECIALTY_DEFINITIONS,
  CREATOR_STAGE_IDS,
  CREATOR_STAGE_LABELS,
  creatorRoleDefinition,
  creatorRoleSelection,
  creatorText,
  normalizeCreatorRoleProfile,
  recommendedCreatorSpecialties,
  type CreatorCollaborationStatus,
  type CreatorExperienceLevel,
  type CreatorRoleGroup,
  type CreatorRoleId,
  type CreatorRoleLocale,
  type CreatorRoleProfile,
  type CreatorSpecialtyId,
  type CreatorStage,
} from "@/shared/lib/creator-role-contract";

import { cn } from "@/shared/lib/utils";
import {
  getActiveI18nLocale,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("CreatorRoleProfileEditor", ko, en);

const FEATURED_ROLES: readonly CreatorRoleId[] = [
  "story",
  "line-art",
  "assistant",
  "planner",
  "producer",
  "educator",
  "creator",
];

const ROLE_GROUP_LABELS: Readonly<Record<CreatorRoleGroup, { ko: string; en: string }>> = {
  story: { ko: "스토리·기획", en: "Story & planning" },
  art: { ko: "작화·디자인", en: "Art & design" },
  support: { ko: "제작 지원", en: "Production support" },
  production: { ko: "편집·운영", en: "Editorial & operations" },
};

function localized(_locale, ko: string, en: string): string {
  return bi(ko, en);
}

function roleLabel(role: CreatorRoleId, locale: CreatorRoleLocale): string {
  const definition = creatorRoleDefinition(role);
  return definition ? creatorText(definition.label, locale) : role;
}

function withProfilePatch(
  profile: CreatorRoleProfile,
  patch: Partial<CreatorRoleProfile>,
): CreatorRoleProfile {
  return normalizeCreatorRoleProfile({ ...profile, ...patch });
}

export function CreatorRoleProfileEditor({
  value,
  onChange,
  disabled = false,
}: {
  readonly value: CreatorRoleProfile;
  readonly onChange: (next: CreatorRoleProfile) => void;
  readonly disabled?: boolean;
}) {
  useBilingualI18nRevision();
  const locale: CreatorRoleLocale = getActiveI18nLocale();
  const selectedRoles = creatorRoleSelection(value);
  const recommendedSpecialtySet = useMemo(
    () => new Set(recommendedCreatorSpecialties(selectedRoles)),
    [selectedRoles],
  );
  const activeDefinition = creatorRoleDefinition(value.activeRole ?? value.primaryRole);

  const selectPrimaryRole = (primaryRole: CreatorRoleId | null) => {
    const secondaryRoles = value.secondaryRoles.filter((role) => role !== primaryRole);
    onChange(withProfilePatch(value, {
      primaryRole,
      secondaryRoles,
      activeRole: primaryRole,
    }));
  };

  const toggleSecondaryRole = (role: CreatorRoleId) => {
    if (role === value.primaryRole) return;
    const selected = value.secondaryRoles.includes(role);
    if (!selected && value.secondaryRoles.length >= CREATOR_ROLE_MAX_SECONDARY) return;
    const secondaryRoles = selected
      ? value.secondaryRoles.filter((entry) => entry !== role)
      : [...value.secondaryRoles, role];
    onChange(withProfilePatch(value, {
      secondaryRoles,
      activeRole: value.activeRole === role && selected ? value.primaryRole : value.activeRole,
    }));
  };

  const toggleSpecialty = (specialty: CreatorSpecialtyId) => {
    const selected = value.specialties.includes(specialty);
    if (!selected && value.specialties.length >= CREATOR_ROLE_MAX_SPECIALTIES) return;
    onChange(withProfilePatch(value, {
      specialties: selected
        ? value.specialties.filter((entry) => entry !== specialty)
        : [...value.specialties, specialty],
    }));
  };

  return (
    <section className="space-y-5 rounded-2xl border border-line bg-panel/40 p-5" aria-labelledby="creator-role-profile-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-accent">
            <BriefcaseBusiness size={16} aria-hidden="true" />
            <p className="text-[0.68rem] font-black uppercase tracking-[0.14em]">{translateCurrentStaticSourceText("domains.account.CreatorRoleProfileEditor", "en", "Creator role")}</p>
          </div>
          <h2 id="creator-role-profile-title" className="mt-2 text-base font-black text-fg">
            {localized(locale, "어떤 직무로 활동하나요?", "What role do you work in?")}
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-fg-2">
            {localized(
              locale,
              "대표 직무는 프로필과 기본 작업 화면에 반영됩니다. 프로젝트 권한과는 별도로 관리되며 언제든 바꿀 수 있습니다.",
              "Your primary role personalizes your profile and default workspace. It stays separate from project permissions and can be changed anytime.",
            )}
          </p>
        </div>
        {value.primaryRole ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent">
            <Check size={13} aria-hidden="true" />
            {roleLabel(value.primaryRole, locale)}
          </span>
        ) : null}
      </header>

      <label className="block text-xs font-semibold text-fg">
        {localized(locale, "현재 활동 단계", "Current creator stage")}
        <select
          disabled={disabled}
          value={value.creatorStage ?? ""}
          onChange={(event) => onChange(withProfilePatch(value, {
            creatorStage: (event.target.value || null) as CreatorStage | null,
          }))}
          className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg outline-none focus:border-accent"
        >
          <option value="">{localized(locale, "선택 안 함", "Not specified")}</option>
          {CREATOR_STAGE_IDS.map((id) => (
            <option key={id} value={id}>{creatorText(CREATOR_STAGE_LABELS[id], locale)}</option>
          ))}
        </select>
        <span className="mt-1 block text-[0.68rem] font-normal leading-5 text-fg-3">
          {localized(locale, "학생·아마추어·프로 여부는 능력 평가가 아니라 홈과 도움말의 우선순위를 정하는 데만 사용합니다.", "This is not a skill rating. It only tunes home content and guidance priority.")}
        </span>
      </label>

      <fieldset disabled={disabled}>
        <legend className="text-xs font-black text-fg">
          {localized(locale, "대표 직무", "Primary role")}
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {FEATURED_ROLES.map((role) => {
            const definition = creatorRoleDefinition(role);
            if (!definition) return null;
            const selected = value.primaryRole === role;
            return (
              <button
                key={role}
                type="button"
                aria-pressed={selected}
                onClick={() => selectPrimaryRole(role)}
                className={cn(
                  "min-h-24 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                  selected
                    ? "border-accent/60 bg-accent-soft"
                    : "border-line bg-card hover:border-accent/35 hover:bg-raised",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("text-sm font-black", selected ? "text-accent" : "text-fg")}>
                    {creatorText(definition.label, locale)}
                  </span>
                  {selected ? <Check size={15} className="text-accent" aria-hidden="true" /> : null}
                </div>
                <p className="mt-2 line-clamp-2 text-[0.72rem] leading-5 text-fg-2">
                  {creatorText(definition.description, locale)}
                </p>
              </button>
            );
          })}
        </div>
        <label className="mt-3 block text-xs font-semibold text-fg-2">
          {localized(locale, "전체 직무에서 선택", "Choose from all roles")}
          <select
            value={value.primaryRole ?? ""}
            onChange={(event) => selectPrimaryRole(event.target.value as CreatorRoleId || null)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm font-semibold text-fg outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/35"
          >
            <option value="">{localized(locale, "직무를 선택해 주세요", "Select a role")}</option>
            {Object.keys(ROLE_GROUP_LABELS).map((group) => (
              <optgroup key={group} label={bi((ROLE_GROUP_LABELS[group as CreatorRoleGroup]).ko, (ROLE_GROUP_LABELS[group as CreatorRoleGroup]).en)}>
                {CREATOR_ROLE_DEFINITIONS.filter((entry) => entry.group === group).map((entry) => (
                  <option key={entry.id} value={entry.id}>{creatorText(entry.label, locale)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset disabled={disabled || !value.primaryRole}>
        <legend className="text-xs font-black text-fg">
          {localized(locale, "보조 직무", "Secondary roles")}
        </legend>
        <div className="-mt-4 flex justify-end">
          <span className="text-[0.68rem] text-fg-3">
            {value.secondaryRoles.length}/{CREATOR_ROLE_MAX_SECONDARY}
          </span>
        </div>
        <p className="mt-1 text-[0.72rem] leading-5 text-fg-3">
          {localized(locale, "여러 역할을 겸한다면 추가하세요. 프로젝트별 실제 담당 역할은 별도로 지정됩니다.", "Add roles you also perform. Actual project assignments remain separate.")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CREATOR_ROLE_DEFINITIONS.filter((entry) => entry.id !== value.primaryRole).map((entry) => {
            const selected = value.secondaryRoles.includes(entry.id);
            const blocked = !selected && value.secondaryRoles.length >= CREATOR_ROLE_MAX_SECONDARY;
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={selected}
                disabled={disabled || !value.primaryRole || blocked}
                onClick={() => toggleSecondaryRole(entry.id)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                  selected
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:border-accent/35 hover:text-fg",
                )}
              >
                {selected ? <Check size={12} aria-hidden="true" /> : null}
                {creatorText(entry.shortLabel, locale)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset disabled={disabled || !value.primaryRole}>
        <legend className="text-xs font-black text-fg">
          {localized(locale, "전문 분야", "Specialties")}
        </legend>
        <div className="-mt-4 flex justify-end">
          <span className="text-[0.68rem] text-fg-3">
            {value.specialties.length}/{CREATOR_ROLE_MAX_SPECIALTIES}
          </span>
        </div>
        <p className="mt-1 text-[0.72rem] leading-5 text-fg-3">
          {localized(locale, "선택한 직무와 관련된 추천 분야를 먼저 표시합니다.", "Recommended specialties for your selected roles appear first.")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[...CREATOR_SPECIALTY_DEFINITIONS]
            .sort((left, right) => Number(recommendedSpecialtySet.has(right.id)) - Number(recommendedSpecialtySet.has(left.id)))
            .map((entry) => {
              const selected = value.specialties.includes(entry.id);
              const recommended = recommendedSpecialtySet.has(entry.id);
              const blocked = !selected && value.specialties.length >= CREATOR_ROLE_MAX_SPECIALTIES;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled || !value.primaryRole || blocked}
                  onClick={() => toggleSpecialty(entry.id)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                    selected
                      ? "border-accent/50 bg-accent-soft text-accent"
                      : recommended
                        ? "border-line-strong bg-raised text-fg"
                        : "border-line bg-card text-fg-2 hover:border-accent/35 hover:text-fg",
                  )}
                >
                  {recommended && !selected ? <Sparkles size={12} aria-hidden="true" /> : null}
                  {selected ? <Check size={12} aria-hidden="true" /> : null}
                  {creatorText(entry.label, locale)}
                </button>
              );
            })}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-fg">
          {localized(locale, "경력 수준", "Experience level")}
          <select
            disabled={disabled || !value.primaryRole}
            value={value.experienceLevel ?? ""}
            onChange={(event) => onChange(withProfilePatch(value, {
              experienceLevel: (event.target.value || null) as CreatorExperienceLevel | null,
            }))}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg outline-none focus:border-accent"
          >
            <option value="">{localized(locale, "선택 안 함", "Not specified")}</option>
            {Object.entries(CREATOR_EXPERIENCE_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{creatorText(label, locale)}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-fg">
          {localized(locale, "협업 가능 상태", "Collaboration status")}
          <select
            disabled={disabled || !value.primaryRole}
            value={value.collaborationStatus ?? ""}
            onChange={(event) => onChange(withProfilePatch(value, {
              collaborationStatus: (event.target.value || null) as CreatorCollaborationStatus | null,
            }))}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg outline-none focus:border-accent"
          >
            <option value="">{localized(locale, "선택 안 함", "Not specified")}</option>
            {Object.entries(CREATOR_COLLABORATION_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{creatorText(label, locale)}</option>
            ))}
          </select>
        </label>
      </div>

      {selectedRoles.length > 0 ? (
        <div>
          <label htmlFor="creator-active-role" className="block text-xs font-semibold text-fg">
            {localized(locale, "현재 작업 모드", "Active workspace mode")}
          </label>
          <select
            id="creator-active-role"
            aria-describedby="creator-active-role-description"
            disabled={disabled}
            value={value.activeRole ?? value.primaryRole ?? ""}
            onChange={(event) => onChange(withProfilePatch(value, {
              activeRole: event.target.value as CreatorRoleId,
            }))}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg outline-none focus:border-accent"
          >
            {selectedRoles.map((role) => (
              <option key={role} value={role}>{roleLabel(role, locale)}</option>
            ))}
          </select>
          <span id="creator-active-role-description" className="mt-1 block text-[0.68rem] font-normal leading-5 text-fg-3">
            {localized(locale, "스튜디오 홈과 제작 관리의 기본 화면에 적용됩니다.", "Used as the default view for Studio Home and production management.")}
          </span>
        </div>
      ) : null}

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-card p-3">
        <input
          type="checkbox"
          checked={value.roleVisibility}
          disabled={disabled}
          onChange={(event) => onChange(withProfilePatch(value, { roleVisibility: event.target.checked }))}
          className="mt-0.5 size-4 rounded border-line accent-[var(--accent)]"
        />
        {value.roleVisibility ? <Eye size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> : <EyeOff size={16} className="mt-0.5 shrink-0 text-fg-3" aria-hidden="true" />}
        <span>
          <span className="block text-xs font-bold text-fg">
            {localized(locale, "공개 프로필에 직무와 전문 분야 표시", "Show roles and specialties on my public profile")}
          </span>
          <span className="mt-1 block text-[0.7rem] leading-5 text-fg-3">
            {localized(locale, "끄면 개인화는 유지되지만 다른 사용자에게는 직무 정보가 보이지 않습니다.", "When disabled, personalization remains active but role information is hidden from other users.")}
          </span>
        </span>
      </label>

      {activeDefinition ? (
        <aside className="overflow-hidden rounded-2xl border border-accent/30 bg-accent-soft/45 p-4" aria-label={localized(locale, "직무별 작업 화면 미리보기", "Role workspace preview") }>
          <div className="flex items-center gap-2 text-accent">
            <Sparkles size={15} aria-hidden="true" />
            <p className="text-[0.68rem] font-black uppercase tracking-[0.13em]">
              {localized(locale, "작업 화면 미리보기", "Workspace preview")}
            </p>
          </div>
          <h3 className="mt-2 text-sm font-black text-fg">
            {creatorText(activeDefinition.workspaceTitle, locale)}
          </h3>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {creatorText(activeDefinition.workspaceSummary, locale)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.7rem] text-fg-3">
            <UsersRound size={13} aria-hidden="true" />
            <span>{selectedRoles.map((role) => roleLabel(role, locale)).join(" · ")}</span>
          </div>
        </aside>
      ) : null}
    </section>
  );
}
