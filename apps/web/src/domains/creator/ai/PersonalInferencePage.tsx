import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import { AiCreativeDirectorPanel } from "./AiCreativeDirectorPanel";
import { AiStudioPageHeader, AiStudioSurfaceCards } from "./AiStudioSurfaceNav";
import { PersonalRuntimeWorkspace } from "./PersonalRuntimeWorkspace";
import { AI_DIRECTOR_ANCHOR, AI_RUNTIME_ANCHOR } from "./ai-studio-hub";
import { useHashAnchorScroll } from "./useHashAnchorScroll";

const HUB_ANCHORS: readonly string[] = [AI_DIRECTOR_ANCHOR, "ai-tools", AI_RUNTIME_ANCHOR, "ai-generation-settings"];

/**
 * `/studio/ai-lab` — AI 창작 허브.
 * 1) Luna 제안 목록으로 시작하고, 2) AI 화면별 비용·키·데이터 조건을 한눈에 비교한 뒤,
 * 3) 필요하면 내 Creator Runtime으로 영상·3D 변환을 이어간다.
 */
export function PersonalInferencePage() {
  const bt = useBilingual("PersonalInferencePage");
  useDocumentTitle(bt("AI 크리에이티브 디렉터 · ToonStudio", "AI creative director · ToonStudio"));
  useHashAnchorScroll(HUB_ANCHORS);

  return (
    <div data-ai-hub="director" className="min-w-0 break-keep">
      <Container size="wide" className="space-y-8 py-7 sm:space-y-10 sm:py-10">
        <AiStudioPageHeader
          current="director"
          eyebrow="AI Creative Hub"
          title={bt("AI와 함께, 아이디어를 장면으로", "Turn ideas into scenes with AI")}
          lede={bt("루나에게 제안을 받고, 필요하면 영상·3D 변환까지 이어가세요. 무엇을 할 수 있는지와 비용·키·데이터 조건을 먼저 보여 드려요.", "Get ideas from Luna, then continue into video or 3D conversion. Every tool shows what it does and its cost, key and data conditions up front.")}
          introMotif="spark"
        />

        <AiCreativeDirectorPanel />

        <section id="ai-tools" aria-labelledby="ai-tools-title" className="scroll-mt-24">
          <div className="mb-4 max-w-3xl">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">What AI can do</p>
            <h2 id="ai-tools-title" className="mt-1 text-2xl font-black tracking-[-0.03em] text-fg">
              {bt("AI로 할 수 있는 일 · 사용 조건", "What AI can do · conditions")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-fg-2">
              {bt("어느 화면이든 결과를 작품에 자동 반영하지 않고, 준비되지 않은 기능은 가짜 결과 대신 이유와 대안을 보여줘요.", "No screen applies results to your work automatically, and anything not ready shows the reason and an alternative instead of a fake result.")}
            </p>
          </div>
          <AiStudioSurfaceCards current="director" />
        </section>

        <PersonalRuntimeWorkspace />
      </Container>
    </div>
  );
}
