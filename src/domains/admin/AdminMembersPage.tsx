import { ArrowLeft, Ban, RefreshCw, RotateCcw, Search, UserX, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";

import { loadAdminI18nLocale } from "./admin-i18n-loader";
import { adminFetch, formatNum, type AdminApiError } from "./components/admin-client";
import { AdminGateFallback } from "./components/admin-gate";
import { useAdminGate } from "./components/admin-gate-state";

import { Container } from "@/components/section";
import { useI18n, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import Link from "@/src/compat/router-link";
import { useDocumentTitle } from "@/src/hooks/use-document-title";

interface MemberRow {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  suspendedAt: string | null;
  suspensionReason: string | null;
  deletedAt: string | null;
  createdAt: string | null;
  postCount: number;
  reviewCount: number;
}
const ROLE_TONE: Record<string, string> = {
  admin: "bg-accent/15 text-accent",
  operator: "bg-good/15 text-good",
  creator: "bg-warn/15 text-warn",
  user: "bg-raised/70 text-fg-3",
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-good/15 text-good",
  suspended: "bg-warn/15 text-warn",
  deleted: "bg-bad/15 text-bad",
};

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString() : "—");

// 회원 관리 분할 라우트(/admin/members) — 검색·역할 변경(자기 자신 제외).
export function AdminMembersPage() {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  useDocumentTitle(t("admin.members.title"));
  const { gate, uid } = useAdminGate();

  useEffect(() => {
    void loadAdminI18nLocale(lang);
  }, [lang]);

  return (
    <Container size="wide" className="py-10">
      <header className="mb-8">
        <p className="eyebrow flex items-center gap-1.5 text-accent">
          <UsersRound size={13} /> {t("admin.members.eyebrow")}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t("admin.members.title")}</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-3">
          {t("admin.members.desc")}
        </p>
        <Link href="/admin" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent">
          <ArrowLeft size={13} />
          {t("admin.members.backToConsole")}
        </Link>
      </header>

      <AdminGateFallback gate={gate} />
      {gate.kind === "admin" && uid && <MemberBoard uid={uid} selfId={gate.me.id} />}
    </Container>
  );
}

