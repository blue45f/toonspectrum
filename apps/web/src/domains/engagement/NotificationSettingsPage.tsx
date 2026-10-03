import { useSyncExternalStore } from "react";

import { useEngagement } from "./engagement-store";
import {
  NOTIFICATION_CATEGORY_META,
  NOTIFICATION_CATEGORY_ORDER,
} from "./notification-categories";
import { useRoleNotificationSettings } from "./use-role-notification-settings";

import type { EngagementNotificationCategory } from "./engagement-model";
import type { CreatorRoleNotificationEvent } from "@/shared/lib/creator-role-workspace-contract";

import Link from "@/shared/navigation/router-link";
import { Container } from "@/shared/components/section";
import { SwitchIndicator } from "@/shared/components/ui/switch";
import { useDocumentTitle, useMetaRobots } from "@/shared/seo/use-document-title";
import { NOINDEX_PRIVATE_ROBOTS } from "@/shared/lib/seo-route-policy";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

/**
 * engagement 스토어는 IndexedDB 비동기 persist라, 복원이 끝나기 전에는
 * 기본값(전부 켜짐)이 저장값처럼 보인다. 복원 전 토글을 허용하면 복원값에
 * 덮이거나 기본값으로 저장될 수 있어, 하이드레이션 완료를 게이트로 쓴다.
 */
function useEngagementHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useEngagement.persist.onFinishHydration(cb),
    () => useEngagement.persist.hasHydrated(),
    () => false,
  );
}

function CategorySwitch({
  category,
  enabled,
  onChange,
  disabled = false,
}: {
  readonly category: EngagementNotificationCategory;
  readonly enabled: boolean;
  readonly onChange: (category: EngagementNotificationCategory, enabled: boolean) => void;
  readonly disabled?: boolean;
}) {
  const meta = NOTIFICATION_CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(category, !enabled)}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        enabled ? "border-line bg-card" : "border-line/70 bg-panel/60",
      )}
    >
      <span className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg",
        enabled ? "bg-accent-soft text-accent" : "bg-raised text-fg-3",
      )}>
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm font-bold", enabled ? "text-fg" : "text-fg-3")}>{meta.label}</span>
        <span className="block truncate text-[0.68rem] text-fg-3">{meta.description}</span>
      </span>
      {/* 행 전체가 히트 타깃인 행 스위치의 정본 비주얼 — 수제 트랙/썸 기하를 직접 굴리지 않는다. */}
      <SwitchIndicator checked={enabled} />
    </button>
  );
}

/**
 * 직군 알림 이벤트 10종의 표시 이름 — 개인화 센터(StudioRolePersonalizationCenter)의
 * NOTIFICATION_LABELS와 같은 문구를 쓴다. 직군 알림은 제작 알림에만 적용된다.
 */
const ROLE_NOTIFICATION_EVENT_ORDER: readonly CreatorRoleNotificationEvent[] = [
  "assignment",
  "handoff-ready",
  "review-request",
  "revision-request",
  "deadline-risk",
  "unassigned-work",
  "approval-needed",
  "publish-risk",
  "canon-change",
  "question",
];

const ROLE_NOTIFICATION_EVENT_LABELS: Readonly<Record<CreatorRoleNotificationEvent, string>> = {
  assignment: "담당 업무 배정",
  "handoff-ready": "선행 작업·인계 준비",
  "review-request": "검수 요청",
  "revision-request": "수정 요청",
  "deadline-risk": "일정 지연 위험",
  "unassigned-work": "담당자 없는 업무",
  "approval-needed": "승인 대기",
  "publish-risk": "연재·납품 위험",
  "canon-change": "설정·대본 변경",
  question: "담당자 질문",
};

/**
 * 직군 알림 층의 현재 상태를 보여 주는 읽기 전용 요약.
 * 종류별 설정과 직군 설정은 숨김 방향으로만 합성되므로, 왜 알림이 안 보이는지를
 * 이 화면에서 바로 알 수 있게 한다. 편집은 개인화 센터(내 직군 · 작업환경)에서 한다.
 */
