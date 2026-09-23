import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  LoaderCircle,
  LogOut,
  Library,
  Mail,
  RotateCcw,
  UserRound,
  Settings as SettingsIcon,
  Shield,
} from "lucide-react";
import { useState, useEffect, useId, useRef } from "react";

import { AuthMenuTrigger } from "./auth-menu-trigger";
import { safeAuthProfileImageSrc } from "./auth-menu-profile-image";
import { AuthModal } from "./auth-modal";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { useSession, signOut } from "@/compat/auth-session-store";
import { subscribeAuthModalRequests } from "@/compat/auth-modal-intent";
import Link from "@/compat/router-link";
import {
  adminFetch,
  type AdminMe,
} from "@/domains/admin/components/admin-client";
import { messagingClient } from "@/infrastructure/messaging-client";

// Mouse, keyboard and touch share the same 44px account-menu interaction contract.
const ITEM_CLASS =
  "group flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-fg-2 outline-none transition-[background-color,color,transform] hover:bg-raised hover:text-fg focus-visible:bg-raised focus-visible:text-fg data-[highlighted]:bg-raised data-[highlighted]:text-fg data-[disabled]:pointer-events-none";
const ITEM_ICON_CLASS =
  "grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-canvas/60 text-fg-3 transition-colors group-hover:border-line-strong group-hover:text-accent group-data-[highlighted]:border-line-strong group-data-[highlighted]:text-accent";

