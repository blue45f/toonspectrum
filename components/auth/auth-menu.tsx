"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { AuthModal } from "./auth-modal";
import { LogOut, Library, UserRound } from "lucide-react";

export function AuthMenu() {
  const { data: session, status } = useSession();
  const [modal, setModal] = useState(false);
  const [open, setOpen] = useState(false);

  if (status !== "authenticated") {
    return (
      <>
        <button
          onClick={() => setModal(true)}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-sm font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
        >
          <UserRound size={16} />
          <span className="hidden sm:inline">로그인</span>
        </button>
        {modal && <AuthModal onClose={() => setModal(false)} />}
      </>
    );
  }

  const u = session.user;
  const initial = (u.name ?? u.email ?? "U").charAt(0).toUpperCase();

  return (
      <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid size-10 place-items-center rounded-xl border border-line bg-accent text-sm font-bold text-on-accent transition-transform active:scale-95"
        aria-label="계정 메뉴"
      >
        {initial}
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-10" aria-label="닫기" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-xl border border-line-strong bg-panel shadow-xl shadow-black/40">
            <div className="border-b border-line px-4 py-3">
              <p className="truncate text-sm font-semibold text-fg">{u.name ?? "독자"}</p>
              <p className="truncate text-xs text-fg-3">{u.email}</p>
            </div>
            {((u.role ?? "") === "admin" || (u.role ?? "") === "operator") && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-fg-2 transition-colors hover:bg-raised hover:text-fg"
              >
                관리자 콘솔
              </Link>
            )}
            <Link
              href="/library"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-fg-2 transition-colors hover:bg-raised hover:text-fg"
            >
              <Library size={15} /> 내 서재
            </Link>
            <button
              onClick={() => signOut()}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-fg-2 transition-colors hover:bg-raised hover:text-bad"
            >
              <LogOut size={15} /> 로그아웃
            </button>
          </div>
        </>
      )}
    </div>
  );
}
