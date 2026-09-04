import { Command } from "cmdk";
import {
  Activity,
  AlertTriangle,
  CreditCard,
  Download,
  Flag,
  Gauge,
  History,
  LayoutDashboard,
  Megaphone,
  Receipt,
  Search,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { adminFetch } from "./admin-client";

import { useT } from "@/lib/i18n";

interface AdminQuickPaletteProps {
  userId: string;
  onSelectTab: (tabKey: string) => void;
}

export function AdminQuickPalette({
  userId,
  onSelectTab,
}: AdminQuickPaletteProps) {
  const [open, setOpen] = useState(false);
  // A command palette should land on its input, but `autoFocus` grabs focus wherever the node
  // mounts and reads as an unexplained jump to a screen reader. Focusing on open is the same
  // behaviour, scoped to the moment the palette actually appears.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  const t = useT();

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (action: () => void) => {
    setOpen(false);
    action();
  };

  const handleExportUsers = async () => {
    try {
      const csv = await adminFetch<string>("/users/export/csv", userId);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "members.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("다운로드 실패");
    }
  };

  const handleExportRevenue = async () => {
    try {
      const csv = await adminFetch<string>("/revenue/export/csv", userId);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "revenue_ledger.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("다운로드 실패");
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-400 backdrop-blur-xl transition-all hover:border-slate-700 hover:text-slate-200 md:flex"
      >
        <Search className="size-3.5" />
        <span>{t("admin.palette.trigger")}</span>
        <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
          ⌘K
        </kbd>
      </button>
    );
  }

  const itemClass =
    "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-indigo-600/20 hover:text-indigo-300";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-20 backdrop-blur-md"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) setOpen(false);
      }}
    >
      <div className="animate-in fade-in zoom-in-95 w-full max-w-xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl duration-150">
        <Command className="w-full">
          <div className="flex items-center border-b border-slate-800 px-4">
            <Search className="mr-2 size-4 text-slate-400" />
            <Command.Input
              ref={inputRef}
              placeholder={t("admin.palette.placeholder")}
              className="w-full bg-transparent py-4 text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <Command.List className="max-h-80 space-y-1 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-xs text-slate-500">
              {t("admin.palette.empty")}
            </Command.Empty>

            <Command.Group
              heading={t("admin.palette.groupNav")}
              className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-500"
            >
              <Command.Item
                onSelect={() =>
                  runCommand(() => onSelectTab("dashboard"))
                }
                className={itemClass}
              >
                <LayoutDashboard className="size-4 text-indigo-400" />
                {t("admin.tabs.dashboard")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("traffic"))}
                className={itemClass}
              >
                <Activity className="size-4 text-cyan-400" />
                {t("admin.tabs.traffic")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("plans"))}
                className={itemClass}
              >
                <CreditCard className="size-4 text-indigo-400" />
                {t("admin.tabs.plans")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("revenue"))}
                className={itemClass}
              >
                <Receipt className="size-4 text-emerald-400" />
                {t("admin.tabs.revenue")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("promos"))}
                className={itemClass}
              >
                <Ticket className="size-4 text-indigo-400" />
                {t("admin.tabs.promos")}
              </Command.Item>
              <Command.Item
                onSelect={() =>
                  runCommand(() => onSelectTab("announcements"))
                }
                className={itemClass}
              >
                <Megaphone className="size-4 text-indigo-400" />
                {t("admin.announcements.title")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("reports"))}
                className={itemClass}
              >
                <Flag className="size-4 text-amber-400" />
                {t("admin.reports.title")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("security"))}
                className={itemClass}
              >
                <ShieldCheck className="size-4 text-emerald-400" />
                {t("admin.security.title")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("audit"))}
                className={itemClass}
              >
                <History className="size-4 text-indigo-400" />
                {t("admin.audit.title")}
              </Command.Item>
            </Command.Group>

            <Command.Group
              heading={t("admin.palette.groupQuick")}
              className="mt-2 border-t border-slate-800 px-2 py-1 text-[10px] font-semibold uppercase text-slate-500"
            >
              <Command.Item
                onSelect={() =>
                  runCommand(() => void handleExportUsers())
                }
                className={itemClass}
              >
                <Download className="size-4 text-cyan-400" />
                {t("admin.palette.exportUsers")}
              </Command.Item>
              <Command.Item
                onSelect={() =>
                  runCommand(() => void handleExportRevenue())
                }
                className={itemClass}
              >
                <Download className="size-4 text-cyan-400" />
                {t("admin.palette.exportRevenue")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("ops"))}
                className={itemClass}
              >
                <Gauge className="size-4 text-emerald-400" />
                {t("admin.ops.benchmarkTitle")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("ops"))}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-rose-600/20 hover:text-rose-300"
              >
                <AlertTriangle className="size-4 text-rose-400" />
                {t("admin.palette.maintenance")}
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