function RoleNotificationSummary() {
  const { settings, state, reload } = useRoleNotificationSettings();
  const disabledEvents = settings
    ? ROLE_NOTIFICATION_EVENT_ORDER.filter((event) => settings[event] === false)
    : [];
  const enabledCount = ROLE_NOTIFICATION_EVENT_ORDER.length - disabledEvents.length;

  return (
    <section aria-label="직군 알림 안내" className="mt-4 rounded-2xl border border-line bg-panel/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-black text-fg">직군 알림 (제작 알림에 함께 적용)</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-fg-3">
            종류별 설정과 직군 알림은 함께 적용됩니다. 어느 한쪽에서 끈 알림은 목록과 알림 뱃지에서 숨겨지고,
            저장된 알림은 삭제되지 않습니다.
          </p>
        </div>
        <Link
          href="/studio#role-personalization"
          className={buttonClass({ variant: "outline", size: "sm", className: "shrink-0" })}
        >
          내 직군 · 작업환경에서 바꾸기
        </Link>
      </div>
      {settings ? (
        <div className="mt-3">
          <p className="text-xs font-bold text-fg-2">
            지금은 제작 알림 종류 {ROLE_NOTIFICATION_EVENT_ORDER.length}개 중 {enabledCount}개가 켜져 있어요.
          </p>
          {disabledEvents.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="직군 알림에서 꺼진 종류">
              {disabledEvents.map((event) => (
                <li
                  key={event}
                  className="inline-flex min-h-8 items-center rounded-full border border-line bg-panel px-2.5 text-xs font-medium text-fg-3"
                >
                  {ROLE_NOTIFICATION_EVENT_LABELS[event]} 끔
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : state === "error" ? (
        <div className="mt-3">
          <p role="alert" className="text-xs leading-5 text-danger">
            직군 알림 설정을 불러오지 못했어요. 지금은 직군으로 거르지 않고 모든 제작 알림을 보여줍니다.
          </p>
          <button
            type="button"
            onClick={() => void reload()}
            className={buttonClass({ variant: "outline", size: "sm", className: "mt-2" })}
          >
            다시 시도
          </button>
        </div>
      ) : state === "loading" ? (
        <p role="status" className="mt-3 text-xs leading-5 text-fg-3">
          직군 알림 설정을 불러오는 중이에요…
        </p>
      ) : state === "signed-out" ? (
        <p className="mt-3 text-xs leading-5 text-fg-3">
          로그인하면 직군 알림이 적용돼요. 지금은 직군으로 거르지 않고 모든 제작 알림을 보여줍니다.
        </p>
      ) : (
        <p className="mt-3 text-xs leading-5 text-fg-3">
          아직 직군을 정하지 않아 직군 알림이 적용되지 않아요. 직군을 정하면 제작 알림을 맡은 일 중심으로 줄일 수 있어요.
        </p>
      )}
    </section>
  );
}

/** 종류별 알림 수신 설정 — 알림 센터에서 분리한 전용 화면(/settings/notifications). */
export function NotificationSettingsPage() {
  useDocumentTitle("알림 설정");
  useMetaRobots(NOINDEX_PRIVATE_ROBOTS);
  const categorySettings = useEngagement((state) => state.notificationCategorySettings);
  const setNotificationCategoryEnabled = useEngagement((state) => state.setNotificationCategoryEnabled);
  const hydrated = useEngagementHydrated();

  return (
    <Container size="wide" className="py-8 sm:py-12">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Link href="/notifications" className="inline-flex min-h-11 items-center text-sm font-bold text-accent">
          ← 알림 센터
        </Link>
        <Link href="/settings" className="inline-flex min-h-11 items-center text-sm font-bold text-accent">
          설정 홈
        </Link>
      </div>
      <header className="mb-7 mt-3 max-w-3xl">
        <p className="eyebrow text-accent">NOTIFICATION SETTINGS</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">알림 설정</h1>
      </header>

      <section aria-label="알림 종류별 설정" className="rounded-2xl border border-line bg-panel/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-black text-fg">종류별 알림 받기</h2>
            <p className="mt-1 text-xs leading-5 text-fg-3">끄면 해당 종류의 알림은 목록과 알림 뱃지에서 숨겨집니다. 저장된 알림은 삭제되지 않습니다.</p>
          </div>
          <button
            type="button"
            disabled={!hydrated}
            onClick={() => {
              for (const category of NOTIFICATION_CATEGORY_ORDER) setNotificationCategoryEnabled(category, true);
            }}
            className={buttonClass({ variant: "ghost", size: "sm" })}
          >
            전부 켜기
          </button>
        </div>
        {!hydrated ? (
          <p role="status" className="mt-3 text-xs leading-5 text-fg-3">
            저장된 알림 설정을 불러오는 중이에요…
          </p>
        ) : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-busy={!hydrated}>
          {NOTIFICATION_CATEGORY_ORDER.map((category) => (
            <CategorySwitch
              key={category}
              category={category}
              enabled={categorySettings[category] !== false}
              disabled={!hydrated}
              onChange={setNotificationCategoryEnabled}
            />
          ))}
        </div>
      </section>

      <RoleNotificationSummary />
    </Container>
  );
}
