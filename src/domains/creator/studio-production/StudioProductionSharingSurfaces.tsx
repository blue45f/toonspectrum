import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  LockKeyhole,
  Network,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  formatStudioProductionDate,
} from "./studio-production-format";
import {
  STUDIO_SHARE_ROLES,
  buildStudioInviteHref,
  createStudioShareGrant,
  isStudioShareGrantActive,
  joinStudioProductionWorkspace,
  type StudioParticipant,
  type StudioShareGrant,
  type StudioShareRole,
} from "./studio-production-model";
import {
  STUDIO_PRODUCTION_INPUT_CLASS,
  StudioProductionCard,
  StudioProductionEmpty,
  StudioProductionField,
  StudioProductionMetric,
  StudioProductionPill,
} from "./StudioProductionUi";

import type { StudioProductionSurfaceProps } from "./studio-production-component-types";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Readonly<Record<StudioShareRole, string>> = {
  viewer: "보기",
  commenter: "댓글",
  editor: "편집",
  producer: "프로듀서",
};

const ROLE_CAPABILITIES: Readonly<Record<StudioShareRole, readonly string[]>> = {
  viewer: ["프로젝트 현황 보기", "피치 자료 보기"],
  commenter: ["보기 권한", "리뷰 댓글", "검수 이슈 제안"],
  editor: ["댓글 권한", "회차 상태·담당 변경", "검수 이슈 해결", "피치 편집"],
  producer: ["편집 권한", "출시 승인", "버전 복원", "공유·참여자 관리"],
};

function grantTone(grant: StudioShareGrant) {
  if (grant.revokedAt !== null) return "danger" as const;
  if (!isStudioShareGrantActive(grant)) return "warning" as const;
  return "success" as const;
}

function grantStatus(grant: StudioShareGrant): string {
  if (grant.revokedAt !== null) return "취소됨";
  if (!isStudioShareGrantActive(grant)) return "만료됨";
  return "활성";
}

function roleTone(role: StudioShareRole) {
  if (role === "producer") return "danger" as const;
  if (role === "editor") return "warning" as const;
  if (role === "commenter") return "accent" as const;
  return "neutral" as const;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }
}

function origin(): string {
  try {
    return globalThis.location?.origin ?? "";
  } catch {
    return "";
  }
}