export function AuthMenu({
  defaultOpen = false,
  defaultMenuOpen = false,
  defaultMode = "login",
}: {
  defaultOpen?: boolean;
  defaultMenuOpen?: boolean;
  defaultMode?: "login" | "signup";
}) {
  const { data: session, status } = useSession();
  const [modal, setModal] = useState(defaultOpen);
  const [modalMode, setModalMode] = useState<"login" | "signup">(defaultMode);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(defaultMenuOpen);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const loginTriggerRef = useRef<HTMLButtonElement>(null);
  const signOutInFlightRef = useRef(false);
  const signOutStatusId = useId();
  const t = useT();
  const uid = session?.user?.id;

  useEffect(() => {
    if (!defaultOpen) return;
    setModalMode(defaultMode);
    setModal(true);
  }, [defaultMode, defaultOpen]);

  useEffect(
    () =>
      subscribeAuthModalRequests((detail) => {
        if (status === "authenticated") return;
        setMenuOpen(false);
        setModalMode(detail.mode ?? "login");
        setModal(true);
      }),
    [status]
  );

  // 관리자 콘솔 링크 노출 — 세션 role(화이트리스트 승격 반영) + /api/admin/me 프로브.
  // 프로브는 세션 role 이 stale 한 탭/캐시에서도 링크가 보이도록 하는 2차 게이트.
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

  useEffect(() => {
    if (status !== "authenticated" || !uid) {
      setUnreadMessageCount(0);
      return;
    }
    let alive = true;
    const refreshUnreadCount = () => {
      messagingClient
        .unreadCount()
        .then((result) => {
          if (alive) setUnreadMessageCount(result.total);
        })
        .catch(() => {
          if (alive) setUnreadMessageCount(0);
        });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshUnreadCount();
    };
    refreshUnreadCount();
    const interval = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener("focus", refreshUnreadCount);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshUnreadCount);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [status, uid]);

  if (status !== "authenticated") {
    return (
      <>
        <AuthMenuTrigger
          ref={loginTriggerRef}
          variant="signed-out"
          label={t("nav.login")}
          onClick={() => {
            setModalMode("login");
            setModal(true);
          }}
        />
        {modal && (
          <AuthModal
            onClose={() => setModal(false)}
            returnFocusRef={loginTriggerRef}
            initialMode={modalMode}
          />
        )}
      </>
    );
  }

  const u = session.user;
  const initial = (u.name ?? u.email ?? "U").charAt(0).toUpperCase();
  const imageSrc = safeAuthProfileImageSrc(u.image);
  const userEmail = (u.email ?? "").trim().toLowerCase();
  // 서버 세션이 admin 을 주면 즉시 표시. 화이트리스트 이메일은 배포 지연/세션 stale 대비 폴백.
  const showAdmin =
    (u.role ?? "") === "admin" ||
    (u.role ?? "") === "operator" ||
    userEmail === "blue45f@gmail.com" ||
    isAdmin;
  const fallbackName = t("auth.menu.fallbackName");

  async function handleSignOut() {
    // State is committed on the next render; the ref closes the same-frame
    // double-click/keyboard window before React can disable the menu item.
    if (signOutInFlightRef.current) return;
    signOutInFlightRef.current = true;
    setSignOutPending(true);
    setSignOutError(null);
    try {
      const result = await signOut();
      if (result.ok) {
        // The old menu closed on a successful selection. Keep that behavior
        // even if session-provider propagation takes another render.
        setMenuOpen(false);
      } else {
        setSignOutError(result.error);
      }
    } catch {
      setSignOutError(
        "로그아웃 확인에 실패했어요. 연결을 확인한 뒤 다시 시도해 주세요."
      );
    } finally {
      signOutInFlightRef.current = false;
      setSignOutPending(false);
    }
  }

  const signOutLabel = signOutPending
    ? "실시간 연결 정리 중…"
    : signOutError
    ? "로그아웃 다시 시도"
    : t("auth.menu.signOut");

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenu.Trigger asChild>
        <AuthMenuTrigger
          variant="signed-in"
          label={
            unreadMessageCount > 0
              ? formatI18nTemplate(
                  translateCurrentStaticSourceText(
                    "domains.auth.components.auth.menu",
                    "ko",
                    "{v0} · 읽지 않은 메시지 {v1}개"
                  ),
                  {
                    v0: String(t("auth.menu.triggerLabel")),
                    v1: String(unreadMessageCount.toLocaleString("ko-KR")),
                  }
                )
              : t("auth.menu.triggerLabel")
          }
          initial={initial}
          imageSrc={imageSrc}
          unreadMessageCount={unreadMessageCount}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          collisionPadding={12}
          aria-label={translateCurrentStaticSourceText(
            "domains.auth.components.auth.menu",
            "ko",
            "계정 메뉴"
          )}
          className="z-[90] w-[18rem] overflow-hidden rounded-2xl border border-line-strong bg-panel/95 p-1.5 shadow-2xl shadow-[oklch(0.1_0.02_70/0.34)] backdrop-blur-2xl data-[state=open]:animate-[fade-up_0.16s_var(--ease-out-expo)_both] motion-reduce:animate-none"
        >
          <div className="mb-1 rounded-xl border border-line/80 bg-canvas/55 p-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-accent font-display text-sm font-bold text-on-accent ring-1 ring-inset ring-on-accent/20">
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  initial
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">
                  {u.name ?? fallbackName}
                </p>
                <p className="mt-0.5 truncate text-xs text-fg-3">{u.email}</p>
              </div>
              <span
                className="size-2 shrink-0 rounded-full bg-good ring-4 ring-good/10"
                aria-hidden="true"
              />
            </div>
            <p className="mt-2 text-[0.68rem] font-medium text-fg-3">
              {translateCurrentStaticSourceText(
                "domains.auth.components.auth.menu",
                "ko",
                "이 기기에서 안전하게 로그인됨"
              )}
            </p>
          </div>
          <DropdownMenu.Label className="px-3 pb-1 pt-2 font-display text-[0.62rem] font-bold uppercase tracking-[0.14em] text-fg-3">
            {translateCurrentStaticSourceText(
              "domains.auth.components.auth.menu",
              "ko",
              "계정과 작업 공간"
            )}
          </DropdownMenu.Label>
          {showAdmin && (
            <DropdownMenu.Item asChild>
              <Link href="/admin" className={ITEM_CLASS}>
                <span className={ITEM_ICON_CLASS}>
                  <Shield size={16} aria-hidden="true" />
                </span>
                <span>{t("auth.menu.adminPanel")}</span>
              </Link>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item asChild>
            <Link href="/me" className={ITEM_CLASS}>
              <span className={ITEM_ICON_CLASS}>
                <UserRound size={16} aria-hidden="true" />
              </span>
              <span>{t("auth.menu.profile")}</span>
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/library" className={ITEM_CLASS}>
              <span className={ITEM_ICON_CLASS}>
                <Library size={16} aria-hidden="true" />
              </span>
              <span>{t("nav.library")}</span>
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/messages" className={ITEM_CLASS}>
              <span className={ITEM_ICON_CLASS}>
                <Mail size={16} aria-hidden="true" />
              </span>
              <span>
                {translateCurrentStaticSourceText(
                  "domains.auth.components.auth.menu",
                  "ko",
                  "메시지"
                )}
              </span>
              {unreadMessageCount > 0 ? (
                <span className="ml-auto min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-center text-[0.65rem] font-bold text-on-accent">
                  {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                </span>
              ) : null}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/settings" className={ITEM_CLASS}>
              <span className={ITEM_ICON_CLASS}>
                <SettingsIcon size={16} aria-hidden="true" />
              </span>
              <span>{t("auth.menu.settings")}</span>
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="mx-2 my-1 h-px bg-line" />
          <DropdownMenu.Item
            disabled={signOutPending}
            onSelect={(event) => {
              event.preventDefault();
              void handleSignOut();
            }}
            aria-busy={signOutPending}
            aria-describedby={signOutError ? signOutStatusId : undefined}
            className={cn(
              ITEM_CLASS,
              "hover:text-bad focus-visible:text-bad data-[highlighted]:text-bad data-[disabled]:cursor-wait data-[disabled]:opacity-60"
            )}
          >
            <span
              className={cn(
                ITEM_ICON_CLASS,
                "group-hover:text-bad group-data-[highlighted]:text-bad"
              )}
            >
              {signOutPending ? (
                <LoaderCircle
                  size={16}
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : signOutError ? (
                <RotateCcw size={16} aria-hidden="true" />
              ) : (
                <LogOut size={16} aria-hidden="true" />
              )}
            </span>
            <span>{signOutLabel}</span>
          </DropdownMenu.Item>
          {signOutError ? (
            <p
              id={signOutStatusId}
              className="mx-1 mt-1 rounded-xl border border-bad/35 bg-bad/5 px-3 py-2 text-xs leading-relaxed text-bad"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {signOutError}
            </p>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
