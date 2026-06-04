"use client";

import { useState } from "react";
import Link from "@/src/compat/router-link";
import { useSession, signOut } from "@/src/compat/auth-session";
import { AuthModal } from "./auth-modal";
import { LogOut, Library, UserRound, Settings as SettingsIcon } from "lucide-react";
import { resolveSignupAvatarImage } from "@/lib/avatar";
import { useT } from "@/lib/i18n";

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
  const t = useT();

  if (status !== "authenticated") {
    return (
      <>
        <button
          onClick={() => setModal(true)}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-sm font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
        >
          <UserRound size={16} />
          <span className="hidden sm:inline">{t("nav.login")}</span>
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
              <Library size={15} /> {t("nav.library")}
            </Link>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-fg-2 transition-colors hover:bg-raised hover:text-fg"
            >
              <SettingsIcon size={15} /> 설정
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
