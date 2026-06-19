"use client";

import { LogIn, LogOut, UserRound } from "lucide-react";
import { useState } from "react";

import { AuthDialog, useAuth } from "@/lib/firebaseAuth";
import { cn, keepInlineText } from "@/lib/utils";

/**
 * 헤더 회원 로그인 진입점 — 통합 Firebase Auth(이메일/게스트) 기반.
 *
 * 이 컨트롤은 기존 세션 기반 로그인(`AuthMenu` — Google GIS/크리덴셜/소셜)과 **별개**이며,
 * 비파괴적으로 추가된 통합 로그인 모듈의 진입점이다. 로그아웃 상태면 "로그인" 버튼으로
 * AuthDialog(이메일 로그인 ⇄ 가입 + 게스트로 시작하기)를 열고, 로그인 상태면
 * 이메일(또는 "게스트")과 로그아웃을 보여준다.
 *
 * 헤더 폭이 좁아 라벨은 xl 이상에서만 노출하고, 그 외엔 아이콘만 보여준다(기존 헤더 관례).
 */
export function MemberAuthControl({ className }: { className?: string }) {
  const { user, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) {
    // 초기 onAuthStateChanged 해석 전 — 레이아웃 점프 방지용 플레이스홀더.
    return <div className={cn("h-10 w-10 skeleton rounded-xl", className)} aria-hidden />;
  }

  if (!user) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="회원 로그인"
          className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-line bg-card px-3 text-sm font-medium text-fg-2 [text-wrap:nowrap] [word-break:keep-all] transition-colors hover:border-line-strong hover:text-fg"
        >
          <LogIn size={16} className="shrink-0" />
          <span className="hidden min-w-max whitespace-nowrap [text-wrap:nowrap] [word-break:keep-all] xl:inline-block">
            {keepInlineText("회원")}
          </span>
        </button>
        <AuthDialog open={open} onOpenChange={setOpen} />
      </div>
    );
  }

  const label = user.isAnonymous ? "게스트" : (user.email ?? "회원");

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span
        className="hidden max-w-[10rem] items-center gap-1.5 truncate rounded-xl border border-line bg-card px-2.5 py-1.5 text-[0.8125rem] text-fg-2 xl:inline-flex"
        title={label}
      >
        <UserRound size={14} className="shrink-0 text-fg-3" aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        aria-label={`${label} 로그아웃`}
        title="회원 로그아웃"
        className="grid size-10 place-items-center rounded-xl border border-line bg-card text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
      >
        <LogOut size={16} aria-hidden />
      </button>
    </div>
  );
}
