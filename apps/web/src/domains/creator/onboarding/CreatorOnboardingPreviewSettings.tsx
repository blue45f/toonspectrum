import { Bell, LayoutDashboard, Zap } from "lucide-react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  creatorText,
  type CreatorRoleId,
  type CreatorRoleLocale,
  type CreatorWorkspaceAction,
} from "@/shared/lib/creator-role-contract";
import {
  CREATOR_ROLE_NOTIFICATION_EVENTS,
  CREATOR_ROLE_NOTIFICATION_PRESETS,
  CREATOR_ROLE_WORKSPACE_PRESETS,
  creatorRoleNotificationSettings,
  type CreatorRoleNotificationPreset,
  type CreatorRoleWorkspacePreset,
} from "@/shared/lib/creator-role-workspace-contract";
import { cn } from "@/shared/lib/utils";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("CreatorOnboardingPreviewSettings", ko, en);

function localized(_locale: CreatorRoleLocale, ko: string, en: string): string {
  return bi(ko, en);
}

/** 표시 이름은 STUDIO_DEFAULT_WORKSPACES의 정본 이름과 맞춘다. 역할→프리셋 매핑 자체는 계약의 creatorRoleStudioWorkspace가 정본이다. */
const WORKSPACE_PRESET_LABELS: Readonly<Record<CreatorRoleWorkspacePreset, { ko: string; en: string }>> = {
  "quick-sketch": { ko: "빠른 스케치", en: "Quick sketch" },
  storyboard: { ko: "스토리보드", en: "Storyboard" },
  lineart: { ko: "선화", en: "Line art" },
  coloring: { ko: "채색", en: "Coloring" },
  lettering: { ko: "대사·레터링", en: "Lettering" },
  review: { ko: "검수", en: "Review" },
  publish: { ko: "게시", en: "Publish" },
  "pro-comic": { ko: "프로 만화", en: "Pro comic" },
  "pose-3d": { ko: "포즈 & 3D", en: "Pose & 3D" },
};

const NOTIFICATION_PRESET_COPY: Readonly<Record<CreatorRoleNotificationPreset, {
  ko: string;
  en: string;
  descriptionKo: string;
  descriptionEn: string;
}>> = {
  focused: {
    ko: "집중",
    en: "Focused",
    descriptionKo: "내 직군에 중요한 알림만 받습니다.",
    descriptionEn: "Only the notifications that matter most for your role.",
  },
  balanced: {
    ko: "균형",
    en: "Balanced",
    descriptionKo: "중요 알림에 배정·마감 위험·질문을 더해 받습니다.",
    descriptionEn: "Core notifications plus assignments, deadline risks and questions.",
  },
  all: {
    ko: "전체",
    en: "All",
    descriptionKo: "모든 종류의 알림을 받습니다.",
    descriptionEn: "Every kind of notification.",
  },
  muted: {
    ko: "음소거",
    en: "Muted",
    descriptionKo: "직군 알림을 모두 끕니다.",
    descriptionEn: "Turns role notifications off.",
  },
};

const selectClass = "mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-fg";

export interface CreatorOnboardingPreviewSettingsProps {
  readonly locale: CreatorRoleLocale;
  readonly primaryRole: CreatorRoleId | null;
  readonly actions: readonly CreatorWorkspaceAction[];
  readonly workspacePreset: CreatorRoleWorkspacePreset;
  readonly onWorkspacePresetChange: (preset: CreatorRoleWorkspacePreset) => void;
  readonly notificationPreset: CreatorRoleNotificationPreset;
  readonly onNotificationPresetChange: (preset: CreatorRoleNotificationPreset) => void;
}

/**
 * 온보딩 마지막 단계에서 "선택한 직군으로 무엇이 실제로 바뀌는지"를 보여주는 블록.
 * 빠른 실행 순서는 직군 정의(CREATOR_ROLE_DEFINITIONS)의 정본 액션을 그대로 쓰고,
 * 작업공간·알림 두 프리셋은 이 자리에서 바로 바꿀 수 있다 (부분 되돌리기).
 */
