"use client";

import { useState, useEffect } from "react";
import Link from "@/src/compat/router-link";
import { useSession, signOut } from "@/src/compat/auth-session";
import { AuthModal } from "./auth-modal";
import { LogOut, Library, UserRound, Settings as SettingsIcon, Shield } from "lucide-react";
import { resolveSignupAvatarImage } from "@/lib/avatar";
import { adminFetch, type AdminMe } from "@/src/components/admin/admin-client";
import { useT } from "@/lib/i18n";
import { keepInlineText } from "@/lib/utils";

function safeProfileImageSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  const dataImage = resolveSignupAvatarImage(value);
  if (dataImage) return dataImage;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

export function AuthMenu() {
  const { data: session, status } = useSession();
  const [modal, setModal] = useState(false);
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const t = useT();
  const uid = session?.user?.id;

  // 관리자 콘솔 링크 노출 — 세션 role 은 화이트리스트(ADMIN_EMAILS) 승격을 반영 못 하므로
  // /api/admin/me 프로브로 실제 권한을 확인(성공=관리자)해 게이트한다.
  useEffect(() => {
    if (status !== "authenticated" || !uid) {
      setIsAdmin(false);
      return;
    }
    let alive = true;
    adminFetch<AdminMe>("/me", uid)
      .then(() => {
        if (alive) setIsAdmin(true);
      })
      .catch(() => {
        if (alive) setIsAdmin(false);
      });
    return () => {
      alive = false;
    };
  }, [status, uid]);

  if (status !== "authenticated") {
    return (
      <>
        <button
          onClick={() => setModal(true)}
          aria-label={t("nav.login")}
          className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-line bg-card px-3 text-sm font-medium text-fg-2 [text-wrap:nowrap] [word-break:keep-all] transition-colors hover:border-line-strong hover:text-fg"
        >
          <UserRound size={16} className="shrink-0" />
          <span className="hidden min-w-max whitespace-nowrap [text-wrap:nowrap] [word-break:keep-all] xl:inline-block">
            {keepInlineText(t("nav.login"))}
          </span>
        </button>
        {modal && <AuthModal onClose={() => setModal(false)} />}
      </>
    );
  }

  const u = session.user;
  const initial = (u.name ?? u.email ?? "U").charAt(0).toUpperCase();
  const imageSrc = safeProfileImageSrc(u.image);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid size-10 place-items-center overflow-hidden rounded-xl border border-line bg-accent text-sm font-bold text-on-accent transition-transform active:scale-95"
        aria-label="계정 메뉴"
      >
        {imageSrc ? <img src={imageSrc} alt="" className="h-full w-full object-cover" /> : initial}
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-10" aria-label="닫기" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-xl border border-line-strong bg-panel shadow-xl shadow-[oklch(0.1_0.02_70/0.42)]">
            <div className="border-b border-line px-4 py-3">
              <p className="truncate text-sm font-semibold text-fg">{u.name ?? "독자"}</p>
              <p className="truncate text-xs text-fg-3">{u.email}</p>
            </div>
            {((u.role ?? "") === "admin" || (u.role ?? "") === "operator" || isAdmin) && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:bg-raised focus-visible:text-fg focus-visible:outline-none"
              >
                <Shield size={15} /> 관리자 콘솔
              </Link>
            )}
            <Link
              href="/me"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:bg-raised focus-visible:text-fg focus-visible:outline-none"
            >
              <UserRound size={15} /> 내 정보
            </Link>
            <Link
              href="/library"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:bg-raised focus-visible:text-fg focus-visible:outline-none"
            >
              <Library size={15} /> {t("nav.library")}
            </Link>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:bg-raised focus-visible:text-fg focus-visible:outline-none"
            >
              <SettingsIcon size={15} /> 설정
            </Link>
            <button
              onClick={() => signOut()}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-fg-2 transition-colors hover:bg-raised hover:text-bad focus-visible:bg-raised focus-visible:text-bad focus-visible:outline-none"
            >
              <LogOut size={15} /> 로그아웃
            </button>
          </div>
        </>
      )}
    </div>
  );
}
