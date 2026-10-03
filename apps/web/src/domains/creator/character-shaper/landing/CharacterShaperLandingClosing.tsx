import { ArrowRight } from "lucide-react";
import { Link as RouterLink } from "react-router-dom";

import type { CharacterShaperEditorEntry } from "./use-character-shaper-editor-entry";

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const CLOSING_GLOW_STYLE = {
  background: "linear-gradient(to bottom, color-mix(in oklab, var(--illustrated-3d-accent) 12%, transparent), transparent)",
} as const;

/** 마무리 행동: 설명은 한 줄, 버튼은 편집기 열기 + 3D 소재 둘러보기. */
export function CharacterShaperLandingClosing({ editor }: { readonly editor: CharacterShaperEditorEntry }) {
  const bt = useBilingual("CharacterShaperLandingPage");
  return (
    <Container size="wide" className="pb-12 sm:pb-16">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-panel/50 px-5 py-8 text-center sm:px-10 sm:py-12">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-80" style={CLOSING_GLOW_STYLE} />
        <div className="relative">
          <p className="eyebrow text-accent">{bt("START", "START")}</p>
          <h2 className="mt-2 text-balance [word-break:keep-all] text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            {bt("지금 첫 캐릭터를 만들어 보세요", "Make your first character now")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-fg-2 [word-break:keep-all] sm:text-base">
            {bt(
              "내장 샘플 모델로 시작하면 파일을 따로 준비하지 않아도 됩니다. 만든 캐릭터는 투명 PNG로 바로 컷에 들어갑니다.",
              "Start with a built-in sample model — no files to prepare. Your character drops straight into your panels as a transparent PNG.",
            )}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <RouterLink
              {...editor.openLink}
              data-character-shaper-start="closing"
              className={buttonClass({ variant: "solid", size: "lg" })}
            >
              {bt("지금 편집기 열기", "Open the editor now")}
              <ArrowRight size={18} aria-hidden="true" />
            </RouterLink>
            <Link href="/market/browse?kind=3d-asset" className={buttonClass({ variant: "outline", size: "lg" })}>
              {bt("3D 소재 둘러보기", "Browse 3D assets")}
            </Link>
          </div>
        </div>
      </div>
    </Container>
  );
}
