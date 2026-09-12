import {
  BadgeCheck,
  CircleAlert,
  Cloud,
  FileCheck2,
  KeyRound,
  Plug,
  ShieldCheck,
  Store,
  Type,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import {
  createDefaultStudioAssetGovernance,
  createDefaultStudioAssetGovernancePreferences,
  evaluateStudioAssetGovernance,
  readStudioAssetGovernancePreferences,
  writeStudioAssetGovernancePreferences,
  type StudioAssetGovernancePreferences,
  type StudioAssetGovernanceStatus,
} from "../studio-asset-governance";
import {
  STUDIO_ASSET_DESTINATIONS,
  type StudioAssetDestination,
} from "../studio-asset-passport";
import {
  STUDIO_PLUGIN_PERMISSIONS,
  type StudioPluginPermission,
} from "../studio-plugin-registry";
import { cn } from "../../../shared/lib/cn";

import type { Locale } from "../../../shared/i18n/locale";

const DESTINATION_LABELS: Readonly<Record<StudioAssetDestination, string>> = Object.freeze({
  template: "템플릿",
  team: "팀 라이브러리",
  market: "마켓",
  cloud: "클라우드",
});

const PERMISSION_LABELS: Readonly<Record<StudioPluginPermission, string>> = Object.freeze({
  "project.read": "프로젝트 읽기",
  "project.write": "프로젝트 쓰기",
  "asset.read": "에셋 읽기",
  "asset.write": "에셋 쓰기",
  "network.external": "외부 네트워크",
  "export.run": "내보내기 실행",
});

function statusLabel(status: StudioAssetGovernanceStatus, locale: Locale): string {
  if (locale === "en") {
    if (status === "ready") return "Ready";
    if (status === "confirmation") return "Needs confirmation";
    return "Blocked";
  }
  if (status === "ready") return "준비됨";
  if (status === "confirmation") return "확인 필요";
  return "차단됨";
}

function tone(status: StudioAssetGovernanceStatus): string {
  if (status === "ready") return "border-success/35 bg-success-soft/15 text-success";
  if (status === "confirmation") return "border-warning/35 bg-warning-soft/15 text-warning";
  return "border-danger/35 bg-danger-soft/15 text-danger";
}

function StatusCard({
  icon: Icon,
  label,
  description,
  status,
  locale,
}: {
  readonly icon: typeof ShieldCheck;
  readonly label: string;
  readonly description: string;
  readonly status: StudioAssetGovernanceStatus;
  readonly locale: Locale;
}) {
  return (
    <article className="rounded-2xl border border-line bg-card/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
          <Icon size={17} aria-hidden="true" />
        </span>
        <span className={cn("rounded-full border px-2.5 py-1 text-[0.65rem] font-black", tone(status))}>
          {statusLabel(status, locale)}
        </span>
      </div>
      <h3 className="mt-3 text-sm font-black text-fg">{label}</h3>
      <p className="mt-1 text-xs leading-5 text-fg-3">{description}</p>
    </article>
  );
}

function CheckOption({
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly description: string;
  readonly onChange: (checked: boolean) => void;
}) {
  const inputId = useId();

  return (
    <div
      className={cn(
        "flex min-h-14 items-start gap-3 rounded-xl border border-line bg-panel px-3 py-3 text-sm",
        disabled && "opacity-55",
      )}
    >
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-[var(--accent)]"
      />
      <label htmlFor={inputId} className={cn("min-w-0", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
        <b className="block text-xs text-fg">{label}</b>
        <span className="mt-1 block text-[0.68rem] leading-5 text-fg-3">{description}</span>
      </label>
    </div>
  );
}

/**
 * User-facing projection of quality, rights, provider entitlement, fonts, plugins and market
 * readiness. Internal policy models remain one authority while the UI asks only intent questions.
 */
export function StudioAssetGovernancePanel({
  projectId,
  locale,
}: {
  readonly projectId: string;
  readonly locale: Locale;
}) {
  const [preferences, setPreferences] = useState<StudioAssetGovernancePreferences>(() =>
    createDefaultStudioAssetGovernancePreferences(),
  );

  useEffect(() => {
    setPreferences(readStudioAssetGovernancePreferences(projectId));
  }, [projectId]);

  useEffect(() => {
    writeStudioAssetGovernancePreferences(projectId, preferences);
  }, [preferences, projectId]);

  const governance = useMemo(
    () => createDefaultStudioAssetGovernance(preferences),
    [preferences],
  );
  const report = useMemo(
    () => evaluateStudioAssetGovernance(governance),
    [governance],
  );

  const setDestination = (destination: StudioAssetDestination, checked: boolean) => {
    setPreferences((current) => ({
      ...current,
      destinations: checked
        ? [...new Set([...current.destinations, destination])]
        : current.destinations.filter((item) => item !== destination),
    }));
  };

  const setPluginPermission = (permission: StudioPluginPermission, checked: boolean) => {
    setPreferences((current) => ({
      ...current,
      pluginPermissions: checked
        ? [...new Set([...current.pluginPermissions, permission])]
        : current.pluginPermissions.filter((item) => item !== permission),
    }));
  };

  return (
    <section className="rounded-3xl border border-line bg-card/45 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">
            ASSET GOVERNANCE
          </p>
          <h2 className="mt-1 text-base font-black text-fg">에셋 사용·배포 준비 상태</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-fg-3">
            권리, 품질, 폰트, 플러그인 권한과 배포 대상을 한 화면에서 확인합니다.
          </p>
        </div>
        <span className={cn("rounded-full border px-3 py-1.5 text-xs font-black", tone(report.status))}>
          {statusLabel(report.status, locale)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          icon={BadgeCheck}
          label="품질"
          description={report.quality.message}
          status={report.quality.status}
          locale={locale}
        />
        <StatusCard
          icon={FileCheck2}
          label="권리"
          description={report.rights.message}
          status={report.rights.status}
          locale={locale}
        />
        <StatusCard
          icon={Type}
          label="폰트"
          description={report.fonts.message}
          status={report.fonts.status}
          locale={locale}
        />
        <StatusCard
          icon={Plug}
          label="플러그인"
          description={report.plugins.message}
          status={report.plugins.status}
          locale={locale}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-line bg-card/65 p-4">
          <div className="flex items-center gap-2">
            <Cloud size={16} className="text-accent" aria-hidden="true" />
            <h3 className="text-sm font-black text-fg">배포 대상</h3>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {STUDIO_ASSET_DESTINATIONS.map((destination) => (
              <CheckOption
                key={destination}
                checked={preferences.destinations.includes(destination)}
                label={DESTINATION_LABELS[destination]}
                description={`${DESTINATION_LABELS[destination]}에 게시할 준비 상태를 검사합니다.`}
                onChange={(checked) => setDestination(destination, checked)}
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-card/65 p-4">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-accent" aria-hidden="true" />
            <h3 className="text-sm font-black text-fg">플러그인 권한</h3>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {STUDIO_PLUGIN_PERMISSIONS.map((permission) => (
              <CheckOption
                key={permission}
                checked={preferences.pluginPermissions.includes(permission)}
                label={PERMISSION_LABELS[permission]}
                description={`${PERMISSION_LABELS[permission]} 권한을 허용합니다.`}
                onChange={(checked) => setPluginPermission(permission, checked)}
              />
            ))}
          </div>
        </div>
      </div>

      {report.messages.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-warning/35 bg-warning-soft/10 p-4">
          <div className="flex items-start gap-2">
            <CircleAlert size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-black text-fg">확인할 항목</h3>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-fg-3">
                {report.messages.map((message) => (
                  <li key={message}>• {message}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-success/35 bg-success-soft/10 p-4 text-sm font-bold text-success">
          <Store size={16} aria-hidden="true" />
          선택한 배포 대상에 사용할 준비가 되었습니다.
        </div>
      )}
    </section>
  );
}
