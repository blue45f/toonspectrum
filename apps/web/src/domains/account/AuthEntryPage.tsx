import { Compass, FolderOpen, LifeBuoy, Palette, UserRound, type LucideIcon } from "lucide-react";
import { useId } from "react";

import { AuthForm } from "@/domains/auth/public/account-auth-form";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { SiteLinkCard } from "@/domains/legal/public/site-link-card";
import { PageIntro } from "@/shared/components/page-intro";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import { AuthSplitLayout } from "./AuthSplitLayout";

export type AuthEntryMode = "login" | "signup";

interface EntryDestination {
  readonly href: string;
  readonly icon: LucideIcon;
  readonly title: readonly [string, string];
  readonly description: readonly [string, string];
  readonly cta: readonly [string, string];
}

const WITHOUT_SIGN_IN: readonly EntryDestination[] = [
  {
    href: "/studio/new",
    icon: Palette,
    title: ["새 작품 만들기", "Start a new work"],
    description: ["캔버스를 열고 이 기기에 저장하며 그려요.", "Open a canvas and save on this device."],
    cta: ["시작하기", "Start"],
  },
  {
    href: "/discover",
    icon: Compass,
    title: ["작품 탐색", "Discover stories"],
    description: ["요일 연재와 평점 높은 작품을 둘러봐요.", "Browse weekly serials and top-rated stories."],
    cta: ["둘러보기", "Browse"],
  },
  {
    href: "/help",
    icon: LifeBuoy,
    title: ["도움말", "Help center"],
    description: ["계정·저장·복구 방법을 확인해요.", "Check how accounts, saving and recovery work."],
    cta: ["열기", "Open"],
  },
];

/** 세션 확인이 끝나기 전, 폼 자리에서 흔들림 없이 기다리는 스켈레톤. */
function AuthFormSkeleton({ label }: { readonly label: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="animate-pulse motion-reduce:animate-none">
      <div className="size-11 rounded-xl bg-raised" />
      <div className="mt-4 h-8 w-3/4 rounded-lg bg-raised" />
      <div className="mt-3 h-4 w-full rounded bg-raised" />
      <div className="mt-8 h-11 rounded-xl bg-raised" />
      <div className="mt-4 h-12 rounded-xl bg-raised" />
      <div className="mt-3 h-12 rounded-xl bg-raised" />
      <div className="mt-5 h-12 rounded-xl bg-raised" />
    </div>
  );
}

/**
 * `/auth/login`, `/auth/signup` 진입 화면.
 *
 * 왼쪽 히어로 아트 + 오른쪽 폼의 분할 레이아웃으로, 폼 본체(AuthForm)를 페이지에 직접 그린다.
 * 예전처럼 대화상자를 자동으로 띄우지 않아 첫 화면에서 바로 입력할 수 있고,
 * 헤더 등 다른 진입점의 로그인 대화상자(AuthModal)와 같은 폼을 공유한다.
 * 세션 확인이 끝나기 전에는 스켈레톤을 보여 로그인된 사용자에게 폼이 잠깐 보이는 깜빡임을 막는다.
 */
export function AuthEntryPage({ mode }: { readonly mode: AuthEntryMode }) {
  const bt = useBilingual("AuthEntryPage");
  const { ready, status, data } = useSession();
  const previewTitleId = useId();
  const signup = mode === "signup";

  useDocumentTitle(signup ? bt("회원가입", "Sign up") : bt("로그인", "Sign in"));

  return (
    <PageIntro variant="restrained">
      <AuthSplitLayout>
        {status === "authenticated" ? (
          <div>
            <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
              <UserRound size={22} aria-hidden="true" />
            </span>
            <p className="eyebrow mt-5 text-accent">ACCOUNT</p>
            <h1 className="mt-2 font-display text-[1.65rem] font-bold leading-snug tracking-[-0.025em] text-fg">
              {bt("이미 로그인되어 있어요", "You're already signed in")}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-fg-3">
              {data.user.name ?? data.user.email
                ? `${data.user.name ?? data.user.email} · ${bt("계정으로 이어서 작업할 수 있어요.", "you can keep working with your account.")}`
                : bt("계정으로 이어서 작업할 수 있어요.", "You can keep working with your account.")}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/my" className={buttonClass({ size: "md", className: "min-h-11" })}>
                {bt("내 공간으로", "Go to My Space")}
              </Link>
              <Link href="/studio" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>
                <Palette size={16} aria-hidden="true" />
                {bt("Studio 열기", "Open Studio")}
              </Link>
            </div>
          </div>
        ) : !ready ? (
          <AuthFormSkeleton label={bt("세션을 확인하고 있어요", "Checking your session")} />
        ) : (
          <>
            <AuthForm variant="page" initialMode={mode} guestNext="/home" />
            <section aria-labelledby={previewTitleId} className="mt-10 border-t border-line pt-7">
              <h2 id={previewTitleId} className="font-display text-base font-bold tracking-[-0.01em] text-fg">
                {bt("로그인 없이 바로 해 볼 수 있어요", "Things you can do right away")}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-fg-3">
                {bt("계정이 없어도 아래 작업은 지금 이 기기에서 시작할 수 있어요.", "These work on this device even before you create an account.")}
              </p>
              <div className="mt-4 grid gap-2.5">
                {WITHOUT_SIGN_IN.map((destination) => (
                  <SiteLinkCard
                    key={destination.href}
                    href={destination.href}
                    icon={destination.icon}
                    title={bt(...destination.title)}
                    description={bt(...destination.description)}
                    cta={bt(...destination.cta)}
                  />
                ))}
              </div>
              <p className="mt-4 flex items-center gap-2 text-xs leading-relaxed text-fg-3">
                <FolderOpen size={14} aria-hidden="true" className="shrink-0" />
                {bt("로그인 전 작업은 이 브라우저에 저장돼요. 기기를 바꾸기 전에는 파일로 내보내 두세요.", "Work before signing in stays in this browser. Export it before switching devices.")}
              </p>
            </section>
          </>
        )}
      </AuthSplitLayout>
    </PageIntro>
  );
}
