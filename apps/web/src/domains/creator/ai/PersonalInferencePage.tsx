import { ChevronDown, Cpu } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { useUnifiedAiAuxSettings } from "@/shared/ai/unified-ai-settings";
import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import { AiCreativeDirectorPanel } from "./AiCreativeDirectorPanel";
import { AiStudioPageHeader, AiStudioSurfaceCards } from "./AiStudioSurfaceNav";
import { PersonalRuntimeWorkspace } from "./PersonalRuntimeWorkspace";
import { AI_DIRECTOR_ANCHOR, AI_RUNTIME_ANCHOR } from "./ai-studio-hub";
import { useHashAnchorScroll } from "./useHashAnchorScroll";

const GENERATION_SETTINGS_ANCHOR = "ai-generation-settings";
const HUB_ANCHORS: readonly string[] = [AI_DIRECTOR_ANCHOR, "ai-tools", AI_RUNTIME_ANCHOR, GENERATION_SETTINGS_ANCHOR];
/** 이 해시로 들어오면 접어 둔 "내 AI 런타임"을 먼저 펼친다(접힌 안쪽은 화면에 없어 스크롤할 곳이 없다). */
const RUNTIME_HASHES: readonly string[] = [`#${AI_RUNTIME_ANCHOR}`, `#${GENERATION_SETTINGS_ANCHOR}`];

/**
 * `/studio/ai-lab` — AI 창작 허브.
 * 1) Luna 제안 목록으로 시작하고, 2) AI 화면별 비용·키·데이터 조건을 한눈에 비교한 뒤,
 * 3) 필요하면 내 Creator Runtime으로 영상·3D 변환을 이어간다. 3)은 고급 기능이라
 *    런타임을 이미 연결했거나 해시로 찾아온 경우에만 펼쳐 두어, 처음 오는 사람의 페이지를 길게 만들지 않는다.
 */
export function PersonalInferencePage() {
  const bt = useBilingual("PersonalInferencePage");
  useDocumentTitle(bt("AI 크리에이티브 디렉터 · ToonStudio", "AI creative director · ToonStudio"));
  useHashAnchorScroll(HUB_ANCHORS);

  const { hash } = useLocation();
  const aux = useUnifiedAiAuxSettings();
  const runtimeConnected = Boolean(aux.settings.creatorRuntimeBaseUrl && aux.settings.creatorRuntimeToken);
  const [runtimeOpen, setRuntimeOpen] = useState(() => runtimeConnected || RUNTIME_HASHES.includes(hash));

  useEffect(() => {
    if (RUNTIME_HASHES.includes(hash)) setRuntimeOpen(true);
  }, [hash]);

  return (
    <div data-ai-hub="director" className="min-w-0 break-keep">
      <Container size="wide" className="space-y-8 py-6 sm:space-y-10 sm:py-10">
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
            <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">What AI can do</p>
            <h2 id="ai-tools-title" className="mt-1 text-2xl font-black tracking-[-0.03em] text-fg">
              {bt("AI로 할 수 있는 일 · 사용 조건", "What AI can do · conditions")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-fg-2">
              {bt("어느 화면이든 결과를 작품에 자동 반영하지 않고, 준비되지 않은 기능은 가짜 결과 대신 이유와 대안을 보여줘요.", "No screen applies results to your work automatically, and anything not ready shows the reason and an alternative instead of a fake result.")}
            </p>
          </div>
          <AiStudioSurfaceCards current="director" />
        </section>

        <details
          open={runtimeOpen}
          onToggle={(event) => setRuntimeOpen(event.currentTarget.open)}
          data-ai-runtime-disclosure
          className="group"
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl border border-line bg-panel/60 px-4 py-3 text-left transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <Cpu size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-black text-fg">{bt("내 AI 런타임 · 고급", "My AI runtime · advanced")}</span>
              <span className="mt-0.5 block text-sm leading-6 text-fg-2">
                {bt("내가 연결한 클라우드 런타임으로 영상·3D를 변환해요. 처음이라면 건너뛰어도 괜찮아요.", "Convert video and 3D on a cloud runtime you connect yourself. Safe to skip if you're just starting.")}
              </span>
            </span>
            <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-fg-3 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="mt-4">
            <PersonalRuntimeWorkspace />
          </div>
        </details>
      </Container>
    </div>
  );
}
