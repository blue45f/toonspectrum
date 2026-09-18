import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  Archive,
  ArrowLeft,
  BellOff,
  Check,
  ChevronRight,
  CircleSlash2,
  Flag,
  Inbox,
  LoaderCircle,
  Mail,
  MessageSquareText,
  MoreHorizontal,
  RefreshCw,
  Send,
  Settings2,
  ShieldAlert,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import Link from "@/compat/router-link";
import { useSession } from "@/compat/auth-session-store";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { getApiErrorMessage } from "@/infrastructure/api";
import {
  messagingClient,
  type MessagingBlockedUser,
  type MessagingMessage,
  type MessagingPreferences,
  type MessagingReportReason,
  type MessagingThreadDetail,
  type MessagingThreadSummary,
} from "@/infrastructure/messaging-client";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

type InboxTab = "active" | "requests" | "archived";

const TAB_OPTIONS: ReadonlyArray<{
  value: InboxTab;
  label: string;
  icon: typeof Mail;
}> = [
  { value: "active", label: "대화", icon: MessageSquareText },
  { value: "requests", label: "메시지 요청", icon: Inbox },
  { value: "archived", label: "보관함", icon: Archive },
];

const CATEGORY_LABELS = {
  feedback: "작품 피드백",
  collaboration: "협업 제안",
  business: "비즈니스 문의",
  general: "일반 문의",
} as const;

const REPORT_OPTIONS: ReadonlyArray<{
  value: MessagingReportReason;
  label: string;
}> = [
  { value: "harassment", label: "괴롭힘·모욕" },
  { value: "spam", label: "스팸" },
  { value: "scam", label: "사기·피싱" },
  { value: "sexual", label: "성적인 콘텐츠" },
  { value: "threat", label: "위협" },
  { value: "copyright", label: "저작권 침해" },
  { value: "other", label: "기타" },
];

function isInboxTab(value: string | null): value is InboxTab {
  return value === "active" || value === "requests" || value === "archived";
}

function formatTime(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat("ko-KR", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { month: "short", day: "numeric" }).format(date);
}

function UserAvatar({
  user,
  size = "md",
}: {
  user: MessagingThreadSummary["otherUser"];
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass = size === "lg" ? "size-12 text-base" : size === "sm" ? "size-8 text-xs" : "size-10 text-sm";
  if (user.image) {
    return (
      <img
        src={user.image}
        alt=""
        className={cn("shrink-0 rounded-full border border-line object-cover", sizeClass)}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-line bg-raised font-semibold text-fg-2",
        sizeClass
      )}
    >
      {user.avatar || user.name.charAt(0) || <UserRound size={16} />}
    </span>
  );
}

