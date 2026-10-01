import { Compass, FolderOpen, LifeBuoy, LogIn, Palette, UserPlus, UserRound, type LucideIcon } from "lucide-react";
import { useRef, useState } from "react";

import { AuthModal } from "@/domains/auth/public/account-auth-modal";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { SiteLinkCard } from "@/domains/legal/public/site-link-card";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { Container, Section } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

export type AuthEntryMode = "login" | "signup";

/**
 * 로그인 대화상자 상태.
 * - `auto`: 아직 사용자가 조작하지 않음 — 세션 확인이 끝나 로그아웃 상태로 판정되면 한 번 연다.
 * - `open`: 사용자가 버튼으로 연 상태.
 * - `closed`: 사용자가 닫았거나 로그인에 성공해 닫힌 상태 — 다시 자동으로 열지 않는다.
 */
type AuthDialogState = "auto" | "open" | "closed";

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

/**
 * `/auth/login`, `/auth/signup` 진입 화면.
 *
 * 이 경로는 사이트 헤더(계정 메뉴) 밖에서 렌더될 수 있으므로 헤더의 모달 요청 이벤트에 기대지 않고
 * 로그인 대화상자를 이 화면 안에서 직접 렌더한다. 세션 확인이 끝나 로그아웃 상태로 판정되면
 * 한 번만 자동으로 열고, 닫은 뒤에는 버튼으로 다시 열 수 있게 한다.
 */
export function AuthEntryPage({ mode }: { readonly mode: AuthEntryMode }) {
  const bt = useBilingual("AuthEntryPage");
  const { ready, status, data } = useSession();
  const [dialog, setDialog] = useState<AuthDialogState>("auto");
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const signup = mode === "signup";

  useDocumentTitle(signup ? bt("회원가입", "Sign up") : bt("로그인", "Sign in"));

  if (status === "authenticated") {
    const name = data.user.name ?? data.user.email ?? "";
    return (
      <Container size="wide" className="py-10 sm:py-14">
        <SitePageHeader
          icon={UserRound}
          eyebrow="ACCOUNT"
          title={bt("이미 로그인되어 있어요", "You're already signed in")}
          description={
            name
              ? `${name} · ${bt("계정으로 이어서 작업할 수 있어요.", "you can keep working with your account.")}`
              : bt("계정으로 이어서 작업할 수 있어요.", "You can keep working with your account.")
          }
          actions={
            <>
              <Link href="/my" className={buttonClass({ size: "md", className: "min-h-11" })}>
                {bt("내 공간으로", "Go to My Space")}
              </Link>
              <Link href="/studio" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>
                <Palette size={16} aria-hidden="true" />
                {bt("Studio 열기", "Open Studio")}
              </Link>
            </>
          }
        />
      </Container>
    );
  }

  // 세션 확인 전(ready=false)에는 자동으로 열지 않는다 — 로그인된 사용자에게 창이 잠깐 뜨는 깜빡임 방지.
  const dialogOpen = dialog === "open" || (dialog === "auto" && ready);
  const OpenIcon = signup ? UserPlus : LogIn;

  return (
    <Container size="wide" className="py-10 sm:py-14">
      <SitePageHeader
        icon={OpenIcon}
        eyebrow="ACCOUNT"
        title={signup ? bt("ToonStudio 시작하기", "Get started with ToonStudio") : bt("ToonStudio에 로그인", "Sign in to ToonStudio")}
        description={bt(
          "로그인하면 프로젝트·서재·에셋 기록을 계정으로 이어서 쓸 수 있어요. 로그인하지 않아도 작품 탐색과 이 기기의 로컬 편집은 바로 쓸 수 있습니다.",
          "Sign in to carry projects, library and asset history with your account. Browsing and local editing on this device work without signing in.",
        )}
        actions={
          <>
            <button
              ref={openButtonRef}
              type="button"
              onClick={() => setDialog("open")}
              aria-haspopup="dialog"
              className={buttonClass({ size: "md", className: "min-h-11" })}
            >
              <OpenIcon size={16} aria-hidden="true" />
              {signup ? bt("회원가입 창 열기", "Open sign-up") : bt("로그인 창 열기", "Open sign-in")}
            </button>
            <Link
              href={signup ? "/auth/login" : "/auth/signup"}
              className={buttonClass({ variant: "ghost", size: "md", className: "min-h-11" })}
            >
              {signup ? bt("이미 계정이 있어요", "I already have an account") : bt("처음이라면 회원가입", "New here? Sign up")}
            </Link>
          </>
        }
      />
      <Section
        className="mt-10"
        eyebrow="WITHOUT SIGNING IN"
        title={bt("로그인 없이 바로 해 볼 수 있어요", "Things you can do right away")}
        desc={bt("계정이 없어도 아래 작업은 지금 이 기기에서 시작할 수 있어요.", "These work on this device even before you create an account.")}
      >
        <div className="grid gap-3 md:grid-cols-3">
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
        <p className="mt-4 flex items-center gap-2 text-xs text-fg-3">
          <FolderOpen size={14} aria-hidden="true" />
          {bt("로그인 전 작업은 이 브라우저에 저장돼요. 기기를 바꾸기 전에는 파일로 내보내 두세요.", "Work before signing in stays in this browser. Export it before switching devices.")}
        </p>
      </Section>
      {dialogOpen ? (
        <AuthModal
          initialMode={mode}
          returnFocusRef={openButtonRef}
          onClose={() => setDialog("closed")}
        />
      ) : null}
    </Container>
  );
}