export function CreatorOnboardingPreviewSettings({
  locale,
  primaryRole,
  actions,
  workspacePreset,
  onWorkspacePresetChange,
  notificationPreset,
  onNotificationPresetChange,
}: CreatorOnboardingPreviewSettingsProps) {
  useBilingualI18nRevision();
  const notificationSettings = creatorRoleNotificationSettings(primaryRole, {
    notificationPreset,
    notificationOverrides: {},
  });
  const enabledCount = CREATOR_ROLE_NOTIFICATION_EVENTS.filter(
    (event) => notificationSettings[event],
  ).length;
  const notificationCopy = NOTIFICATION_PRESET_COPY[notificationPreset];

  return (
    <div className="mt-5 rounded-3xl border border-line bg-panel p-4 sm:p-5">
      <h3 className="text-sm font-black text-fg">
        {localized(locale, "이렇게 적용됩니다", "How this will be applied")}
      </h3>
      <p className="mt-1 text-xs leading-5 text-fg-2">
        {localized(locale, "작업공간과 알림은 이전 단계로 돌아가지 않고 여기서 바로 바꿀 수 있습니다. 바꾼 값 그대로 저장됩니다.", "You can adjust the workspace and notifications right here without going back. What you see is what gets saved.")}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {actions.length > 0 ? (
          <div>
            <p className="flex items-center gap-1.5 text-[0.66rem] font-black uppercase tracking-[0.14em] text-accent">
              <Zap size={13} aria-hidden="true" />
              {localized(locale, "빠른 실행 순서", "Quick actions, in order")}
            </p>
            <ol className="mt-2 grid gap-2">
              {actions.map((action, index) => (
                <li key={action.href} className="flex items-start gap-3 rounded-xl border border-line bg-card p-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[0.7rem] font-black text-accent" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-fg">{creatorText(action.label, locale)}</span>
                    <span className="mt-0.5 block text-[0.68rem] leading-5 text-fg-3">{creatorText(action.description, locale)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className={cn("grid content-start gap-4", actions.length === 0 && "lg:col-span-2")}>
          <label className="block text-xs font-bold text-fg-2">
            <span className="flex items-center gap-1.5">
              <LayoutDashboard size={13} aria-hidden="true" />
              {localized(locale, "기본 편집기 작업공간", "Default editor workspace")}
            </span>
            <select
              value={workspacePreset}
              onChange={(event) => onWorkspacePresetChange(event.currentTarget.value as CreatorRoleWorkspacePreset)}
              className={selectClass}
            >
              {CREATOR_ROLE_WORKSPACE_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {localized(locale, WORKSPACE_PRESET_LABELS[preset].ko, WORKSPACE_PRESET_LABELS[preset].en)}
                </option>
              ))}
            </select>
          </label>

          <div>
            <label className="block text-xs font-bold text-fg-2">
              <span className="flex items-center gap-1.5">
                <Bell size={13} aria-hidden="true" />
                {localized(locale, "알림 수준", "Notification level")}
              </span>
              <select
                value={notificationPreset}
                onChange={(event) => onNotificationPresetChange(event.currentTarget.value as CreatorRoleNotificationPreset)}
                className={selectClass}
              >
                {CREATOR_ROLE_NOTIFICATION_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {localized(locale, NOTIFICATION_PRESET_COPY[preset].ko, NOTIFICATION_PRESET_COPY[preset].en)}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-1.5 text-[0.68rem] leading-5 text-fg-3" aria-live="polite">
              {localized(locale, notificationCopy.descriptionKo, notificationCopy.descriptionEn)}
              {" "}
              {localized(
                locale,
                `알림 종류 ${CREATOR_ROLE_NOTIFICATION_EVENTS.length}개 중 ${enabledCount}개가 켜집니다.`,
                `${enabledCount} of ${CREATOR_ROLE_NOTIFICATION_EVENTS.length} notification kinds will be on.`,
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreatorOnboardingPreviewSettings;
