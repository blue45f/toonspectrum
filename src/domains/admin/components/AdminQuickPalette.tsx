import { Command } from "cmdk";
import {
  Search,
  LayoutDashboard,
  CreditCard,
  Receipt,
  Ticket,
  Megaphone,
  Flag,
  ShieldCheck,
  History,
  Download,
  AlertTriangle,
  Gauge
} from "lucide-react";
import { useState, useEffect } from "react";

import { adminFetch } from "./admin-client";

import { useT } from "@/lib/i18n";

interface AdminQuickPaletteProps {
  userId: string;
  onSelectTab: (tabKey: string) => void;
}
export function AdminQuickPalette({ userId, onSelectTab }: AdminQuickPaletteProps) {
  const [open, setOpen] = useState(false);
  const t = useT();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
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
      const a = document.createElement("a");
      a.href = url;
      a.download = "members.csv";
      a.click();
    } catch {
      alert("다운로드 실패");
    }
  };

  const handleExportRevenue = async () => {
    try {
      const csv = await adminFetch<string>("/revenue/export/csv", userId);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "revenue_ledger.csv";
      a.click();
    } catch {
      alert("다운로드 실패");
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-all backdrop-blur-xl"
      >
        <Search className="w-3.5 h-3.5" />
        <span>{t("admin.palette.trigger")}</span>
        <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-300">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-start justify-center pt-20 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <Command className="w-full">
          <div className="flex items-center border-b border-slate-800 px-4">
            <Search className="w-4 h-4 text-slate-400 mr-2" />
            <Command.Input
              placeholder={t("admin.palette.placeholder")}
              className="w-full bg-transparent py-4 text-sm text-white focus:outline-none placeholder:text-slate-500"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2 space-y-1">
            <Command.Empty className="py-6 text-center text-xs text-slate-500">
              {t("admin.palette.empty")}
            </Command.Empty>

            <Command.Group heading={t("admin.palette.groupNav")} className="text-[10px] font-semibold text-slate-500 px-2 py-1 uppercase">
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("dashboard"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <LayoutDashboard className="w-4 h-4 text-indigo-400" />
                {t("admin.tabs.dashboard")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("plans"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <CreditCard className="w-4 h-4 text-indigo-400" />
                {t("admin.tabs.plans")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("revenue"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <Receipt className="w-4 h-4 text-emerald-400" />
                {t("admin.tabs.revenue")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("promos"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <Ticket className="w-4 h-4 text-indigo-400" />
                {t("admin.tabs.promos")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("announcements"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <Megaphone className="w-4 h-4 text-indigo-400" />
                {t("admin.announcements.title")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("reports"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <Flag className="w-4 h-4 text-amber-400" />
                {t("admin.reports.title")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("security"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                {t("admin.security.title")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("audit"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <History className="w-4 h-4 text-indigo-400" />
                {t("admin.audit.title")}
              </Command.Item>
            </Command.Group>

            <Command.Group heading={t("admin.palette.groupQuick")} className="text-[10px] font-semibold text-slate-500 px-2 py-1 uppercase border-t border-slate-800 mt-2">
              <Command.Item
                onSelect={() => runCommand(() => void handleExportUsers())}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4 text-cyan-400" />
                {t("admin.palette.exportUsers")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => void handleExportRevenue())}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4 text-cyan-400" />
                {t("admin.palette.exportRevenue")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("ops"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <Gauge className="w-4 h-4 text-emerald-400" />
                {t("admin.ops.benchmarkTitle")}
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("ops"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-rose-600/20 hover:text-rose-300 rounded-xl cursor-pointer transition-colors"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                {t("admin.palette.maintenance")}
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
