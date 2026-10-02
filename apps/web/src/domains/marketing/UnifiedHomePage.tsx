import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { CreatorHomePage } from "@/domains/creator-resources/CreatorHomePage";

/**
 * One front door for ToonStudio.
 * "/"는 로그인 여부와 무관하게 항상 사이트 홈이다. 개인 작업 공간은 별도
 * 목적지인 /home(내 홈)이 소유하고, 로그인 사용자에게는 페이지를 교체하지
 * 않고 홈 안의 개인 스트립으로만 이어 준다. (이전에는 로그인 상태면 "/"가
 * /home으로 강제 이동해 사이트 홈을 볼 방법이 없었다.)
 */
export function UnifiedHomePage() {
  const { ready } = useSession();

  if (!ready) {
    return (
      <section
        aria-label="ToonStudio"
        aria-busy="true"
        className="relative grid min-h-[70dvh] place-items-center overflow-hidden bg-canvas px-5"
      >
        <img
          src="/images/hero-main.webp"
          alt=""
          aria-hidden="true"
          decoding="async"
          className="absolute inset-0 size-full object-cover opacity-35"
        />
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-canvas/40 via-canvas/70 to-canvas" />
        <div className="relative grid max-w-md gap-4 text-center">
          <span className="mx-auto size-12 animate-pulse rounded-2xl border border-accent/35 bg-accent-soft shadow-[0_0_40px_var(--color-accent-soft)] motion-reduce:animate-none" />
          <p className="font-display text-sm font-bold tracking-[0.12em] text-fg-2">TOONSTUDIO</p>
          <p className="text-sm text-fg-3">창작 공간을 준비하고 있습니다.</p>
        </div>
      </section>
    );
  }

  return <CreatorHomePage />;
}

export default UnifiedHomePage;
