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
} from "lucide-react";
import { useState, useEffect } from "react";

import { adminFetch } from "./admin-client";

interface AdminQuickPaletteProps {
  userId: string;
  onSelectTab: (tabKey: string) => void;
}

export function AdminQuickPalette({ userId, onSelectTab }: AdminQuickPaletteProps) {
  const [open, setOpen] = useState(false);

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
        <span>빠른 이동 및 작업 검색...</span>
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
              placeholder="어드민 커맨드 검색 (메뉴 이동, CSV 다운로드, 점검 모드)..."
              className="w-full bg-transparent py-4 text-sm text-white focus:outline-none placeholder:text-slate-500"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2 space-y-1">
            <Command.Empty className="py-6 text-center text-xs text-slate-500">
              검색 결과가 없습니다.
            </Command.Empty>

            <Command.Group heading="콘솔 메뉴 바로가기" className="text-[10px] font-semibold text-slate-500 px-2 py-1 uppercase">
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("dashboard"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <LayoutDashboard className="w-4 h-4 text-indigo-400" />
                대시보드 바로가기
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("plans"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <CreditCard className="w-4 h-4 text-indigo-400" />
                구독 플랜 바로가기
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("revenue"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <Receipt className="w-4 h-4 text-emerald-400" />
                정산 및 수익 바로가기
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("promos"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <Ticket className="w-4 h-4 text-indigo-400" />
                프로모션 쿠폰 관리
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("announcements"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <Megaphone className="w-4 h-4 text-indigo-400" />
                전역 공지사항 & 배너 관리
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("reports"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <Flag className="w-4 h-4 text-amber-400" />
                유저 신고 & 분쟁 심의 큐
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("security"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                보안 IP 블랙리스트 & 세션 제어
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("audit"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <History className="w-4 h-4 text-indigo-400" />
                관리자 감사 로그 뷰어
              </Command.Item>
            </Command.Group>

            <Command.Group heading="빠른 작업 & 내보내기" className="text-[10px] font-semibold text-slate-500 px-2 py-1 uppercase border-t border-slate-800 mt-2">
              <Command.Item
                onSelect={() => runCommand(() => void handleExportUsers())}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4 text-cyan-400" />
                전체 회원 데이터 CSV 다운로드
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => void handleExportRevenue())}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-indigo-600/20 hover:text-indigo-300 rounded-xl cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4 text-cyan-400" />
                정산 원장 CSV 다운로드
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => onSelectTab("ops"))}
                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-rose-600/20 hover:text-rose-300 rounded-xl cursor-pointer transition-colors"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                시스템 비상 점검 모드 제어
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
