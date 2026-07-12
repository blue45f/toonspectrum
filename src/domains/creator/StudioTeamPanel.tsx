import {
  AlertCircle,
  Check,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound,
  UsersRound,
  X,
  XCircle,
} from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  STUDIO_TEAM_ASSIGNABLE_ROLES,
  getStudioTeam,
  inviteStudioTeamMember,
  removeStudioTeamMember,
  respondToStudioTeamInvitation,
  updateStudioTeamMemberRole,
  type StudioTeamAssignableRole,
  type StudioTeamMember,
  type StudioTeamRole,
  type StudioTeamSnapshot,
  type StudioTeamStatus,
} from "./studio-team-client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface StudioTeamPanelProps {
  open: boolean;
  onClose: () => void;
  workId: string | null;
  loggedIn: boolean;
}

const ROLE_COPY: Record<StudioTeamRole, { label: string; description: string }> = {
  owner: { label: "소유자", description: "작품과 팀 권한을 모두 관리합니다." },
  admin: { label: "관리자", description: "팀원을 초대하고 역할을 관리합니다." },
  editor: { label: "편집자", description: "공동 저장 연결에 사용할 편집 역할입니다." },
  commenter: { label: "검토자", description: "서버 댓글 연결에 사용할 검토 역할입니다." },
  viewer: { label: "열람자", description: "공유 원고 연결에 사용할 읽기 역할입니다." },
};

const STATUS_COPY: Record<StudioTeamStatus, string> = {
  active: "참여 중",
  pending: "응답 대기",
  declined: "거절됨",
};

const CONTROL_CLASS =
  "min-h-11 rounded-lg border border-line bg-canvas px-3 text-sm text-fg outline-none transition-colors focus:border-accent/70 focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-45";

function isAssignableRole(value: string): value is StudioTeamAssignableRole {
  return (STUDIO_TEAM_ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

function initials(member: StudioTeamMember): string {
  return Array.from(member.name.trim() || member.userId)[0]?.toLocaleUpperCase("ko-KR") ?? "?";
}

function MemberAvatar({ member }: { member: StudioTeamMember }) {
  if (member.image) {
    return (
      <img
        alt=""
        className="size-10 shrink-0 rounded-full border border-line object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        src={member.image}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-raised text-xs font-bold text-fg-2"
    >
      {initials(member)}
    </span>
  );
}

function StatusBadge({ status }: { status: StudioTeamStatus }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-full border px-2 text-[0.7rem] font-semibold",
        status === "active" && "border-good/35 bg-good/10 text-good",
        status === "pending" && "border-warn/35 bg-warn/10 text-warn",
        status === "declined" && "border-bad/35 bg-bad/10 text-bad"
      )}
    >
      {STATUS_COPY[status]}
    </span>
  );
}

export interface StudioTeamPanelViewProps {
  loggedIn: boolean;
  workId: string | null;
  snapshot: StudioTeamSnapshot | null;
  loading: boolean;
  loadError: string | null;
  actionError: string | null;
  notice: string | null;
  busyAction: string | null;
  inviteUserId: string;
  inviteRole: StudioTeamAssignableRole;
  confirmRemoveUserId: string | null;
  onRetry: () => void;
  onInviteUserIdChange: (value: string) => void;
  onInviteRoleChange: (role: StudioTeamAssignableRole) => void;
  onInvite: (event: FormEvent<HTMLFormElement>) => void;
  onRoleChange: (userId: string, role: StudioTeamAssignableRole) => void;
  onRemoveRequest: (userId: string) => void;
  onRemoveCancel: () => void;
  onRemoveConfirm: (userId: string) => void;
  onInvitationRespond: (action: "accept" | "decline") => void;
}

