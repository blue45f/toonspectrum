import type { ReactNode } from "react";

import { ToonStudioMark } from "@/shared/components/toonstudio-mark";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import "./auth-split-layout.css";

/** 히어로 아트 — 별하늘 옥상에서 노트북으로 작업하는 두 창작자 (repo 생성 에셋, WebP). */
const HERO_ART_SRC = "/assets/studio/illustration-20260926/starlit-rooftop.webp";

/**
 * 인증 화면 공용 분할 레이아웃.
 *
 * 왼쪽은 브랜드 히어로 아트(짙은 남색 밤하늘), 오른쪽은 폼 컬럼이다.
 * 모바일에서는 히어로가 상단 밴드로 접히고 워드마크만 남아, 폼이 첫 화면에 바로 닿는다.
 * 로그인·회원가입·비밀번호 재설정·이메일 인증이 이 문법을 공유해 계정 입구의 첫인상을 통일한다.
 */
export function AuthSplitLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const bt = useBilingual("AuthSplitLayout");
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative isolate overflow-hidden bg-[#070d24] max-lg:h-44 sm:max-lg:h-56">
        <img
          src={HERO_ART_SRC}
          alt=""
          aria-hidden="true"
          className="auth-hero-art absolute inset-0 h-full w-full object-cover object-center"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,oklch(0.1_0.05_270/0.16),oklch(0.08_0.05_270/0.5)_74%,oklch(0.07_0.05_270/0.76))] lg:bg-[linear-gradient(200deg,oklch(0.1_0.05_270/0.06),oklch(0.08_0.05_270/0.38)_60%,oklch(0.07_0.05_270/0.7))]"
        />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-7 lg:p-10">
          <div className="flex items-center gap-2.5">
            <ToonStudioMark className="size-9 rounded-lg shadow-lg" />
            <p className="font-display text-lg font-bold tracking-tight">
              ToonStudio
            </p>
          </div>
          <p className="mt-4 hidden max-w-md font-display text-[1.55rem] font-bold leading-snug tracking-[-0.02em] sm:block">
            {bt(
              "상상하는 모든 이야기가, 여기서 작품이 됩니다",
              "Every story you imagine becomes a work here"
            )}
          </p>
          <p className="mt-2 hidden text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/70 sm:block">
            Story comes to life
          </p>
        </div>
      </div>
      <div className="relative flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-14 lg:py-16 xl:px-20">
        <div className="mx-auto w-full max-w-[26.5rem]">{children}</div>
      </div>
    </div>
  );
}
