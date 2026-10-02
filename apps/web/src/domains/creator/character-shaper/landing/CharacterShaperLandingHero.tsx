import { AlertTriangle, ArrowRight, Check, X } from "lucide-react";
import { Link as RouterLink } from "react-router-dom";

import { StudioPageIntro } from "../../page-intro/StudioPageIntro";
import { Studio3dIllustration } from "../../studio-3d-ui/Studio3dIllustration";
import { HERO_FACTS } from "./character-shaper-landing-copy";

import type { CharacterShaperEditorEntry } from "./use-character-shaper-editor-entry";

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

const HERO_GLOW_STYLE = {
  background: "linear-gradient(to bottom, color-mix(in oklab, var(--illustrated-3d-accent) 12%, transparent), transparent)",
} as const;

const HERO_BLOOM_STYLE = {
  background:
    "radial-gradient(closest-side, color-mix(in oklab, var(--illustrated-3d-cyan) 12%, transparent), transparent 72%)",
} as const;

function WebGlBlockedNotice({ onDismiss }: { readonly onDismiss: () => void }) {
  const bt = useBilingual("CharacterShaperLandingPage");
  return (
    <div
      role="alert"
      data-character-shaper-webgl="unsupported"
      className="mt-5 flex items-start gap-3 rounded-2xl border border-warn/45 bg-warn/10 p-4 text-sm leading-relaxed text-fg-2"
    >
      <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-fg">{bt("이 브라우저에서는 3D 편집기를 열 수 없습니다", "The 3D editor can't open in this browser")}</p>
        <p className="mt-1">
          {bt(
            "그래픽 가속(WebGL)을 사용할 수 없습니다. 브라우저 설정에서 하드웨어 가속을 켜거나 최신 Chrome·Edge·Safari에서 다시 열어 주세요. 아래 사용 가이드와 FAQ는 계속 볼 수 있습니다.",
            "Graphics acceleration (WebGL) isn't available. Turn on hardware acceleration in your browser settings or reopen in a recent Chrome, Edge, or Safari. The guide and FAQ below remain available.",
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={bt("안내 닫기", "Dismiss notice")}
        className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

/**
 * 첫 화면: 한 문장 가치 + 편집기 진입 버튼 1개(+ 가이드 이동 1개).
 * 모바일에서도 제목·요약·시작 버튼이 첫 화면 안에 들어오도록 설명 문단을 줄이고, 삽화는 버튼 아래에 둔다.
 */
export function CharacterShaperLandingHero({ editor }: { readonly editor: CharacterShaperEditorEntry }) {
  const bt = useBilingual("CharacterShaperLandingPage");
  const localize = useBilingualLocalizer("CharacterShaperLandingPage");
  const heroFacts = localize(HERO_FACTS.ko, HERO_FACTS.en);

  return (
    <section className="studio-character-guide__hero relative overflow-hidden border-b border-line bg-ledger">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-56 opacity-70" style={HERO_GLOW_STYLE} />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-6 size-[30rem] rounded-full opacity-60 blur-3xl"
        style={HERO_BLOOM_STYLE}
      />
      <Container
        size="wide"
        className="studio-character-guide__intro relative grid gap-6 py-8 sm:py-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:gap-12 lg:py-16"
      >
        <div className="max-w-2xl">
          <p className="eyebrow text-accent">CHARACTER SHAPER</p>
          <h1 className="mt-3 text-balance [word-break:keep-all] text-[clamp(1.9rem,5vw,3rem)] font-bold leading-[1.12] tracking-tight text-fg">
            {bt("프리셋으로 시작하는 3D 웹툰 캐릭터", "3D webtoon characters that start from presets")}
          </h1>
          <StudioPageIntro motif="cube" className="mt-2" />
          {/* 공용 .lede는 휴대폰에서 두 줄까지만 보여 준다. 잘린 문장 대신 두 줄에 담긴 짧은 문장을 따로 둔다. */}
          <p className="lede mt-3 max-w-xl text-pretty text-base leading-relaxed text-fg-2 [word-break:keep-all] sm:mt-4 sm:text-lg">
            <span className="sm:hidden">
              {bt(
                "프리셋으로 만들고, 포즈를 잡고, 투명 PNG로 컷에 넣으세요.",
                "Build from presets, pose it, and drop a transparent PNG into your panel.",
              )}
            </span>
            <span className="hidden sm:inline">
              {bt(
                "프리셋으로 캐릭터를 고르고, 사진·웹캠으로 포즈를 잡고, 모델 위에 직접 그린 뒤 투명 PNG·레이어 PSD로 내보내기까지 — 설치 없이 브라우저 안에서 끝납니다.",
                "Pick a character from presets, strike a pose with a photo or webcam, draw right on the model, and export transparent PNGs and layered PSDs — all in the browser, no install.",
              )}
            </span>
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3 sm:mt-6">
            <RouterLink
              {...editor.openLink}
              data-character-shaper-start="hero"
              className={buttonClass({ variant: "solid", size: "lg" })}
            >
              {bt("샘플 캐릭터로 바로 시작", "Start with a sample character")}
              <ArrowRight size={18} aria-hidden="true" />
            </RouterLink>
            <a href="#how-to" className={buttonClass({ variant: "outline", size: "lg" })}>
              {bt("사용 가이드", "User guide")}
            </a>
          </div>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-fg-2 [word-break:keep-all]">
            {bt(
              "파일 준비 없이 내장 샘플 캐릭터로 시작하고, 내 VRM은 편집기 안에서 가져올 수 있습니다.",
              "Start with a built-in sample character — no files needed — and import your own VRM inside the editor.",
            )}
          </p>
          {editor.webglBlocked ? <WebGlBlockedNotice onDismiss={editor.close} /> : null}
          <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-fg-2 sm:mt-6">
            {heroFacts.map((fact) => (
              <li key={fact} className="inline-flex items-center gap-1.5">
                <Check size={14} aria-hidden className="shrink-0 text-accent" />
                {fact}
              </li>
            ))}
          </ul>
        </div>
        <div className="mx-auto w-full max-w-[24rem] lg:max-w-none">
          <Studio3dIllustration responsiveCompact />
        </div>
      </Container>
    </section>
  );
}