/** 데이터 로딩과 분리된 순수 뷰. SSR 회귀 테스트와 향후 Storybook에서도 같은 상태 계약을 쓴다. */
export function StudioTeamPanelView({
  loggedIn,
  workId,
  snapshot,
  loading,
  loadError,
  actionError,
  notice,
  busyAction,
  inviteUserId,
  inviteRole,
  confirmRemoveUserId,
  onRetry,
  onInviteUserIdChange,
  onInviteRoleChange,
  onInvite,
  onRoleChange,
  onRemoveRequest,
  onRemoveCancel,
  onRemoveConfirm,
  onInvitationRespond,
}: StudioTeamPanelViewProps) {
  if (!loggedIn) {
    return (
      <div className="grid min-h-56 place-items-center px-5 py-8 text-center">
        <div className="max-w-xs">
          <UserRound className="mx-auto text-fg-3" size={28} aria-hidden="true" />
          <h3 className="mt-3 text-sm font-bold text-fg">로그인이 필요해요</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-fg-2">
            팀 초대와 작품 권한은 로그인한 계정에 안전하게 연결됩니다.
          </p>
        </div>
      </div>
    );
  }

  if (!workId) {
    return (
      <div className="grid min-h-56 place-items-center px-5 py-8 text-center">
        <div className="max-w-xs">
          <ShieldCheck className="mx-auto text-fg-3" size={28} aria-hidden="true" />
          <h3 className="mt-3 text-sm font-bold text-fg">작품을 먼저 저장해 주세요</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-fg-2">
            아직 서버에 저장되지 않은 원고예요. 작품을 한 번 저장하면 팀 권한을 설정할 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div aria-busy="true" aria-label="팀 작업 공간 불러오는 중" className="space-y-4 px-4 py-5">
        <div className="h-16 animate-pulse rounded-xl bg-raised/70 motion-reduce:animate-none" />
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex items-center gap-3 py-2">
              <span className="size-10 animate-pulse rounded-full bg-raised motion-reduce:animate-none" />
              <span className="h-8 flex-1 animate-pulse rounded-lg bg-raised/70 motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="grid min-h-56 place-items-center px-5 py-8 text-center" role="alert">
        <div className="max-w-xs">
          <AlertCircle className="mx-auto text-bad" size={28} aria-hidden="true" />
          <h3 className="mt-3 text-sm font-bold text-fg">팀 정보를 열지 못했어요</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-fg-2">{loadError}</p>
          <Button className="mt-4 min-h-11" size="sm" variant="outline" type="button" onClick={onRetry}>
            <RefreshCw size={15} aria-hidden="true" /> 다시 시도
          </Button>
        </div>
      </div>
    );
  }

  if (!snapshot) return null;

  const canManageMembers =
    snapshot.viewer.status === "active" &&
    (snapshot.viewer.role === "owner" || snapshot.viewer.role === "admin") &&
    snapshot.viewer.capabilities.manageMembers;
  const invitationPending = snapshot.viewer.status === "pending";
  const invitationReady = invitationPending && Boolean(snapshot.viewer.invitationId);

  return (
    <div className="space-y-5 px-4 py-4 sm:px-5">
      {invitationPending && (
        <section
          aria-labelledby="studio-team-invitation-title"
          className="rounded-xl border border-accent/35 bg-accent-soft/60 p-3"
        >
          <div className="flex items-start gap-2.5">
            <UserPlus className="mt-0.5 shrink-0 text-accent" size={18} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h3 id="studio-team-invitation-title" className="text-sm font-bold text-fg">
                팀 초대가 도착했어요
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-fg-2">
                {ROLE_COPY[snapshot.viewer.role].label} 권한으로 이 작품에 참여할 수 있습니다.
              </p>
            </div>
          </div>
          {!invitationReady ? (
            <p className="mt-3 rounded-lg border border-warn/35 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-fg-2">
              초대 조건이 갱신되었습니다. 패널을 닫았다가 다시 열어 최신 초대를 확인해 주세요.
            </p>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              className="min-h-11"
              disabled={busyAction != null || !invitationReady}
              size="sm"
              type="button"
              onClick={() => onInvitationRespond("accept")}
            >
              {busyAction === "invitation:accept" ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" size={15} aria-hidden="true" />
              ) : (
                <Check size={15} aria-hidden="true" />
              )}
              초대 수락
            </Button>
            <Button
              className="min-h-11"
              disabled={busyAction != null || !invitationReady}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => onInvitationRespond("decline")}
            >
              <XCircle size={15} aria-hidden="true" /> 초대 거절
            </Button>
          </div>
        </section>
      )}

      {snapshot.viewer.status === "declined" && (
        <p className="rounded-xl border border-line bg-card/70 px-3 py-3 text-xs leading-relaxed text-fg-2">
          이 작품의 팀 초대를 거절한 상태입니다. 다시 참여하려면 작품 관리자에게 새 초대를 요청하세요.
        </p>
      )}

      {(actionError || notice) && (
        <div
          aria-live={actionError ? "assertive" : "polite"}
          className={cn(
            "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed",
            actionError ? "border-bad/35 bg-bad/10 text-fg" : "border-good/35 bg-good/10 text-good"
          )}
          role={actionError ? "alert" : "status"}
        >
          {actionError ? (
            <AlertCircle className="mt-0.5 shrink-0" size={15} aria-hidden="true" />
          ) : (
            <Check className="mt-0.5 shrink-0" size={15} aria-hidden="true" />
          )}
          <span>{actionError ?? notice}</span>
        </div>
      )}

      {canManageMembers && (
        <section aria-labelledby="studio-team-invite-title">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 id="studio-team-invite-title" className="text-sm font-bold text-fg">
                팀원 초대
              </h3>
              <p className="mt-0.5 text-xs text-fg-3">가입한 사용자의 ID로 초대합니다.</p>
            </div>
            <ShieldCheck className="shrink-0 text-accent" size={18} aria-hidden="true" />
          </div>
          <form className="mt-3 space-y-2" onSubmit={onInvite}>
            <label className="block text-xs font-semibold text-fg-2" htmlFor="studio-team-invite-user-id">
              사용자 ID
            </label>
            <input
              autoComplete="off"
              className={cn(CONTROL_CLASS, "w-full")}
              disabled={busyAction != null}
              id="studio-team-invite-user-id"
              maxLength={160}
              placeholder="예: creator_1234"
              spellCheck={false}
              type="text"
              value={inviteUserId}
              onChange={(event) => onInviteUserIdChange(event.target.value)}
            />
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <label className="sr-only" htmlFor="studio-team-invite-role">
                초대 역할
              </label>
              <select
                className={cn(CONTROL_CLASS, "w-full")}
                disabled={busyAction != null}
                id="studio-team-invite-role"
                value={inviteRole}
                onChange={(event) => {
                  if (isAssignableRole(event.target.value)) onInviteRoleChange(event.target.value);
                }}
              >
                {STUDIO_TEAM_ASSIGNABLE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_COPY[role].label}
                  </option>
                ))}
              </select>
              <Button
                className="min-h-11 px-4"
                disabled={busyAction != null || !inviteUserId.trim()}
                size="sm"
                type="submit"
              >
                {busyAction === "invite" ? (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" size={15} aria-hidden="true" />
                ) : (
                  <UserPlus size={15} aria-hidden="true" />
                )}
                초대
              </Button>
            </div>
            <p className="text-[0.72rem] leading-relaxed text-fg-3">
              <strong className="font-semibold text-fg-2">{ROLE_COPY[inviteRole].label}</strong>
              {" · "}
              {ROLE_COPY[inviteRole].description}
            </p>
          </form>
        </section>
      )}

      <section aria-labelledby="studio-team-members-title">
        <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
          <h3 id="studio-team-members-title" className="text-sm font-bold text-fg">
            {canManageMembers ? `멤버 ${snapshot.members.length}명` : "소유자와 내 정보"}
          </h3>
          <span className="text-[0.72rem] text-fg-3">
            내 역할 · {ROLE_COPY[snapshot.viewer.role].label}
          </span>
        </div>
        {!canManageMembers ? (
          <p className="mt-2 text-[0.72rem] leading-relaxed text-fg-3">
            전체 팀 명단은 소유자와 관리자에게만 표시됩니다.
          </p>
        ) : null}

        {snapshot.members.length === 0 ? (
          <div className="py-8 text-center">
            <UsersRound className="mx-auto text-fg-3" size={26} aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-fg">표시할 팀원이 없어요</p>
            <p className="mt-1 text-xs text-fg-3">
              권한이 있다면 위 초대 양식에서 첫 팀원을 추가할 수 있습니다.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line" aria-label="작품 팀원">
            {snapshot.members.map((member) => {
              const canEditMember =
                canManageMembers && !member.isOwner && member.userId !== snapshot.viewer.userId;
              const isUpdating = busyAction === `role:${member.userId}`;
              const isRemoving = busyAction === `remove:${member.userId}`;
              const confirmingRemove = confirmRemoveUserId === member.userId;

              return (
                <li className="py-3" key={member.userId}>
                  <div className="flex items-start gap-3">
                    <MemberAvatar member={member} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="min-w-0 truncate text-sm font-semibold text-fg">{member.name}</p>
                        {member.userId === snapshot.viewer.userId && (
                          <span className="text-[0.7rem] font-semibold text-accent">나</span>
                        )}
                        <StatusBadge status={member.status} />
                      </div>
                      <p className="mt-0.5 truncate text-[0.72rem] text-fg-3">{member.userId}</p>
                      {!canEditMember && (
                        <p className="mt-1 text-xs text-fg-2">{ROLE_COPY[member.role].label}</p>
                      )}
                    </div>
                  </div>

                  {canEditMember && !confirmingRemove && (
                    <div
                      className="mt-2 grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2 pl-[3.25rem]"
                      data-team-manage-controls="true"
                    >
                      <label className="sr-only" htmlFor={`studio-team-role-${member.userId}`}>
                        {member.name} 역할
                      </label>
                      <select
                        aria-label={`${member.name} 역할`}
                        className={cn(CONTROL_CLASS, "w-full")}
                        disabled={busyAction != null}
                        id={`studio-team-role-${member.userId}`}
                        value={member.role === "owner" ? "viewer" : member.role}
                        onChange={(event) => {
                          if (isAssignableRole(event.target.value)) {
                            onRoleChange(member.userId, event.target.value);
                          }
                        }}
                      >
                        {STUDIO_TEAM_ASSIGNABLE_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_COPY[role].label}
                          </option>
                        ))}
                      </select>
                      <button
                        aria-label={`${member.name} 팀에서 내보내기`}
                        className="grid size-11 place-items-center rounded-lg border border-line text-fg-3 transition-colors hover:border-bad/45 hover:bg-bad/10 hover:text-bad focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-45"
                        disabled={busyAction != null}
                        title="팀에서 내보내기"
                        type="button"
                        onClick={() => onRemoveRequest(member.userId)}
                      >
                        {isUpdating || isRemoving ? (
                          <LoaderCircle className="animate-spin motion-reduce:animate-none" size={16} aria-hidden="true" />
                        ) : (
                          <Trash2 size={16} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  )}

                  {canEditMember && confirmingRemove && (
                    <div
                      className="mt-2 rounded-xl border border-bad/35 bg-bad/10 p-2.5 pl-3"
                      data-team-remove-confirmation="true"
                    >
                      <p className="text-xs leading-relaxed text-fg">
                        <strong className="font-semibold">{member.name}</strong> 님을 팀에서 내보낼까요?
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Button
                          className="min-h-11"
                          disabled={busyAction != null}
                          size="sm"
                          type="button"
                          variant="quiet"
                          onClick={onRemoveCancel}
                        >
                          취소
                        </Button>
                        <Button
                          className="min-h-11 border-bad/45 text-bad hover:bg-bad/10 hover:text-bad"
                          disabled={busyAction != null}
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() => onRemoveConfirm(member.userId)}
                        >
                          팀에서 내보내기
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <details className="rounded-xl border border-line bg-card/35 px-3 py-2.5">
        <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
          역할별 서버 권한 안내
        </summary>
        <dl className="space-y-2 border-t border-line pt-3">
          {(Object.keys(ROLE_COPY) as StudioTeamRole[]).map((role) => (
            <div className="grid grid-cols-[4.25rem_1fr] gap-2 text-xs" key={role}>
              <dt className="font-semibold text-fg">{ROLE_COPY[role].label}</dt>
              <dd className="leading-relaxed text-fg-3">{ROLE_COPY[role].description}</dd>
            </div>
          ))}
        </dl>
      </details>

      <p className="border-t border-line pt-3 text-[0.72rem] leading-relaxed text-fg-3">
        현재는 서버 멤버·초대·역할 관리 단계입니다. 공동 저장·서버 댓글·접속 상태는 이 권한에
        순차적으로 연결됩니다.
      </p>
    </div>
  );
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function StudioTeamPanel({ open, onClose, workId, loggedIn }: StudioTeamPanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [snapshot, setSnapshot] = useState<StudioTeamSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<StudioTeamAssignableRole>("editor");
  const [confirmRemoveUserId, setConfirmRemoveUserId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const closeFromEffect = useEffectEvent(onClose);

  useEffect(() => {
    if (!open || !loggedIn || !workId) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    setNotice(null);

    void getStudioTeam(workId, controller.signal)
      .then((nextSnapshot) => {
        if (!controller.signal.aborted) setSnapshot(nextSnapshot);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSnapshot(null);
          setLoadError(messageFrom(error, "팀 작업 공간을 불러오지 못했습니다."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [loggedIn, open, reloadKey, workId]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const appRoot = document.getElementById("root");
    const previousRootInert = appRoot?.inert ?? false;
    document.body.style.overflow = "hidden";
    if (appRoot) appRoot.inert = true;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFromEffect();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (appRoot) appRoot.inert = previousRootInert;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  const visibleSnapshot = snapshot?.workId === workId ? snapshot : null;
  const shouldLoad = loggedIn && workId != null;
  const visibleLoading = shouldLoad && !loadError && (loading || visibleSnapshot == null);

  async function runMutation(
    key: string,
    successMessage: string,
    mutation: () => Promise<StudioTeamSnapshot>
  ): Promise<boolean> {
    if (busyAction) return false;
    setBusyAction(key);
    setActionError(null);
    setNotice(null);
    try {
      const nextSnapshot = await mutation();
      setSnapshot(nextSnapshot);
      setNotice(successMessage);
      setConfirmRemoveUserId(null);
      return true;
    } catch (error) {
      setActionError(messageFrom(error, "팀 권한을 변경하지 못했습니다."));
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const userId = inviteUserId.trim();
    if (!workId || !userId) return;
    void runMutation("invite", "팀 초대를 보냈습니다.", () =>
      inviteStudioTeamMember(workId, { userId, role: inviteRole })
    ).then((succeeded) => {
      if (succeeded) setInviteUserId("");
    });
  }

  function handleRoleChange(userId: string, role: StudioTeamAssignableRole) {
    if (!workId) return;
    void runMutation(`role:${userId}`, "팀원 역할을 변경했습니다.", () =>
      updateStudioTeamMemberRole(workId, userId, role)
    );
  }

  function handleRemove(userId: string) {
    if (!workId) return;
    void runMutation(`remove:${userId}`, "팀원을 내보냈습니다.", () =>
      removeStudioTeamMember(workId, userId)
    );
  }

  function handleInvitationRespond(action: "accept" | "decline") {
    if (!workId) return;
    const invitationId = visibleSnapshot?.viewer.invitationId;
    if (!invitationId) {
      setActionError("최신 초대 조건을 확인하지 못했습니다. 패널을 다시 열어 주세요.");
      return;
    }
    void runMutation(
      `invitation:${action}`,
      action === "accept" ? "팀 초대를 수락했습니다." : "팀 초대를 거절했습니다.",
      () => respondToStudioTeamInvitation(workId, action, invitationId)
    );
  }

  function handleBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  const panel = (
    // 닫기는 Escape와 명시적 버튼으로도 제공된다. 이 핸들러는 포인터 백드롭 전용이다.
    <div
      className="fixed inset-0 z-[70] bg-[oklch(0.08_0.01_70/0.72)] backdrop-blur-[2px]"
      data-testid="studio-team-panel-backdrop"
      onPointerDown={handleBackdropPointerDown}
    >
      <div
        ref={panelRef}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn(
          "absolute inset-x-0 bottom-[calc(7rem+env(safe-area-inset-bottom))] flex min-h-0 max-h-[min(72dvh,calc(100dvh-7.75rem-env(safe-area-inset-top)))] flex-col overflow-hidden rounded-t-2xl border border-line bg-panel text-fg shadow-[0_-18px_54px_oklch(0.05_0.01_70/0.48)]",
          "sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[26rem] sm:rounded-none sm:rounded-l-2xl sm:shadow-[-18px_0_54px_oklch(0.05_0.01_70/0.48)]"
        )}
        data-testid="studio-team-panel"
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-accent">
              <UsersRound size={17} aria-hidden="true" />
              <span className="text-xs font-semibold">서버 권한</span>
            </div>
            <h2 className="mt-1 text-base font-bold tracking-tight text-fg" id={titleId}>
              팀 작업 공간
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-3" id={descriptionId}>
              작품 멤버의 초대 상태와 역할을 관리합니다.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            aria-label="팀 작업 공간 닫기"
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            title="닫기"
            type="button"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div
          aria-busy={busyAction != null || visibleLoading}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))] [scrollbar-gutter:stable]"
        >
          <StudioTeamPanelView
            actionError={actionError}
            busyAction={busyAction}
            confirmRemoveUserId={confirmRemoveUserId}
            inviteRole={inviteRole}
            inviteUserId={inviteUserId}
            loadError={loadError}
            loading={visibleLoading}
            loggedIn={loggedIn}
            notice={notice}
            snapshot={visibleSnapshot}
            workId={workId}
            onInvitationRespond={handleInvitationRespond}
            onInvite={handleInvite}
            onInviteRoleChange={setInviteRole}
            onInviteUserIdChange={setInviteUserId}
            onRemoveCancel={() => setConfirmRemoveUserId(null)}
            onRemoveConfirm={handleRemove}
            onRemoveRequest={setConfirmRemoveUserId}
            onRetry={() => setReloadKey((value) => value + 1)}
            onRoleChange={handleRoleChange}
          />
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? panel : createPortal(panel, document.body);
}
