import { BellRing, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { updateMyProfile, type MeProfile } from "@/infrastructure/me-client";
import {
  CREATOR_ROLE_NOTIFICATION_LABELS,
  creatorProjectRolePreference,
  creatorRoleDefinition,
  creatorRoleSelection,
  creatorText,
  resolveCreatorActiveRole,
  resolveCreatorNotificationLevel,
  withCreatorProjectNotificationPreference,
  withCreatorProjectRolePreference,
  type CreatorRoleId,
  type CreatorRoleLocale,
  type CreatorRoleNotificationLevel,
  type CreatorRoleProfile,
} from "@/shared/lib/creator-role-contract";
import { cn } from "@/shared/lib/utils";

export function CreatorProjectRoleSwitcher({
  profile,
  projectKey,
  locale = "ko",
  disabled = false,
  onProfileChange,
}: {
  readonly profile: MeProfile;
  readonly projectKey: string;
  readonly locale?: CreatorRoleLocale;
  readonly disabled?: boolean;
  readonly onProfileChange: (profile: MeProfile) => void;
}) {
  const selectedRoles = useMemo(
    () => creatorRoleSelection(profile.creatorRoleProfile),
    [profile.creatorRoleProfile],
  );
  const activeRole = resolveCreatorActiveRole(profile.creatorRoleProfile, projectKey);
  const activeDefinition = creatorRoleDefinition(activeRole);
  const projectPreference = creatorProjectRolePreference(profile.creatorRoleProfile, projectKey);
  const notificationLevel = resolveCreatorNotificationLevel(profile.creatorRoleProfile, projectKey);  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!activeDefinition || selectedRoles.length === 0) return null;

  const persistProfile = async (
    nextRoleProfile: CreatorRoleProfile,
    saving: string,
    fallbackMessage: string,
  ) => {
    if (disabled || savingKey || nextRoleProfile === profile.creatorRoleProfile) return;
    const previous = profile;
    const optimistic = { ...profile, creatorRoleProfile: nextRoleProfile };
    setSavingKey(saving);
    setError(null);
    onProfileChange(optimistic);
    try {
      onProfileChange(await updateMyProfile({ creatorRoleProfile: nextRoleProfile }));
    } catch (cause) {
      onProfileChange(previous);
      setError(cause instanceof Error ? cause.message : fallbackMessage);
    } finally {
      setSavingKey(null);
    }
  };

  const changeRole = (role: CreatorRoleId) => {
    if (role === activeRole) return;
    void persistProfile(
      withCreatorProjectRolePreference(profile.creatorRoleProfile, projectKey, role),
      `role:${role}`,
      locale === "ko"
        ? "프로젝트 작업 모드를 저장하지 못했습니다."
        : "Could not save the project workspace role.",
    );
  };

  const changeNotificationLevel = (raw: string) => {
    const next = raw ? raw as CreatorRoleNotificationLevel : null;
    void persistProfile(
      withCreatorProjectNotificationPreference(profile.creatorRoleProfile, projectKey, next),
      "notification",
      locale === "ko"
        ? "프로젝트 알림 설정을 저장하지 못했습니다."
        : "Could not save the project notification level.",
    );
  };
  return (
    <section
      className="rounded-2xl border border-accent/30 bg-accent-soft/35 p-4"
      aria-labelledby="project-role-switcher-title"
      data-project-role-key={projectKey}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p id="project-role-switcher-title" className="text-xs font-black text-fg">
              {locale === "ko" ? "이 프로젝트에서 작업 중" : "Working in this project as"}
            </p>
            <span className="inline-flex min-h-7 items-center rounded-full border border-accent/35 bg-card px-2.5 text-xs font-black text-accent">
              {creatorText(activeDefinition.label, locale)}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[0.7rem] leading-5 text-fg-3">
            <ShieldCheck size={13} className="shrink-0" aria-hidden="true" />
            {locale === "ko"
              ? "화면 정렬과 추천만 바뀌며 프로젝트 접근 권한은 변경하지 않습니다."
              : "This changes layout and recommendations only, never project access permissions."}
          </p>
        </div>
        {selectedRoles.length > 1 ? (
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label={locale === "ko" ? "프로젝트 작업 모드" : "Project workspace role"}
          >
            {selectedRoles.map((role) => {
              const definition = creatorRoleDefinition(role);
              if (!definition) return null;
              const selected = role === activeRole;
              return (
                <button
                  key={role}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled || Boolean(savingKey)}
                  onClick={() => changeRole(role)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors disabled:cursor-wait disabled:opacity-55",
                    selected
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg-2 hover:border-accent/40 hover:text-fg",
                  )}
                >                  {savingKey === `role:${role}`
                    ? <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                    : selected
                      ? <CheckCircle2 size={12} aria-hidden="true" />
                      : null}
                  {creatorText(definition.shortLabel, locale)}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2 rounded-xl border border-line bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2 text-xs font-bold text-fg">
          <BellRing size={14} className="text-accent" aria-hidden="true" />
          {locale === "ko" ? "이 프로젝트 알림" : "Project notifications"}
        </span>
        <select
          value={projectPreference?.notificationLevel ?? ""}
          disabled={disabled || Boolean(savingKey)}
          onChange={(event) => changeNotificationLevel(event.currentTarget.value)}
          aria-label={locale === "ko" ? "프로젝트 알림 강도" : "Project notification level"}
          className="min-h-10 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-fg outline-none focus:border-accent"
        >
          <option value="">
            {locale === "ko"
              ? `기본값 사용 · ${creatorText(CREATOR_ROLE_NOTIFICATION_LABELS[notificationLevel], locale)}`
              : `Use default · ${creatorText(CREATOR_ROLE_NOTIFICATION_LABELS[notificationLevel], locale)}`}
          </option>
          {Object.entries(CREATOR_ROLE_NOTIFICATION_LABELS).map(([id, label]) => (
            <option key={id} value={id}>{creatorText(label, locale)}</option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-xs font-semibold text-bad" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