export function StudioProductionShareSurface({
  workspace,
  scope,
  commit,
}: StudioProductionSurfaceProps) {
  const [label, setLabel] = useState("외부 검수 링크");
  const [role, setRole] = useState<StudioShareRole>("commenter");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [downloadsAllowed, setDownloadsAllowed] = useState(false);
  const [watermark, setWatermark] = useState(true);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const activeGrants = workspace.shareGrants.filter((grant) => isStudioShareGrantActive(grant));
  const pendingParticipants = workspace.participants.filter((participant) => participant.status === "pending");
  const onlineParticipants = workspace.participants.filter((participant) => participant.status === "online");

  const createGrant = () => {
    const grant = createStudioShareGrant({
      label,
      role,
      expiresInDays,
      downloadsAllowed,
      watermark,
      approvalRequired,
    });
    commit(
      { action: "공유 링크 생성", detail: `${grant.label} · ${ROLE_LABELS[grant.role]}` },
      (current) => ({ ...current, shareGrants: [grant, ...current.shareGrants] }),
    );
    setCopyStatus("링크가 생성되었습니다.");
  };

  const inviteHref = (grant: StudioShareGrant) => buildStudioInviteHref(grant, scope, origin());

  const copyGrant = async (grant: StudioShareGrant) => {
    const copied = await copyText(inviteHref(grant));
    setCopyStatus(copied ? `${grant.label} 링크를 복사했습니다.` : "클립보드에 복사하지 못했습니다.");
  };

  const shareGrant = async (grant: StudioShareGrant) => {
    const shareNavigator = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
    };
    if (!shareNavigator.share) {
      await copyGrant(grant);
      return;
    }
    try {
      await shareNavigator.share({
        title: `${workspace.title} 초대`,
        text: `${ROLE_LABELS[grant.role]} 권한으로 Studio 제작 운영 공간에 초대합니다.`,
        url: inviteHref(grant),
      });
      setCopyStatus("시스템 공유 창을 열었습니다.");
    } catch {
      setCopyStatus("공유가 취소되었거나 지원되지 않습니다.");
    }
  };

  const revokeGrant = (grant: StudioShareGrant) => {
    const nowIso = new Date().toISOString();
    commit(
      { action: "공유 링크 취소", detail: grant.label },
      (current) => ({
        ...current,
        shareGrants: current.shareGrants.map((item) => (
          item.id === grant.id ? { ...item, revokedAt: nowIso } : item
        )),
      }),
    );
  };

  const extendGrant = (grant: StudioShareGrant) => {
    const next = new Date(Math.max(Date.now(), new Date(grant.expiresAt).getTime()));
    next.setUTCDate(next.getUTCDate() + 7);
    commit(
      { action: "공유 링크 연장", detail: `${grant.label} · 7일` },
      (current) => ({
        ...current,
        shareGrants: current.shareGrants.map((item) => (
          item.id === grant.id ? { ...item, expiresAt: next.toISOString(), revokedAt: null } : item
        )),
      }),
    );
  };

  const patchParticipant = (participant: StudioParticipant, patch: Partial<StudioParticipant>, action: string) => {
    commit(
      { action, detail: participant.name },
      (current) => ({
        ...current,
        participants: current.participants.map((item) => (
          item.id === participant.id ? { ...item, ...patch, lastSeenAt: new Date().toISOString() } : item
        )),
      }),
    );
  };

  return (
    <div className="space-y-4" data-studio-production-surface="share">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StudioProductionMetric label="활성 링크" value={`${activeGrants.length}개`} detail={`전체 ${workspace.shareGrants.length}개`} icon={<Link2 className="size-4" aria-hidden="true" />} tone="accent" />
        <StudioProductionMetric label="참여자" value={`${workspace.participants.length}명`} detail={`온라인 ${onlineParticipants.length}명`} icon={<Users className="size-4" aria-hidden="true" />} />
        <StudioProductionMetric label="승인 대기" value={`${pendingParticipants.length}명`} detail="입장 승인 필요" icon={<UserCheck className="size-4" aria-hidden="true" />} tone={pendingParticipants.length > 0 ? "warning" : "success"} />
        <StudioProductionMetric label="보호 링크" value={`${activeGrants.filter((grant) => grant.watermark || !grant.downloadsAllowed).length}개`} detail="워터마크 또는 다운로드 제한" icon={<ShieldCheck className="size-4" aria-hidden="true" />} tone="success" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(23rem,0.8fr)_minmax(28rem,1.2fr)]">
        <StudioProductionCard title="권한 기반 공유 링크" description="역할·만료·다운로드·워터마크·입장 승인 정책을 링크마다 분리합니다.">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              createGrant();
            }}
          >
            <StudioProductionField label="링크 이름">
              <input value={label} onChange={(event) => setLabel(event.currentTarget.value)} className={STUDIO_PRODUCTION_INPUT_CLASS} />
            </StudioProductionField>
            <div className="grid gap-3 sm:grid-cols-2">
              <StudioProductionField label="역할">
                <select value={role} onChange={(event) => setRole(event.currentTarget.value as StudioShareRole)} className={STUDIO_PRODUCTION_INPUT_CLASS}>
                  {STUDIO_SHARE_ROLES.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}
                </select>
              </StudioProductionField>
              <StudioProductionField label="만료" hint="1–90일">
                <input type="number" min={1} max={90} value={expiresInDays} onChange={(event) => setExpiresInDays(Math.max(1, Math.min(90, Number(event.currentTarget.value))))} className={STUDIO_PRODUCTION_INPUT_CLASS} />
              </StudioProductionField>
            </div>
            <div className="space-y-2 rounded-2xl border border-line bg-panel p-3">
              {[
                ["다운로드 허용", "검수자가 운영 패키지를 내려받을 수 있습니다.", downloadsAllowed, setDownloadsAllowed],
                ["워터마크 표시", "외부 검수 화면에 프로젝트 식별자를 표시합니다.", watermark, setWatermark],
                ["입장 승인 필요", "초대 수락 후 프로듀서가 승인해야 온라인 상태가 됩니다.", approvalRequired, setApprovalRequired],
              ].map(([title, description, checked, setter]) => (
                <label key={String(title)} className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-raised/60">
                  <input
                    type="checkbox"
                    aria-label={String(title)}
                    checked={Boolean(checked)}
                    onChange={(event) => (setter as (value: boolean) => void)(event.currentTarget.checked)}
                    className="mt-0.5 size-4 accent-accent"
                  />
                  <span>
                    <strong className="block text-xs text-fg">{title as string}</strong>
                    <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-fg-2">{description as string}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="rounded-2xl border border-accent/25 bg-accent-soft/50 p-3">
              <div className="flex items-center gap-2">
                <StudioProductionPill tone={roleTone(role)}>{ROLE_LABELS[role]}</StudioProductionPill>
                <span className="text-xs font-semibold text-fg">권한 미리보기</span>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-fg-2">
                {ROLE_CAPABILITIES[role].map((capability) => <li key={capability} className="flex gap-2"><Check className="mt-0.5 size-3.5 text-accent" aria-hidden="true" />{capability}</li>)}
              </ul>
            </div>
            <button type="submit" className={buttonClass({ className: "w-full" })}>
              <Link2 className="size-4" aria-hidden="true" /> 공유 링크 생성
            </button>
            {copyStatus ? <p className="text-center text-xs text-fg-2" role="status">{copyStatus}</p> : null}
          </form>
        </StudioProductionCard>

        <StudioProductionCard title="공유 링크 관리" description="링크는 같은 출처의 열린 Studio 탭 사이에서 BroadcastChannel로 동기화됩니다.">
          {workspace.shareGrants.length === 0 ? (
            <StudioProductionEmpty icon={<Link2 className="size-5" aria-hidden="true" />} title="아직 공유 링크가 없습니다" description="왼쪽에서 역할과 보안 정책을 고른 뒤 링크를 생성하세요." />
          ) : (
            <div className="space-y-2">
              {workspace.shareGrants.map((grant) => (
                <article key={grant.id} className="rounded-2xl border border-line bg-panel p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StudioProductionPill tone={grantTone(grant)}>{grantStatus(grant)}</StudioProductionPill>
                        <StudioProductionPill tone={roleTone(grant.role)}>{ROLE_LABELS[grant.role]}</StudioProductionPill>
                        {grant.watermark ? <StudioProductionPill>워터마크</StudioProductionPill> : null}
                        {!grant.downloadsAllowed ? <StudioProductionPill>다운로드 제한</StudioProductionPill> : null}
                        {grant.approvalRequired ? <StudioProductionPill tone="warning">승인형</StudioProductionPill> : null}
                      </div>
                      <h3 className="mt-2 text-sm font-bold text-fg">{grant.label}</h3>
                      <p className="mt-1 truncate font-mono text-[0.6875rem] text-fg-3">{inviteHref(grant)}</p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-fg-3">
                        <span>생성 {formatStudioProductionDate(grant.createdAt)}</span>
                        <span>만료 {formatStudioProductionDate(grant.expiresAt)}</span>
                        <span>{grant.lastOpenedAt ? `최근 열림 ${formatStudioProductionDate(grant.lastOpenedAt)}` : "아직 열리지 않음"}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" disabled={!isStudioShareGrantActive(grant)} className={buttonClass({ variant: "outline", size: "icon" })} onClick={() => void copyGrant(grant)} aria-label={`${grant.label} 복사`}><Copy className="size-4" aria-hidden="true" /></button>
                      <button type="button" disabled={!isStudioShareGrantActive(grant)} className={buttonClass({ variant: "outline", size: "icon" })} onClick={() => void shareGrant(grant)} aria-label={`${grant.label} 공유`}><Share2 className="size-4" aria-hidden="true" /></button>
                      <button type="button" className={buttonClass({ variant: "quiet", size: "sm" })} onClick={() => extendGrant(grant)}><RefreshCw className="size-4" aria-hidden="true" /> 7일 연장</button>
                      <button type="button" disabled={grant.revokedAt !== null} className={buttonClass({ variant: "quiet", size: "icon" })} onClick={() => revokeGrant(grant)} aria-label={`${grant.label} 취소`}><Trash2 className="size-4" aria-hidden="true" /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </StudioProductionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(28rem,1.2fr)_minmax(22rem,0.8fr)]">
        <StudioProductionCard title="참여자·입장 승인" description="승인형 링크로 들어온 참여자의 역할과 상태를 관리합니다.">
          <div className="space-y-2">
            {workspace.participants.map((participant) => (
              <article key={participant.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel p-3">
                <div className="grid size-9 place-items-center rounded-full bg-raised text-xs font-black text-fg">{participant.name.slice(0, 1)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm text-fg">{participant.name}</strong>
                    <StudioProductionPill tone={roleTone(participant.role)}>{ROLE_LABELS[participant.role]}</StudioProductionPill>
                    <StudioProductionPill tone={participant.status === "online" ? "success" : participant.status === "pending" ? "warning" : "neutral"}>
                      {participant.status === "online" ? "온라인" : participant.status === "pending" ? "승인 대기" : participant.status === "removed" ? "제거됨" : "오프라인"}
                    </StudioProductionPill>
                  </div>
                  <p className="mt-1 text-[0.6875rem] text-fg-3">참여 {formatStudioProductionDate(participant.joinedAt)} · 최근 {formatStudioProductionDate(participant.lastSeenAt)}</p>
                </div>
                {participant.id !== "participant-owner" && participant.status !== "removed" ? (
                  <div className="flex flex-wrap gap-2">
                    <select value={participant.role} onChange={(event) => patchParticipant(participant, { role: event.currentTarget.value as StudioShareRole }, "참여자 역할 변경")} className={cn(STUDIO_PRODUCTION_INPUT_CLASS, "w-auto min-w-28")} aria-label={`${participant.name} 역할`}>
                      {STUDIO_SHARE_ROLES.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}
                    </select>
                    {participant.status === "pending" ? (
                      <button type="button" className={buttonClass({ size: "sm" })} onClick={() => patchParticipant(participant, { status: "online" }, "참여자 입장 승인")}><UserCheck className="size-4" aria-hidden="true" /> 승인</button>
                    ) : null}
                    <button type="button" className={buttonClass({ variant: "quiet", size: "icon" })} onClick={() => patchParticipant(participant, { status: "removed" }, "참여자 제거")} aria-label={`${participant.name} 제거`}><XCircle className="size-4" aria-hidden="true" /></button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </StudioProductionCard>

        <StudioProductionCard title="최근 접근 기록" description="링크·권한·승인·버전 변경을 추적합니다.">
          <ol className="space-y-3">
            {workspace.audit.slice(0, 12).map((event) => (
              <li key={event.id} className="relative border-l border-line pl-4">
                <span className="absolute -left-1.5 top-1 size-3 rounded-full border-2 border-card bg-accent" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-xs text-fg">{event.action}</strong>
                  <time className="text-[0.6875rem] text-fg-3">{formatStudioProductionDate(event.createdAt)}</time>
                </div>
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-fg-2">{event.actor}{event.detail ? ` · ${event.detail}` : ""}</p>
              </li>
            ))}
          </ol>
        </StudioProductionCard>
      </div>
    </div>
  );
}

export function StudioProductionJoinSurface({
  workspace,
  scope,
  commit,
  initialToken,
}: StudioProductionSurfaceProps & { readonly initialToken: string }) {
  const [token, setToken] = useState(initialToken);
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<StudioParticipant | null>(null);
  const grant = useMemo(
    () => workspace.shareGrants.find((item) => item.token === token.trim()) ?? null,
    [token, workspace.shareGrants],
  );

  useEffect(() => setToken(initialToken), [initialToken]);

  const join = () => {
    if (!accepted) {
      setError("프로젝트 보안·권리 정책 확인에 동의해 주세요.");
      return;
    }
    const result = joinStudioProductionWorkspace(workspace, { token, name });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    commit(
      { action: "초대 링크 참여", detail: `${result.participant.name} · ${ROLE_LABELS[result.participant.role]}`, actor: result.participant.name },
      () => result.workspace,
    );
    setReceipt(result.participant);
    setError(null);
  };

  if (receipt) {
    return (
      <div className="grid min-h-[68vh] place-items-center" data-studio-production-surface="join">
        <StudioProductionCard className="w-full max-w-xl text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
            <CheckCircle2 className="size-7" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-fg">
            {receipt.status === "pending" ? "입장 승인을 요청했습니다" : "제작 공간에 참여했습니다"}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-2">
            {receipt.status === "pending"
              ? "프로듀서가 승인하면 참여자 목록에서 온라인 상태로 전환됩니다."
              : `${workspace.title}에 ${ROLE_LABELS[receipt.role]} 역할로 연결되었습니다.`}
          </p>
          <div className="mx-auto mt-5 flex max-w-sm flex-wrap items-center justify-center gap-2 rounded-2xl border border-line bg-panel p-4">
            <StudioProductionPill tone={roleTone(receipt.role)}>{ROLE_LABELS[receipt.role]}</StudioProductionPill>
            <StudioProductionPill tone={receipt.status === "pending" ? "warning" : "success"}>{receipt.status === "pending" ? "승인 대기" : "온라인"}</StudioProductionPill>
            <span className="text-xs text-fg-2">{receipt.name}</span>
          </div>
          <a href={scope.editorHref} className={cn(buttonClass({ className: "mt-5" }), "inline-flex")} data-studio-route-exit="editor">
            <ExternalLink className="size-4" aria-hidden="true" /> Studio 편집기 열기
          </a>
        </StudioProductionCard>
      </div>
    );
  }

  return (
    <div className="grid min-h-[68vh] place-items-center py-8" data-studio-production-surface="join">
      <div className="w-full max-w-4xl">
        <div className="mb-6 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <UserPlus className="size-7" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-fg">Studio 공동 제작 참여</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-fg-2">초대 코드를 검증하고, 부여될 역할과 보안 정책을 확인한 뒤 제작 공간에 참여합니다.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(22rem,0.9fr)_minmax(24rem,1.1fr)]">
          <StudioProductionCard title="초대 코드 확인" description="발급한 Studio 탭이 열려 있으면 같은 출처 탭 사이에서 초대 정보가 자동 동기화됩니다.">
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                join();
              }}
            >
              <StudioProductionField label="초대 코드">
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
                  <input value={token} onChange={(event) => { setToken(event.currentTarget.value); setError(null); }} className={cn(STUDIO_PRODUCTION_INPUT_CLASS, "pl-9 font-mono")} placeholder="ts-..." />
                </div>
              </StudioProductionField>
              <StudioProductionField label="표시 이름">
                <input value={name} onChange={(event) => { setName(event.currentTarget.value); setError(null); }} className={STUDIO_PRODUCTION_INPUT_CLASS} placeholder="팀에서 사용할 이름" />
              </StudioProductionField>
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-panel p-3">
                <input type="checkbox" aria-label="프로젝트 보안·권리 정책을 확인했습니다" checked={accepted} onChange={(event) => setAccepted(event.currentTarget.checked)} className="mt-0.5 size-4 accent-accent" />
                <span>
                  <strong className="block text-xs text-fg">프로젝트 보안·권리 정책을 확인했습니다</strong>
                  <span className="mt-1 block text-[0.6875rem] leading-relaxed text-fg-2">허가되지 않은 외부 공유, 에셋 재배포, 참여자 계정 양도를 하지 않습니다.</span>
                </span>
              </label>
              {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300" role="alert">{error}</p> : null}
              <button type="submit" className={buttonClass({ className: "w-full" })}>
                <Send className="size-4" aria-hidden="true" /> 참여 요청
              </button>
            </form>
          </StudioProductionCard>

          <StudioProductionCard title="초대 정책 미리보기" description={grant ? "검증된 초대 링크입니다." : "코드를 입력하면 역할과 정책을 확인합니다."}>
            {grant ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-accent/30 bg-accent-soft/55 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StudioProductionPill tone={grantTone(grant)}>{grantStatus(grant)}</StudioProductionPill>
                    <StudioProductionPill tone={roleTone(grant.role)}>{ROLE_LABELS[grant.role]}</StudioProductionPill>
                    {grant.approvalRequired ? <StudioProductionPill tone="warning">프로듀서 승인 필요</StudioProductionPill> : null}
                  </div>
                  <h2 className="mt-3 text-lg font-black text-fg">{grant.label}</h2>
                  <p className="mt-1 text-xs text-fg-2">{workspace.title} · 만료 {formatStudioProductionDate(grant.expiresAt)}</p>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-fg">허용되는 작업</h3>
                  <ul className="mt-2 space-y-2">
                    {ROLE_CAPABILITIES[grant.role].map((capability) => (
                      <li key={capability} className="flex gap-2 rounded-xl border border-line bg-panel p-3 text-xs text-fg-2">
                        <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />{capability}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-panel p-3">
                    <LockKeyhole className="size-4 text-fg-2" aria-hidden="true" />
                    <p className="mt-2 text-xs font-semibold text-fg">다운로드</p>
                    <p className="mt-1 text-[0.6875rem] text-fg-2">{grant.downloadsAllowed ? "허용" : "제한"}</p>
                  </div>
                  <div className="rounded-xl border border-line bg-panel p-3">
                    <ShieldCheck className="size-4 text-fg-2" aria-hidden="true" />
                    <p className="mt-2 text-xs font-semibold text-fg">워터마크</p>
                    <p className="mt-1 text-[0.6875rem] text-fg-2">{grant.watermark ? "표시" : "표시 안 함"}</p>
                  </div>
                </div>
              </div>
            ) : token.trim().length > 0 ? (
              <StudioProductionEmpty icon={<Network className="size-5" aria-hidden="true" />} title="초대 정보를 확인 중입니다" description="같은 출처의 발급 탭이 열려 있지 않거나 코드가 다른 프로젝트에서 발급되었을 수 있습니다." />
            ) : (
              <StudioProductionEmpty icon={<KeyRound className="size-5" aria-hidden="true" />} title="초대 코드를 입력하세요" description="역할, 만료일, 다운로드와 워터마크 정책을 참여 전에 확인할 수 있습니다." />
            )}
          </StudioProductionCard>
        </div>
      </div>
    </div>
  );
}