function MemberBoard({ uid, selfId }: { uid: string; selfId: string }) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [queryText, setQueryText] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const t = useT();

  const roles = [
    { value: "user", label: t("admin.members.roleUser") },
    { value: "creator", label: t("admin.members.roleCreator") },
    { value: "operator", label: t("admin.members.roleOperator") },
    { value: "admin", label: t("admin.members.roleAdmin") },
  ] as const;

  const statusLabels: Record<string, string> = {
    active: t("admin.members.statusActive"),
    suspended: t("admin.members.statusSuspended"),
    deleted: t("admin.members.statusDeleted"),
  };

  useEffect(() => {
    const timer = setTimeout(() => setQueryText(searchText.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: "100" });
    if (queryText) params.set("q", queryText);
    adminFetch<{ items: MemberRow[] }>(`/users?${params.toString()}`, uid)
      .then((data) => alive && setMembers(data.items ?? []))
      .catch((e: AdminApiError) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [queryText, refreshTick, uid]);

  async function changeRole(member: MemberRow, role: string) {
    if (busyId || role === member.role || member.status === "deleted") return;
    const roleLabel = roles.find((item) => item.value === role)?.label ?? role;
    if (!globalThis.confirm(`${member.name ?? member.email ?? member.id} -> "${roleLabel}"?`)) return;
    setBusyId(member.id);
    setActionError(null);
    try {
      await adminFetch(`/users/${encodeURIComponent(member.id)}/role`, uid, {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      setMembers((current) => current.map((item) => (item.id === member.id ? { ...item, role } : item)));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Role change failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(member: MemberRow, status: "active" | "suspended") {
    if (busyId || member.status === status || member.status === "deleted") return;
    const reason =
      status === "suspended"
        ? globalThis.prompt(`${member.name ?? member.email ?? member.id}`, member.suspensionReason ?? "")
        : "";
    if (status === "suspended" && reason === null) return;
    if (status === "active" && !globalThis.confirm(`${member.name ?? member.email ?? member.id}`)) return;
    setBusyId(member.id);
    setActionError(null);
    try {
      const result = await adminFetch<Partial<MemberRow>>(`/users/${encodeURIComponent(member.id)}/status`, uid, {
        method: "POST",
        body: JSON.stringify({ status, reason }),
      });
      setMembers((current) =>
        current.map((item) =>
          item.id === member.id
            ? {
                ...item,
                status: result.status ?? status,
                suspendedAt: result.suspendedAt ?? null,
                suspensionReason: result.suspensionReason ?? null,
                deletedAt: result.deletedAt ?? null,
              }
            : item
        )
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Status update failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteMember(member: MemberRow) {
    if (busyId || member.status === "deleted") return;
    if (!globalThis.confirm(`${member.name ?? member.email ?? member.id}`)) return;
    const reason = globalThis.prompt("Reason:", "admin soft delete");
    if (reason === null) return;
    setBusyId(member.id);
    setActionError(null);
    try {
      const result = await adminFetch<Partial<MemberRow>>(`/users/${encodeURIComponent(member.id)}`, uid, {
        method: "DELETE",
        body: JSON.stringify({ reason }),
      });
      setMembers((current) =>
        current.map((item) =>
          item.id === member.id
            ? {
                ...item,
                name: t("admin.members.statusDeleted"),
                email: null,
                role: "user",
                status: "deleted",
                suspendedAt: null,
                suspensionReason: null,
                deletedAt: result.deletedAt ?? new Date().toISOString(),
              }
            : item
        )
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-xl border border-line bg-canvas/40 px-3 py-2 text-xs">
          <Search size={14} />
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            maxLength={80}
            placeholder={t("admin.members.searchPlaceholder")}
            className="h-7 w-56 min-w-0 border-none bg-transparent text-xs outline-none placeholder:text-fg-3"
          />
        </div>
        <span className="text-xs text-fg-3">
          {loading ? t("admin.ui.loading") : t("admin.members.countShowing").replace("{count}", formatNum(members.length))}
        </span>
        <button
          type="button"
          onClick={() => setRefreshTick((tick) => tick + 1)}
          className="ml-auto inline-flex items-center gap-1 text-xs text-fg-3 transition-colors hover:text-fg"
        >
          <RefreshCw size={13} className={cn(loading && "animate-spin motion-reduce:animate-none")} /> {t("admin.members.refresh")}
        </button>
      </div>

      {(error || actionError) && (
        <p className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{error ?? actionError}</p>
      )}

      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card/40 p-10 text-center text-sm text-fg-3">
          {t("admin.members.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-card/60">
          <table className="w-full min-w-[860px] text-left text-sm">
            <caption className="sr-only">{t("admin.members.title")}</caption>
            <thead>
              <tr className="border-b border-line text-[0.7rem] uppercase tracking-wide text-fg-3">
                <th scope="col" className="px-4 py-3 font-medium">{t("admin.members.colMember")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("admin.members.colStatus")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("admin.members.colRole")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("admin.members.colActivity")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("admin.members.colJoined")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("admin.members.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isSelf = member.id === selfId;
                const busy = busyId === member.id;
                return (
                  <tr key={member.id} className="border-b border-line/60 last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-fg">{member.name ?? "—"}</p>
                      <p className="text-[0.7rem] text-fg-3">{member.email ?? member.id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[0.68rem] font-medium",
                          STATUS_TONE[member.status] ?? STATUS_TONE.active
                        )}
                      >
                        {statusLabels[member.status] ?? member.status}
                      </span>
                      {member.suspensionReason && member.status === "suspended" && (
                        <p className="mt-1 max-w-[11rem] truncate text-[0.65rem] text-fg-3" title={member.suspensionReason}>
                          {member.suspensionReason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[0.68rem] font-medium",
                          ROLE_TONE[member.role] ?? ROLE_TONE.user
                        )}
                      >
                        {roles.find((item) => item.value === member.role)?.label ?? member.role}
                      </span>
                      {isSelf && <span className="ml-1.5 text-[0.65rem] text-fg-3">{t("admin.members.selfTag")}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-2">
                      {formatNum(member.postCount)} / {formatNum(member.reviewCount)}
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-3">{formatDate(member.createdAt)}</td>
                    <td className="px-4 py-3">
                      <label className="sr-only" htmlFor={`role-${member.id}`}>
                        {member.name ?? member.id}
                      </label>
                      <select
                        id={`role-${member.id}`}
                        value={member.role}
                        disabled={isSelf || busy || member.status === "deleted"}
                        onChange={(event) => void changeRole(member, event.target.value)}
                        className="rounded-lg border border-line bg-card px-2 py-1.5 text-xs text-fg outline-none focus:border-accent/50 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {roles.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {member.status === "suspended" ? (
                          <button
                            type="button"
                            onClick={() => void changeStatus(member, "active")}
                            disabled={isSelf || busy}
                            className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[0.68rem] text-fg-2 transition-colors hover:border-good/45 hover:text-good disabled:opacity-45"
                          >
                            <RotateCcw size={11} />
                            {t("admin.members.restore")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void changeStatus(member, "suspended")}
                            disabled={isSelf || busy || member.status === "deleted"}
                            className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[0.68rem] text-fg-2 transition-colors hover:border-warn/45 hover:text-warn disabled:opacity-45"
                          >
                            <Ban size={11} />
                            {t("admin.members.suspend")}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void deleteMember(member)}
                          disabled={isSelf || busy || member.status === "deleted"}
                          className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[0.68rem] text-fg-3 transition-colors hover:border-bad/45 hover:text-bad disabled:opacity-45"
                        >
                          <UserX size={11} />
                          {t("admin.members.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
