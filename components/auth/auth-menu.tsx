"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut, Library, UserRound, Settings as SettingsIcon, Shield } from "lucide-react";
import { useState, useEffect } from "react";

import { AuthModal } from "./auth-modal";

import { resolveSignupAvatarImage } from "@/lib/avatar";
import { useT } from "@/lib/i18n";
import { cn, keepInlineText } from "@/lib/utils";
import { useSession, signOut } from "@/src/compat/auth-session-store";
import Link from "@/src/compat/router-link";
import { adminFetch, type AdminMe } from "@/src/domains/admin/components/admin-client";

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

// 메뉴 항목 공통 스타일 — 기존 hover/focus-visible 시각을 Radix data-[highlighted]로 매핑(키보드/마우스 동일).
const ITEM_CLASS =
  "flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-sm text-fg-2 outline-none transition-colors hover:bg-raised hover:text-fg focus-visible:bg-raised focus-visible:text-fg data-[highlighted]:bg-raised data-[highlighted]:text-fg";

export function AuthMenu() {
  const { data: session, status } = useSession();
  const [modal, setModal] = useState(false);
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
  const showAdmin = (u.role ?? "") === "admin" || (u.role ?? "") === "operator" || isAdmin;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="grid size-10 place-items-center overflow-hidden rounded-xl border border-line bg-accent text-sm font-bold text-on-accent outline-none transition-transform active:scale-95"
        aria-label="계정 메뉴"
      >
        {imageSrc ? <img src={imageSrc} alt="" className="h-full w-full object-cover" /> : initial}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-52 overflow-hidden rounded-xl border border-line-strong bg-panel shadow-xl shadow-[oklch(0.1_0.02_70/0.42)] data-[state=open]:animate-[fade-up_0.16s_var(--ease-out-expo)_both]"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-fg">{u.name ?? "독자"}</p>
            <p className="truncate text-xs text-fg-3">{u.email}</p>
          </div>
          {showAdmin && (
            <DropdownMenu.Item asChild>
              <Link href="/admin" className={ITEM_CLASS}>
                <Shield size={15} /> 관리자 콘솔
              </Link>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item asChild>
            <Link href="/me" className={ITEM_CLASS}>
              <UserRound size={15} /> 내 정보
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/library" className={ITEM_CLASS}>
              <Library size={15} /> {t("nav.library")}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/settings" className={ITEM_CLASS}>
              <SettingsIcon size={15} /> 설정
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => signOut()}
            className={cn(ITEM_CLASS, "hover:text-bad focus-visible:text-bad data-[highlighted]:text-bad")}
          >
            <LogOut size={15} /> 로그아웃
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