function ThreadListItem({
  thread,
  selected,
  tab,
}: {
  thread: MessagingThreadSummary;
  selected: boolean;
  tab: InboxTab;
}) {
  const preview = thread.lastMessage?.deletedAt
    ? "삭제된 메시지입니다."
    : thread.lastMessage?.body || "대화를 시작해 보세요.";
  return (
    <Link
      href={{
        pathname: `/messages/${encodeURIComponent(thread.id)}`,
        query: tab === "active" ? {} : { tab },
      }}
      className={cn(
        "group flex min-h-[76px] items-center gap-3 border-b border-line px-4 py-3 transition-colors last:border-b-0 hover:bg-raised/70",
        selected && "bg-accent-soft/70"
      )}
      aria-current={selected ? translateCurrentStaticSourceText("domains.messages.MessagesPage", "en", "page") : undefined}
    >
      <UserAvatar user={thread.otherUser} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <strong className="truncate text-sm text-fg">{thread.otherUser.name}</strong>
          {thread.state === "pending" && (
            <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-warn">
              {thread.incomingRequest ? translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "요청") : translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "수락 대기")}
            </span>
          )}
          {thread.blocked && <CircleSlash2 size={13} className="shrink-0 text-danger" aria-label={translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "차단됨")} />}
          <time className="ml-auto shrink-0 text-[0.6875rem] text-fg-3" dateTime={thread.lastMessageAt}>
            {formatTime(thread.lastMessageAt)}
          </time>
        </span>
        <span className="mt-1 flex items-center gap-2">
          <span className={cn("truncate text-xs", thread.unreadCount > 0 ? "font-semibold text-fg" : "text-fg-2")}>
            {preview}
          </span>
          {thread.unreadCount > 0 && (
            <span className="ml-auto grid min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 py-0.5 text-[0.625rem] font-bold text-on-accent">
              {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
            </span>
          )}
        </span>
      </span>
      <ChevronRight size={15} className="shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function MessageBubble({
  message,
  onReport,
}: {
  message: MessagingMessage;
  onReport: (message: MessagingMessage) => void;
}) {
  const context = message.type === "work_card" || message.type === "project_card"
    ? message.metadata.context
    : null;
  const linkedContext = context && typeof context === "object" && !Array.isArray(context)
    ? context as { label?: unknown; href?: unknown }
    : null;
  const label = typeof linkedContext?.label === "string" ? linkedContext.label : null;
  const href = typeof linkedContext?.href === "string" ? linkedContext.href : null;

  return (
    <div className={cn("group flex gap-2", message.mine ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[82%] sm:max-w-[72%]", message.mine && "text-right")}>
        {label && (
          <div className={cn(
            "mb-1 rounded-xl border border-line bg-panel px-3 py-2 text-left text-xs",
            message.mine ? "ml-auto" : "mr-auto"
          )}>
            <p className="font-semibold text-fg">{message.type === "project_card" ? translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "프로젝트") : translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "작품")}</p>
            {href ? (
              <Link href={href} className="mt-0.5 block truncate text-accent hover:underline">
                {label}
              </Link>
            ) : (
              <p className="mt-0.5 truncate text-fg-2">{label}</p>
            )}
          </div>
        )}
        <div className={cn(
          "rounded-2xl px-3.5 py-2.5 text-left text-sm leading-relaxed whitespace-pre-wrap break-words",
          message.mine
            ? "rounded-br-md bg-accent text-on-accent"
            : "rounded-bl-md border border-line bg-card text-fg"
        )}>
          {message.body}
        </div>
        <div className={cn("mt-1 flex items-center gap-1.5 text-[0.6875rem] text-fg-3", message.mine ? "justify-end" : "justify-start")}>
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          {message.mine && message.readByOther && <span>{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "읽음")}</span>}
          {!message.mine && (
            <button
              type="button"
              onClick={() => onReport(message)}
              className="opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100"
              aria-label={translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "메시지 신고")}
            >
              <Flag size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyInbox({ tab }: { tab: InboxTab }) {
  const copy = tab === "requests"
    ? ["새 메시지 요청이 없습니다.", "처음 연락하는 회원의 메시지는 이곳에서 먼저 확인할 수 있어요."]
    : tab === "archived"
      ? ["보관한 대화가 없습니다.", "정리한 대화는 언제든 다시 복원할 수 있어요."]
      : ["아직 대화가 없습니다.", "회원 프로필에서 작품 피드백이나 협업 메시지를 보내 보세요."];
  return (
    <div className="grid min-h-72 place-items-center px-6 text-center">
      <div>
        <Mail size={30} className="mx-auto text-fg-3" />
        <p className="mt-3 text-sm font-semibold text-fg">{copy[0]}</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-fg-2">{copy[1]}</p>
      </div>
    </div>
  );
}

function MessagingSettingsPanel({ onClose }: { onClose: () => void }) {
  const [preferences, setPreferences] = useState<MessagingPreferences | null>(null);
  const [blocks, setBlocks] = useState<MessagingBlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [preferenceResult, blockResult] = await Promise.all([
        messagingClient.getPreferences(),
        messagingClient.listBlocks(),
      ]);
      setPreferences(preferenceResult);
      setBlocks(blockResult.items);
    } catch (loadError) {
      setError(await getApiErrorMessage(loadError, "메시지 설정을 불러오지 못했어요."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updatePreference(input: Partial<Omit<MessagingPreferences, "updatedAt">>) {
    if (!preferences || saving) return;
    const previous = preferences;
    setPreferences({ ...preferences, ...input });
    setSaving(true);
    setError(null);
    try {
      setPreferences(await messagingClient.updatePreferences(input));
    } catch (updateError) {
      setPreferences(previous);
      setError(await getApiErrorMessage(updateError, "메시지 설정을 저장하지 못했어요."));
    } finally {
      setSaving(false);
    }
  }

  async function unblock(userId: string) {
    try {
      await messagingClient.unblockUser(userId);
      setBlocks((current) => current.filter((item) => item.user.id !== userId));
    } catch (unblockError) {
      setError(await getApiErrorMessage(unblockError, "차단을 해제하지 못했어요."));
    }
  }

  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-bg/95 p-5 backdrop-blur-sm sm:p-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "en", "MESSAGE SETTINGS")}</p>
            <h2 className="mt-1 text-xl font-bold">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "메시지 설정")}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-xl hover:bg-raised" aria-label={translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "설정 닫기")}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin text-accent" /></div>
        ) : (
          <div className="mt-6 space-y-5">
            {error && <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
            {preferences && (
              <section className="rounded-2xl border border-line bg-card p-5">
                <h3 className="font-semibold">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "새 메시지 요청")}</h3>
                <p className="mt-1 text-xs leading-relaxed text-fg-2">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "처음 연락하는 회원 중 누구의 요청을 받을지 정합니다.")}</p>
                <select
                  aria-label={translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "새 메시지 요청 수신 범위")}
                  value={preferences.receiveFrom}
                  onChange={(event) => void updatePreference({ receiveFrom: event.target.value as MessagingPreferences["receiveFrom"] })}
                  disabled={saving}
                  className="mt-4 h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
                >
                  <option value="everyone">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "모든 인증 회원")}</option>
                  <option value="followers">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "나를 팔로우한 회원")}</option>
                  <option value="mutuals">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "서로 팔로우한 회원")}</option>
                  <option value="nobody">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "새 요청 받지 않기")}</option>
                </select>
                <label
                  htmlFor="message-read-receipt"
                  aria-label={translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "읽음 표시 공유")}
                  className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-4"
                >
                  <span>
                    <span className="block text-sm font-medium">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "읽음 표시 공유")}</span>
                    <span className="mt-0.5 block text-xs text-fg-2">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "내가 메시지를 읽었는지 상대에게 보여 줍니다.")}</span>
                  </span>
                  <input
                    id="message-read-receipt"
                    type="checkbox"
                    checked={preferences.readReceipt}
                    onChange={(event) => void updatePreference({ readReceipt: event.target.checked })}
                    disabled={saving}
                    className="size-5 accent-accent"
                  />
                </label>
              </section>
            )}

            <section className="rounded-2xl border border-line bg-card p-5">
              <h3 className="font-semibold">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "차단한 회원")}</h3>
              <p className="mt-1 text-xs text-fg-2">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "차단한 회원과는 새 요청이나 메시지를 주고받을 수 없습니다.")}</p>
              {blocks.length === 0 ? (
                <p className="mt-4 rounded-xl bg-panel px-4 py-5 text-center text-sm text-fg-2">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "차단한 회원이 없습니다.")}</p>
              ) : (
                <ul className="mt-4 divide-y divide-line">
                  {blocks.map((item) => (
                    <li key={item.user.id} className="flex items-center gap-3 py-3">
                      <UserAvatar user={item.user} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.user.name}</span>
                      <button
                        type="button"
                        onClick={() => void unblock(item.user.id)}
                        className={buttonClass({ size: "sm", variant: "outline" })}
                      >
                        {translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "차단 해제")}</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

export function MessagesPage() {
  useDocumentTitle("메시지 · ToonStudio");
  const session = useSession();
  const authenticated = session.status === "authenticated";
  const { threadId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: InboxTab = isInboxTab(tabParam) ? tabParam : "active";
  const [threads, setThreads] = useState<MessagingThreadSummary[]>([]);
  const [detail, setDetail] = useState<MessagingThreadDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<MessagingMessage | null>(null);
  const [reportReason, setReportReason] = useState<MessagingReportReason>("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [olderLoading, setOlderLoading] = useState(false);
  const [sessionCheckTimedOut, setSessionCheckTimedOut] = useState(false);
  const messageViewportRef = useRef<HTMLDivElement>(null);
  const shouldScrollToLatestRef = useRef(true);

  const refreshThreads = useCallback(async (silent = false) => {
    if (!authenticated) return;
    if (!silent) setListLoading(true);
    setListError(null);
    try {
      const result = await messagingClient.listThreads(tab);
      setThreads(result.items);
    } catch (error) {
      if (!silent) setListError(await getApiErrorMessage(error, "메시지 목록을 불러오지 못했어요."));
    } finally {
      if (!silent) setListLoading(false);
    }
  }, [authenticated, tab]);

  const refreshDetail = useCallback(async (silent = false) => {
    if (!authenticated || !threadId) {
      setDetail(null);
      return;
    }
    if (!silent) setDetailLoading(true);
    setDetailError(null);
    try {
      const viewport = messageViewportRef.current;
      if (
        !silent ||
        !viewport ||
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120
      ) {
        shouldScrollToLatestRef.current = true;
      }
      const result = await messagingClient.getThread(threadId);
      setDetail((current) => {
        if (!silent || !current || current.thread.id !== result.thread.id) {
          return result;
        }
        const merged = new Map(current.messages.map((message) => [message.id, message]));
        result.messages.forEach((message) => merged.set(message.id, message));
        const messages = [...merged.values()].sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
        );
        return { ...result, messages, nextBefore: current.nextBefore };
      });
      const latest = result.messages.at(-1);
      if (latest && !latest.mine) {
        await messagingClient.markRead(threadId, latest.id).catch(() => undefined);
        setThreads((current) =>
          current.map((thread) =>
            thread.id === threadId ? { ...thread, unreadCount: 0 } : thread
          )
        );
        setDetail((current) =>
          current
            ? { ...current, thread: { ...current.thread, unreadCount: 0 } }
            : current
        );
      }
    } catch (error) {
      if (!silent) setDetailError(await getApiErrorMessage(error, "대화를 불러오지 못했어요."));
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }, [authenticated, threadId]);

  useEffect(() => {
    if (!authenticated) {
      setListLoading(false);
      return;
    }
    void refreshThreads();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshThreads(true);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [authenticated, refreshThreads]);

  useEffect(() => {
    void refreshDetail();
    if (!authenticated || !threadId) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshDetail(true);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [authenticated, refreshDetail, threadId]);

  useEffect(() => {
    shouldScrollToLatestRef.current = true;
    setOlderLoading(false);
  }, [threadId]);

  const latestMessageId = detail?.messages.at(-1)?.id ?? null;

  useEffect(() => {
    if (!shouldScrollToLatestRef.current || !latestMessageId) return;
    const frame = window.requestAnimationFrame(() => {
      const viewport = messageViewportRef.current;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
      shouldScrollToLatestRef.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [latestMessageId, threadId]);

  const selectedThread = detail?.thread ?? threads.find((item) => item.id === threadId) ?? null;
  const showMobileList = !threadId;

  const setTab = (next: InboxTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "active") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
    if (threadId) navigate(`/messages${next === "active" ? "" : `?tab=${next}`}`);
  };

  async function loadOlderMessages() {
    const before = detail?.nextBefore;
    if (!threadId || !before || olderLoading) return;
    const viewport = messageViewportRef.current;
    const previousHeight = viewport?.scrollHeight ?? 0;
    const previousTop = viewport?.scrollTop ?? 0;
    setOlderLoading(true);
    setDetailError(null);
    try {
      const page = await messagingClient.getThread(threadId, before);
      setDetail((current) => {
        if (!current || current.thread.id !== page.thread.id) return current;
        const merged = new Map(page.messages.map((message) => [message.id, message]));
        current.messages.forEach((message) => merged.set(message.id, message));
        const messages = [...merged.values()].sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
        );
        return {
          ...current,
          thread: page.thread,
          messages,
          nextBefore: page.nextBefore,
        };
      });
      window.requestAnimationFrame(() => {
        const nextViewport = messageViewportRef.current;
        if (nextViewport) {
          nextViewport.scrollTop = previousTop + nextViewport.scrollHeight - previousHeight;
        }
      });
    } catch (error) {
      setDetailError(await getApiErrorMessage(error, "이전 메시지를 불러오지 못했어요."));
    } finally {
      setOlderLoading(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = text.trim();
    if (!threadId || !normalized || busy) return;
    setBusy("send");
    setDetailError(null);
    try {
      const message = await messagingClient.sendMessage(threadId, { text: normalized });
      shouldScrollToLatestRef.current = true;
      setDetail((current) => current
        ? { ...current, messages: [...current.messages, message] }
        : current);
      setText("");
      void refreshThreads(true);
    } catch (error) {
      setDetailError(await getApiErrorMessage(error, "메시지를 보내지 못했어요."));
    } finally {
      setBusy(null);
    }
  }

  async function acceptRequest() {
    if (!threadId || busy) return;
    setBusy("accept");
    try {
      setDetail(await messagingClient.acceptRequest(threadId));
      void refreshThreads(true);
    } catch (error) {
      setDetailError(await getApiErrorMessage(error, "메시지 요청을 수락하지 못했어요."));
    } finally {
      setBusy(null);
    }
  }

  async function declineRequest() {
    if (!threadId || busy) return;
    setBusy("decline");
    try {
      await messagingClient.declineRequest(threadId);
      navigate("/messages?tab=requests");
      void refreshThreads();
    } catch (error) {
      setDetailError(await getApiErrorMessage(error, "메시지 요청을 거절하지 못했어요."));
    } finally {
      setBusy(null);
    }
  }

  async function toggleArchive() {
    if (!threadId || !selectedThread || busy) return;
    setBusy("archive");
    try {
      const archived = !selectedThread.archivedAt;
      await messagingClient.archiveThread(threadId, archived);
      navigate(archived ? "/messages" : `/messages/${encodeURIComponent(threadId)}`);
      void refreshThreads();
    } catch (error) {
      setDetailError(await getApiErrorMessage(error, "대화를 보관하지 못했어요."));
    } finally {
      setBusy(null);
    }
  }

  async function toggleMute() {
    if (!threadId || !selectedThread || busy) return;
    setBusy("mute");
    try {
      const until = selectedThread.mutedUntil
        ? null
        : new Date(Date.now() + 8 * 60 * 60_000).toISOString();
      await messagingClient.muteThread(threadId, until);
      await refreshDetail(true);
    } catch (error) {
      setDetailError(await getApiErrorMessage(error, "알림 설정을 변경하지 못했어요."));
    } finally {
      setBusy(null);
    }
  }

  async function blockOtherUser() {
    const target = selectedThread?.otherUser;
    if (!target || busy || selectedThread?.blocked) return;
    if (!window.confirm(`${target.name} 님을 차단할까요? 이후 새 메시지를 주고받을 수 없습니다.`)) return;
    setBusy("block");
    try {
      await messagingClient.blockUser(target.id);
      await refreshDetail(true);
      void refreshThreads(true);
    } catch (error) {
      setDetailError(await getApiErrorMessage(error, "회원을 차단하지 못했어요."));
    } finally {
      setBusy(null);
    }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportTarget || busy) return;
    setBusy("report");
    try {
      await messagingClient.reportMessage(reportTarget.id, reportReason, reportDetails.trim());
      setReportTarget(null);
      setReportDetails("");
    } catch (error) {
      setDetailError(await getApiErrorMessage(error, "메시지를 신고하지 못했어요."));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (session.ready) {
      setSessionCheckTimedOut(false);
      return;
    }
    const timeoutId = window.setTimeout(() => setSessionCheckTimedOut(true), 4_500);
    return () => window.clearTimeout(timeoutId);
  }, [session.ready]);

  const messages = useMemo(() => detail?.messages ?? [], [detail]);

  if (!session.ready && !sessionCheckTimedOut) {
    return (
      <div data-route-pending="" role="status" className="grid min-h-[55vh] place-items-center px-6 text-center">
        <div>
          <LoaderCircle className="mx-auto animate-spin text-accent" aria-hidden="true" />
          <p className="mt-3 text-sm text-fg-2">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "로그인 상태를 확인하고 있어요.")}</p>
        </div>
      </div>
    );
  }

  if (!session.ready) {
    return (
      <Container size="prose" className="py-16 sm:py-24">
        <div role="alert" className="rounded-3xl border border-warn/35 bg-card p-8 text-center shadow-sm sm:p-12">
          <Mail size={36} className="mx-auto text-warn" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-bold">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "메시지")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "로그인 상태를 확인하지 못했어요. 현재 주소는 유지되며 연결이 돌아오면 다시 확인할 수 있습니다.")}</p>
          <button type="button" onClick={() => window.location.reload()} className={buttonClass({ size: "sm", variant: "outline", className: "mt-5" })}>{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "다시 확인")}</button>
        </div>
      </Container>
    );
  }

  if (!authenticated) {
    return (
      <Container size="prose" className="py-16 sm:py-24">
        <div className="rounded-3xl border border-line bg-card p-8 text-center shadow-sm sm:p-12">
          <Mail size={36} className="mx-auto text-accent" />
          <h1 className="mt-4 text-2xl font-bold">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "로그인 후 메시지를 확인할 수 있어요.")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "상단의 로그인 버튼으로 로그인한 뒤 다시 열어 주세요.")}</p>
        </div>
      </Container>
    );
  }

  return (
    <Container size="wide" className="py-5 sm:py-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "en", "PRIVATE MESSAGES")}</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "메시지")}</h1>
          <p className="mt-1 text-sm text-fg-2">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "작품 피드백과 협업 제안을 안전하게 주고받으세요.")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void Promise.all([refreshThreads(), refreshDetail()])}
            className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1.5" })}
          >
            <RefreshCw size={14} className={(listLoading || detailLoading) ? translateCurrentStaticSourceText("domains.messages.MessagesPage", "en", "animate-spin") : ""} />
            {translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "새로고침")}</button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={buttonClass({ size: "sm", variant: "outline", className: "gap-1.5" })}
          >
            <Settings2 size={14} />
            {translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "설정")}</button>
        </div>
      </div>

      <div className="relative min-h-[620px] overflow-hidden rounded-3xl border border-line bg-panel shadow-sm lg:grid lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className={cn("border-r border-line bg-card", showMobileList ? "block" : "hidden lg:block")}>
          <div role="tablist" aria-label={translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "메시지함")} className="grid grid-cols-3 border-b border-line p-2">
            {TAB_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = option.value === tab;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(option.value)}
                  className={cn(
                    "flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition-colors",
                    active ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg"
                  )}
                >
                  <Icon size={14} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
          {listError && (
            <p role="alert" className="m-3 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">{listError}</p>
          )}
          {listLoading ? (
            <div className="grid min-h-72 place-items-center"><LoaderCircle className="animate-spin text-accent" /></div>
          ) : threads.length === 0 ? (
            <EmptyInbox tab={tab} />
          ) : (
            <div className="max-h-[660px] overflow-y-auto">
              {threads.map((thread) => (
                <ThreadListItem
                  key={thread.id}
                  thread={thread}
                  selected={thread.id === threadId}
                  tab={tab}
                />
              ))}
            </div>
          )}
        </aside>

        <div className={cn("relative min-w-0 bg-bg", showMobileList ? "hidden lg:block" : "block")}>
          {!threadId ? (
            <div className="grid min-h-[620px] place-items-center p-8 text-center">
              <div>
                <MessageSquareText size={38} className="mx-auto text-fg-3" />
                <h2 className="mt-4 text-lg font-semibold">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "대화를 선택해 주세요.")}</h2>
                <p className="mt-1 text-sm text-fg-2">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "메시지 요청은 수락하기 전까지 추가 메시지가 오지 않습니다.")}</p>
              </div>
            </div>
          ) : detailLoading ? (
            <div className="grid min-h-[620px] place-items-center"><LoaderCircle className="animate-spin text-accent" /></div>
          ) : detailError && !detail ? (
            <div className="grid min-h-[620px] place-items-center p-8 text-center">
              <div>
                <ShieldAlert size={34} className="mx-auto text-danger" />
                <p className="mt-3 text-sm text-danger">{detailError}</p>
                <button type="button" onClick={() => void refreshDetail()} className={buttonClass({ size: "sm", variant: "outline", className: "mt-4" })}>{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "다시 시도")}</button>
              </div>
            </div>
          ) : detail && selectedThread ? (
            <div className="flex min-h-[620px] flex-col">
              <header className="flex min-h-16 items-center gap-3 border-b border-line bg-card px-3 py-2 sm:px-5">
                <Link href="/messages" className="grid size-9 shrink-0 place-items-center rounded-xl hover:bg-raised lg:hidden" aria-label={translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "대화 목록으로")}>
                  <ArrowLeft size={17} />
                </Link>
                <UserAvatar user={selectedThread.otherUser} />
                <div className="min-w-0 flex-1">
                  <Link href={`/u/${encodeURIComponent(selectedThread.otherUser.id)}`} className="truncate text-sm font-semibold hover:underline">
                    {selectedThread.otherUser.name}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-fg-2">
                    {CATEGORY_LABELS[selectedThread.category]}
                    {selectedThread.context.label ? ` · ${selectedThread.context.label}` : ""}
                  </p>
                </div>
                <button type="button" onClick={() => void toggleMute()} disabled={Boolean(busy)} className="grid size-9 place-items-center rounded-xl hover:bg-raised" aria-label={selectedThread.mutedUntil ? translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "알림 켜기") : translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "8시간 알림 끄기")}>
                  {selectedThread.mutedUntil ? <VolumeX size={17} /> : <Volume2 size={17} />}
                </button>
                <button type="button" onClick={() => void toggleArchive()} disabled={Boolean(busy)} className="grid size-9 place-items-center rounded-xl hover:bg-raised" aria-label={selectedThread.archivedAt ? translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "보관 해제") : translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "대화 보관")}>
                  <Archive size={17} />
                </button>
                <div className="relative group/actions">
                  <button type="button" className="grid size-9 place-items-center rounded-xl hover:bg-raised" aria-label={translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "대화 메뉴")}>
                    <MoreHorizontal size={18} />
                  </button>
                  <div className="invisible absolute right-0 top-9 z-10 w-36 translate-y-1 rounded-xl border border-line bg-card p-1 opacity-0 shadow-lg transition group-focus-within/actions:visible group-focus-within/actions:translate-y-0 group-focus-within/actions:opacity-100 group-hover/actions:visible group-hover/actions:translate-y-0 group-hover/actions:opacity-100">
                    <button type="button" onClick={() => void blockOtherUser()} disabled={selectedThread.blocked || Boolean(busy)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-danger hover:bg-danger-soft disabled:opacity-50">
                      <CircleSlash2 size={14} />{selectedThread.blocked ? translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "차단됨") : translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "회원 차단")}
                    </button>
                  </div>
                </div>
              </header>

              {detailError && (
                <p role="alert" className="border-b border-danger/30 bg-danger-soft px-4 py-2 text-xs text-danger">{detailError}</p>
              )}

              {selectedThread.incomingRequest && (
                <section className="border-b border-line bg-warn-soft/60 px-4 py-4 sm:px-6">
                  <p className="text-sm font-semibold">{selectedThread.otherUser.name} {translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "님의 메시지 요청입니다.")}</p>
                  <p className="mt-1 text-xs text-fg-2">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "수락한 뒤에만 서로 추가 메시지를 보낼 수 있습니다.")}</p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => void acceptRequest()} disabled={Boolean(busy)} className={buttonClass({ size: "sm", variant: "solid", className: "gap-1.5" })}>
                      <Check size={14} /> {translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "수락")}</button>
                    <button type="button" onClick={() => void declineRequest()} disabled={Boolean(busy)} className={buttonClass({ size: "sm", variant: "outline" })}>{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "거절")}</button>
                  </div>
                </section>
              )}

              {selectedThread.blocked && (
                <div className="flex items-center gap-2 border-b border-danger/20 bg-danger-soft px-4 py-2 text-xs text-danger">
                  <BellOff size={14} /> {translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "차단 관계에서는 새 메시지를 보낼 수 없습니다.")}</div>
              )}

              <div
                ref={messageViewportRef}
                className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6"
              >
                {detail.nextBefore ? (
                  <div className="flex justify-center pb-1">
                    <button
                      type="button"
                      onClick={() => void loadOlderMessages()}
                      disabled={olderLoading}
                      className={buttonClass({
                        size: "sm",
                        variant: "quiet",
                        className: "gap-1.5",
                      })}
                    >
                      {olderLoading ? (
                        <LoaderCircle size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      {translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "이전 메시지 불러오기")}</button>
                  </div>
                ) : null}
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} onReport={setReportTarget} />
                ))}
              </div>

              <form onSubmit={sendMessage} className="border-t border-line bg-card p-3 sm:p-4">
                <div className="flex items-end gap-2 rounded-2xl border border-line bg-bg p-2 focus-within:border-accent">
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value.slice(0, 2_000))}
                    disabled={!selectedThread.canReply || Boolean(busy)}
                    rows={2}
                    placeholder={selectedThread.state === "pending" ? translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "요청이 수락되면 답장할 수 있어요.") : selectedThread.blocked ? translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "차단 관계에서는 메시지를 보낼 수 없어요.") : translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "메시지를 입력하세요.")}
                    className="min-h-11 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-fg-3 disabled:cursor-not-allowed"
                  />
                  <button
                    type="submit"
                    disabled={!selectedThread.canReply || !text.trim() || Boolean(busy)}
                    className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-on-accent transition hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "메시지 보내기")}
                  >
                    {busy === "send" ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}
                  </button>
                </div>
                <div className="mt-1.5 flex justify-between px-1 text-[0.6875rem] text-fg-3">
                  <span>{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "외부 링크를 열기 전 주소를 확인하세요.")}</span>
                  <span>{text.length.toLocaleString("ko-KR")}/2,000</span>
                </div>
              </form>
            </div>
          ) : null}
        </div>

        {settingsOpen && <MessagingSettingsPanel onClose={() => setSettingsOpen(false)} />}
      </div>

      {reportTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setReportTarget(null);
        }}>
          <form onSubmit={submitReport} className="w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="message-report-title">
            <div className="flex items-center justify-between">
              <h2 id="message-report-title" className="text-lg font-bold">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "메시지 신고")}</h2>
              <button type="button" onClick={() => setReportTarget(null)} className="grid size-9 place-items-center rounded-xl hover:bg-raised" aria-label={translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "신고 창 닫기")}><X size={17} /></button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-fg-2">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "신고한 메시지와 주변 대화가 운영 검토용 증거로 안전하게 보관됩니다.")}</p>
            <label className="mt-4 block text-sm font-medium">
              {translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "신고 사유")}<select value={reportReason} onChange={(event) => setReportReason(event.target.value as MessagingReportReason)} className="mt-2 h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-accent">
                {REPORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="mt-4 block text-sm font-medium">
              {translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "상세 내용 ")}<span className="font-normal text-fg-3">{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "(선택)")}</span>
              <textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value.slice(0, 1_000))} rows={4} className="mt-2 w-full resize-none rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setReportTarget(null)} className={buttonClass({ size: "sm", variant: "outline" })}>{translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "취소")}</button>
              <button type="submit" disabled={busy === "report"} className={buttonClass({ size: "sm", variant: "solid", className: "gap-1.5" })}>
                {busy === "report" ? <LoaderCircle size={14} className="animate-spin" /> : <Flag size={14} />} {translateCurrentStaticSourceText("domains.messages.MessagesPage", "ko", "신고 접수")}</button>
            </div>
          </form>
        </div>
      )}
    </Container>
  );
}
