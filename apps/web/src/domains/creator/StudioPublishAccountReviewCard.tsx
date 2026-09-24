import {
  BadgeCheck,
  Cloud,
  Globe2,
  Link2,
  LockKeyhole,
  MonitorCog,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { useId, useState } from "react";

import {
  resolveStudioPublishAudienceReview,
  studioPublishEnvironmentLabel,
  type StudioPublishAudienceMode,
  type StudioPublishEnvironment,
  type StudioPublisherIdentity,
  type StudioPublishVisibility,
} from "./studio-publish-review-safety";

import { cn } from "@/shared/lib/utils";

export interface StudioPublishAccountReviewCardProps {
  readonly identity: StudioPublisherIdentity;
  readonly environment: StudioPublishEnvironment;
  readonly visibility: StudioPublishVisibility;
  readonly confirmed: boolean;
  readonly onConfirmedChange: (confirmed: boolean) => void;
  readonly disabled?: boolean;
}

function EnvironmentIcon({ environment }: { environment: StudioPublishEnvironment }) {
  if (environment === "local") return <MonitorCog size={14} aria-hidden />;
  return <Cloud size={14} aria-hidden />;
}

function VisibilityIcon({ visibility }: { visibility: StudioPublishVisibility }) {
  if (visibility === "private") return <LockKeyhole size={14} aria-hidden />;
  if (visibility === "unlisted") return <Link2 size={14} aria-hidden />;
  return <Globe2 size={14} aria-hidden />;
}

export function StudioPublishAccountReviewCard({
  identity,
  environment,
  visibility,
  confirmed,
  onConfirmedChange,
  disabled = false,
}: StudioPublishAccountReviewCardProps) {
  const titleId = useId();
  const [audienceMode, setAudienceMode] = useState<StudioPublishAudienceMode>("anonymous");
  const audience = resolveStudioPublishAudienceReview(visibility, audienceMode);
  const environmentLabel = studioPublishEnvironmentLabel(environment);
  const authenticated = identity.id !== null;

  return (
    <section
      data-studio-publish-account-review
      aria-labelledby={titleId}
      className="rounded-2xl border border-line bg-panel/35 p-4"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
          <UserRound size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-accent">PUBLISHER SAFETY</p>
          <h2 id={titleId} className="mt-0.5 text-sm font-bold text-fg">
            이 계정의 작품으로 게시됩니다
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-3">
            게시 후 작품 소유자와 수정 권한은 아래 로그인 계정을 기준으로 기록됩니다.
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.68rem] font-bold",
            environment === "production"
              ? "border-bad/35 bg-bad/10 text-bad"
              : environment === "local"
                ? "border-good/35 bg-good/10 text-good"
                : "border-warning/35 bg-warning-soft text-warning",
          )}
        >
          <EnvironmentIcon environment={environment} />
          {environmentLabel}
        </span>
      </div>

      <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-card/65 px-3 text-xs">
        <div className="flex items-start gap-3 py-2.5">
          <dt className="w-16 shrink-0 text-fg-3">계정</dt>
          <dd className="min-w-0 font-semibold text-fg">
            <span className="block truncate">{identity.name}</span>
            {identity.email ? <span className="mt-0.5 block truncate font-normal text-fg-3">{identity.email}</span> : null}
          </dd>
        </div>
        <div className="flex items-center gap-3 py-2.5">
          <dt className="w-16 shrink-0 text-fg-3">권한</dt>
          <dd className="flex items-center gap-1.5 font-semibold text-fg">
            <BadgeCheck size={13} className="text-accent" aria-hidden />
            {identity.roleLabel}
          </dd>
        </div>
      </dl>

      {identity.elevated ? (
        <div role="alert" className="mt-3 flex gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2.5 text-xs leading-relaxed text-fg-2">
          <ShieldAlert size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <span>
            <strong className="text-fg">관리 권한 계정입니다.</strong> 테스트 작품도 이 계정의 운영 작품으로 기록되므로 제목·공개 범위·소유자를 다시 확인하세요.
          </span>
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-line bg-card/65 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <VisibilityIcon visibility={visibility} />
            독자 접근 미리보기
          </p>
          <div role="group" aria-label="독자 접근 미리보기 대상" className="inline-flex rounded-lg border border-line bg-canvas p-0.5">
            {(["signed-in", "anonymous"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={audienceMode === mode}
                onClick={() => setAudienceMode(mode)}
                className={cn(
                  "min-h-8 rounded-md px-2.5 text-[0.68rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  audienceMode === mode ? "bg-accent text-on-accent" : "text-fg-3 hover:bg-raised hover:text-fg",
                )}
              >
                {mode === "signed-in" ? "로그인 독자" : "비로그인 독자"}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs font-semibold text-fg">{audience.label}</p>
        <p className="mt-1 text-[0.7rem] leading-5 text-fg-3">{audience.description}</p>
      </div>

      <label
        className={cn(
          "mt-3 flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-relaxed transition-colors",
          confirmed ? "border-good/45 bg-good/10 text-fg" : "border-accent/35 bg-accent/5 text-fg-2",
          (!authenticated || disabled) && "cursor-not-allowed opacity-60",
        )}
      >
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!authenticated || disabled}
          onChange={(event) => onConfirmedChange(event.currentTarget.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
        />
        <span>
          <strong className="text-fg">{identity.name}</strong>
          {identity.email ? ` (${identity.email})` : ""} 계정의 작품으로 저장·게시되는 것을 확인했습니다.
        </span>
      </label>
      {!authenticated ? (
        <p role="alert" className="mt-2 text-xs text-bad">게시 소유자를 확인하려면 먼저 로그인해야 합니다.</p>
      ) : null}
    </section>
  );
}
