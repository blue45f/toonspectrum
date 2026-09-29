import { useRef, useState } from "react";

import {
  ArrowRight,
  Box,
  BrainCircuit,
  Brush,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { cx } from "@/shared/lib/cx";

import Link from "@/shared/navigation/router-link";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("TechnologyPage", ko, en);

type StackTabId = "renderer" | "three-d" | "vrm" | "ai";

const TABS: ReadonlyArray<{ id: StackTabId; icon: LucideIcon; ko: string; en: string }> = [
  { id: "renderer", icon: Brush, ko: "렌더러", en: "Renderer" },
  { id: "three-d", icon: Box, ko: "3D", en: "3D" },
  { id: "vrm", icon: UsersRound, ko: "캐릭터(VRM)", en: "Character (VRM)" },
  { id: "ai", icon: BrainCircuit, ko: "AI", en: "AI" },
];

const RENDER_STAGES = [
  {
    step: { ko: "포인터 입력 읽기", en: "Read pointer input" },
    body: { ko: "좌표·압력·기울기를 표준 형식으로 읽습니다.", en: "Read coordinates, pressure and tilt in a standard format." },
  },
  {
    step: { ko: "빠른 미리보기", en: "Fast preview" },
    body: { ko: "지연 없이 손끝의 선을 먼저 보여줍니다.", en: "Show the stroke under your hand without lag." },
  },
  {
    step: { ko: "재료 시뮬레이션", en: "Media simulation" },
    body: { ko: "물감·연필 질감은 뒤에서 따로 계산합니다.", en: "Compute paint and pencil texture separately behind the scene." },
  },
  {
    step: { ko: "타일 커밋", en: "Tile commit" },
    body: { ko: "확정된 획을 저장용 조각에 기록합니다.", en: "Record the finalized stroke into storage tiles." },
  },
  {
    step: { ko: "저장·내보내기", en: "Save and export" },
    body: { ko: "문서와 이미지로 결과를 확정합니다.", en: "Finalize the result as a document and image." },
  },
] as const;

const RENDERER_ROWS = [
  {
    name: "CanvasKit (Skia)",
    explain: { ko: "전문 그래픽 엔진 Skia를 브라우저에서 돌리는 방식", en: "Run the professional graphics engine Skia inside the browser" },
    strength: { ko: "데스크톱 앱 수준의 정밀한 붓 표현", en: "Desktop-grade precise brush rendering" },
    fit: { ko: "성능이 충분한 데스크톱·태블릿", en: "Capable desktops and tablets" },
  },
  {
    name: "Vello",
    explain: { ko: "GPU로 2D 그림을 그리는 차세대 렌더러", en: "A next-generation 2D renderer that draws with the GPU" },
    strength: { ko: "많은 도형도 부드럽게", en: "Smooth with many shapes" },
    fit: { ko: "WebGPU를 지원하는 최신 브라우저", en: "Recent browsers with WebGPU" },
  },
  {
    name: "ThorVG",
    explain: { ko: "가볍고 작은 2D 벡터 그래픽 엔진", en: "A light, compact 2D vector graphics engine" },
    strength: { ko: "용량이 작아 저사양 기기·모바일에 유리", en: "Small footprint, kind to low-end devices and mobile" },
    fit: { ko: "저사양 기기·임베디드 환경", en: "Low-end devices and embedded environments" },
  },
  {
    name: "Canvas2D",
    explain: { ko: "브라우저에 기본 내장된 2D 그리기", en: "Built-in 2D drawing in every browser" },
    strength: { ko: "별도 설치 없이 어디서든 동작", en: "Works anywhere with no setup" },
    fit: { ko: "모든 브라우저의 안전 모드", en: "Safe mode on every browser" },
  },
] as const;

const BACKENDS = ["WebGPU", "CanvasKit (Skia)", "Canvas2D"] as const;

const THREE_D_CARDS = [
  {
    name: "Three.js",
    role: { ko: "장면을 실제로 그리는 기본 엔진", en: "The base engine that actually draws the scene" },
    analogy: { ko: "비유하자면 카메라·조명·무대를 갖춘 촬영 스튜디오입니다.", en: "Think of it as a film studio with camera, lights and stage." },
  },
  {
    name: "React Three Fiber · Drei",
    role: { ko: "React 언어로 장면을 조립하는 도구", en: "Tools to assemble scenes in the React language" },
    analogy: { ko: "무대를 바꾸지 않고 리모컨(React UI)만 교체할 수 있습니다.", en: "You can swap the React UI without rebuilding the stage." },
  },
  {
    name: "WASM 기하 엔진",
    role: { ko: "정밀한 모양 계산을 맡는 전문 담당자", en: "Specialists for precise shape computation" },
    analogy: { ko: "도형을 합치거나 빼는 일은 OpenCascade·Manifold 같은 전문가에게 맡깁니다.", en: "Shape union and subtraction go to experts like OpenCascade and Manifold." },
  },
  {
    name: "Blender MCP",
    role: { ko: "무대 뒤 작업실의 고품질 렌더·패키징", en: "High-quality renders and packaging from the backstage workshop" },
    analogy: { ko: "무거운 일은 headless 파이프라인으로 반복 가능하게 처리합니다.", en: "Heavy work runs as a reproducible headless pipeline." },
  },
] as const;

const VRM_CARDS = [
  {
    title: { ko: "표준 뼈대", en: "Standard skeleton" },
    body: {
      ko: "휴머노이드 규약이라 어느 도구에서 열어도 같은 관절 구조를 가집니다.",
      en: "The humanoid contract keeps the same joint structure in any tool.",
    },
  },
  {
    title: { ko: "표정과 머리카락", en: "Expressions and hair" },
    body: {
      ko: "모프 타깃(표정)과 스프링본(머리카락 움직임) 규칙이 파일에 함께 들어갑니다.",
      en: "Morph targets for expressions and spring bones for hair travel with the file.",
    },
  },
  {
    title: { ko: "검증이 따로 필요합니다", en: "Verification is a separate step" },
    body: {
      ko: "파일이 열린다고 작품에 바로 쓸 수 있는 건 아닙니다. 포즈·표정·발의 접지를 모델마다 확인합니다.",
      en: "Opening a file does not make it production-ready. Poses, expressions and foot grounding are checked per model.",
    },
  },
  {
    title: { ko: "패키지 계약", en: "Package contract" },
    body: {
      ko: "좌표계·단위·재질·뼈대·텍스처·출처를 GLB/VRM 패키지 계약에 고정하고 import/export 왕복을 자동 검사합니다.",
      en: "Coordinate systems, units, materials, skeletons, textures and provenance are fixed, with automated import/export round-trip checks.",
    },
  },
] as const;

const AI_CARDS = [
  {
    title: { ko: "모델 이름이 아니라 작업 의도", en: "Intent, not model names" },
    body: {
      ko: "요청은 '번역 요청서'처럼 공급자에 중립적인 작업 계약으로 보냅니다. 공급자가 바뀌어도 계약은 그대로입니다.",
      en: "Requests go out as provider-neutral work contracts, like a translation order. The contract stays even when the provider changes.",
    },
  },
  {
    title: { ko: "무료 공용 풀", en: "Shared free pool" },
    body: {
      ko: "비용을 내지 않아도 되는 공용 AI 풀부터 사용합니다.",
      en: "Start with the shared free AI pool at no cost.",
    },
  },
  {
    title: { ko: "개인 API 키(BYOK)", en: "Personal API keys (BYOK)" },
    body: {
      ko: "내 키를 쓰면 외부 전송 여부와 사용량을 내가 알고 선택할 수 있습니다.",
      en: "With your own key you see external transfer and usage before you choose.",
    },
  },
  {
    title: { ko: "동의와 예산", en: "Consent and budget" },
    body: {
      ko: "전송 전에 동의·예산·재시도·대체 경로를 정하고, 모호한 오류는 조용히 다른 모델로 넘기지 않습니다.",
      en: "Consent, budget, retry and fallback are decided before sending; ambiguous errors are never silently retried elsewhere.",
    },
  },
  {
    title: { ko: "후보 비교와 승인", en: "Candidate review and approval" },
    body: {
      ko: "생성 후보를 비교한 뒤 선택한 결과만 프로젝트 기록으로 승격합니다. 선택 근거와 기준 이미지도 함께 남습니다.",
      en: "Only the chosen candidate is promoted into the project record, with the reason and reference images kept alongside.",
    },
  },
] as const;

function RendererPanel() {
  return (
    <div>
      <p className="max-w-3xl text-sm leading-7 text-fg-2">
        {bi(
          "ToonStudio의 렌더링은 '어떤 엔진을 쓰느냐'보다 '어떤 약속을 지키느냐'로 설계되어 있습니다. 미리보기·라이브·커밋·내보내기라는 역할을 등록부에 선언해 두고, 뒤쪽의 실제 엔진(WebGPU·CanvasKit·Canvas2D)은 교체할 수 있습니다. 그래서 보이는 획과 저장되는 획이 항상 같은 약속을 따릅니다.",
          "ToonStudio rendering is designed around promises kept, not engines used. Preview, live, commit and export roles are declared in a registry, while the actual backends behind it (WebGPU, CanvasKit, Canvas2D) stay replaceable. The visible stroke and the stored stroke always obey the same contract.",
        )}
      </p>

      <div className="mt-7 rounded-[1.75rem] border border-line/70 bg-panel/65 p-4 sm:p-6" aria-label={bi("렌더링 파이프라인", "Rendering pipeline")}>
        <ol className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
          {RENDER_STAGES.map((stage, index) => (
            <li key={stage.step.ko} className="flex flex-1 flex-col">
              <div className="flex flex-1 flex-col rounded-2xl border border-line/60 bg-card/70 p-4">
                <span className="font-display text-[0.66rem] font-black tracking-[0.16em] text-accent">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="mt-2 text-sm font-bold text-fg">{bi(stage.step.ko, stage.step.en)}</p>
                <p className="mt-1.5 text-xs leading-5 text-fg-3">{bi(stage.body.ko, stage.body.en)}</p>
              </div>
              {index < RENDER_STAGES.length - 1 ? (
                <ArrowRight
                  size={16}
                  aria-hidden="true"
                  className="mx-auto my-1 rotate-90 text-accent lg:my-auto lg:rotate-0"
                />
              ) : null}
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line/60 pt-5">
          <span className="text-xs font-bold text-fg-3">{bi("뒷쪽 엔진은 교체 가능:", "Backends stay replaceable:")}</span>
          {BACKENDS.map((backend) => (
            <span key={backend} className="rounded-full border border-accent/25 bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent">
              {backend}
            </span>
          ))}
          <span className="w-full text-xs leading-5 text-fg-3 sm:w-auto">
            {bi("저사양 기기에서는 안전한 경로로 낮추고, 대체 경로가 결과를 바꾸면 사용자에게 알립니다.", "Constrained devices fall back to a safe path, and users are told when a fallback changes the output.")}
          </span>
        </div>
      </div>

      <div className="mt-7 overflow-x-auto rounded-[1.75rem] border border-line/70">
        <table className="w-full min-w-[38rem] border-collapse bg-card/60 text-left">
          <caption className="sr-only">{bi("렌더러 비교표", "Renderer comparison")}</caption>
          <thead>
            <tr className="border-b border-line/70 bg-panel/80">
              {[bi("기술", "Technology"), bi("쉬운 설명", "In plain words"), bi("강점", "Strength"), bi("잘 맞는 경우", "Good fit")].map(
                (header) => (
                  <th key={header} scope="col" className="px-4 py-3.5 text-xs font-black tracking-wide text-fg-2">
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {RENDERER_ROWS.map((row) => (
              <tr key={row.name} className="border-b border-line/50 last:border-0">
                <th scope="row" className="whitespace-nowrap px-4 py-3.5 text-sm font-bold text-fg">
                  {row.name}
                </th>
                <td className="px-4 py-3.5 text-xs leading-6 text-fg-2">{bi(row.explain.ko, row.explain.en)}</td>
                <td className="px-4 py-3.5 text-xs leading-6 text-fg-2">{bi(row.strength.ko, row.strength.en)}</td>
                <td className="px-4 py-3.5 text-xs leading-6 text-fg-3">{bi(row.fit.ko, row.fit.en)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-6 text-fg-3">
        {bi(
          "각 렌더러의 역할은 등록부에서 관리하며 장치 지원과 출력 특성에 맞춰 경로를 선택합니다. 검증 상태와 한계는 엔지니어링 스토리 챕터에서 공개합니다.",
          "Each renderer role is managed in the registry, with paths chosen by device support and output characteristics. Verification status and limits are published in the engineering story chapters.",
        )}
      </p>
    </div>
  );
}

function ThreeDPanel() {
  return (
    <div>
      <p className="max-w-3xl text-sm leading-7 text-fg-2">
        {bi(
          "웹툰 배경이나 소품을 3D로 만들 때, ToonStudio는 '모델을 띄우는 것'과 '제작에 다시 쓰는 것'을 구분합니다. 저장하는 것은 완성 이미지가 아니라 그 이미지를 다시 만들 수 있는 장면의 상태입니다.",
          "When sets and props go 3D, ToonStudio separates displaying a model from reusing it in production. What gets saved is not the finished image but the scene state that can recreate it.",
        )}
      </p>
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        {THREE_D_CARDS.map((card) => (
          <article key={card.name} className="rounded-[1.75rem] border border-line/70 bg-panel/65 p-5 sm:p-6">
            <h3 className="text-base font-bold text-fg">{card.name}</h3>
            <p className="mt-2 text-sm font-semibold text-accent">{bi(card.role.ko, card.role.en)}</p>
            <p className="mt-2.5 text-sm leading-7 text-fg-2">{bi(card.analogy.ko, card.analogy.en)}</p>
          </article>
        ))}
      </div>
      <div className="mt-5 rounded-[1.75rem] border border-accent/25 bg-accent-soft/60 p-5">
        <p className="text-sm font-bold text-fg">{bi("브라우저 ↔ 무대 뒤", "Browser ↔ backstage")}</p>
        <p className="mt-2 text-sm leading-7 text-fg-2">
          {bi(
            "브라우저는 장면·캐릭터 문서의 권위를 유지하고, Blender는 품질 렌더와 패키징을 반복 가능한 headless 단계로 맡습니다. 결과물은 GLB/VRM 파일, 검토 이미지, SHA-256 영수증으로 묶여 돌아옵니다. 3D 렌더링은 WebGPU를 우선하고 WebGL2 대체 경로를 둡니다.",
            "The browser keeps authority over scene and character documents while Blender handles quality renders and packaging as reproducible headless stages. Results return as GLB/VRM files, review images and SHA-256 receipts. 3D rendering prefers WebGPU with a WebGL2 fallback.",
          )}
        </p>
      </div>
    </div>
  );
}

function VrmPanel() {
  return (
    <div>
      <p className="max-w-3xl text-sm leading-7 text-fg-2">
        {bi(
          "VRM은 3D 캐릭터를 위한 '신체 설계도 + 사용 설명서' 같은 공개 규약입니다. ToonStudio는 VRM 캐릭터를 가져와서 포즈를 잡고, 다시 내보내는 흐름을 지원합니다.",
          "VRM is an open specification that works like a body blueprint plus manual for 3D characters. ToonStudio supports importing a VRM character, posing it, and exporting it again.",
        )}
      </p>
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        {VRM_CARDS.map((card) => (
          <article key={card.title.ko} className="rounded-[1.75rem] border border-line/70 bg-panel/65 p-5 sm:p-6">
            <h3 className="text-base font-bold text-fg">{bi(card.title.ko, card.title.en)}</h3>
            <p className="mt-2.5 text-sm leading-7 text-fg-2">{bi(card.body.ko, card.body.en)}</p>
          </article>
        ))}
      </div>
      <div className="mt-5 rounded-[1.75rem] border border-line/70 bg-card/60 p-5">
        <p className="text-sm font-bold text-fg">
          {bi("손을 컵 가까이 옮기는 일의 속뜻", "What moving a hand to a cup really means")}
        </p>
        <p className="mt-2 text-sm leading-7 text-fg-2">
          {bi(
            "화면에서는 손 하나를 움직이는 것처럼 보이지만, 내부에서는 여러 관절의 회전을 조절합니다. IK는 손·발의 목표 위치에서 관절 자세를 계산하는 방법입니다. 관절 제한과 표정은 모델마다 다를 수 있어, 실제 포즈 조작·저장 후 재열기·카메라 변경·2D 출력까지 확인합니다.",
            "It looks like moving one hand, but internally several joint rotations are solved. IK derives joint poses from hand or foot targets. Joint limits and expressions differ per model, so manipulation, save-and-reopen, camera changes and 2D output are all verified.",
          )}
        </p>
      </div>
    </div>
  );
}

function AiPanel() {
  return (
    <div>
      <p className="max-w-3xl text-sm leading-7 text-fg-2">
        {bi(
          "ToonStudio의 AI는 특정 모델에 화면을 직접 묶지 않습니다. 사용자의 작업 의도와 공급자 API를 분리한 '작업 계약'을 사이에 두어, 공급자의 가격·정책·품질 변화가 제품 전체로 퍼지지 않게 합니다.",
          "ToonStudio AI never wires the screen to one model. A work contract sits between user intent and provider APIs, so a provider's price, policy or quality change does not ripple through the product.",
        )}
      </p>
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {AI_CARDS.map((card) => (
          <article key={card.title.ko} className="rounded-[1.75rem] border border-line/70 bg-panel/65 p-5 sm:p-6">
            <h3 className="text-base font-bold text-fg">{bi(card.title.ko, card.title.en)}</h3>
            <p className="mt-2.5 text-sm leading-7 text-fg-2">{bi(card.body.ko, card.body.en)}</p>
          </article>
        ))}
        <article className="rounded-[1.75rem] border border-accent/25 bg-accent-soft/60 p-5 sm:p-6">
          <h3 className="text-base font-bold text-fg">{bi("Studio Credit", "Studio Credit")}</h3>
          <p className="mt-2.5 text-sm leading-7 text-fg-2">
            {bi(
              "ToonStudio가 비용을 부담하는 AI·서버 렌더에만 Credit을 사용합니다. 개인 API 키, 개인 Creator Runtime, 브라우저 로컬 작업에는 차감하지 않습니다.",
              "Credits are used only for ToonStudio-funded AI and server renders. Personal API keys, personal Creator Runtime and browser-local work are never charged.",
            )}
          </p>
        </article>
      </div>
    </div>
  );
}

export function TechnologyStackShowcase() {
  useBilingualI18nRevision();
  const [active, setActive] = useState<StackTabId>("renderer");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeIndex = TABS.findIndex((tab) => tab.id === active);

  function selectTab(id: StackTabId) {
    setActive(id);
  }

  function onTabKeyDown(event: React.KeyboardEvent) {
    if (
      event.key !== "ArrowRight"
      && event.key !== "ArrowLeft"
      && event.key !== "Home"
      && event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    let next: number;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else {
      const step = event.key === "ArrowRight" ? 1 : -1;
      next = (activeIndex + step + TABS.length) % TABS.length;
    }
    const nextTab = TABS[next];
    if (!nextTab) return;
    selectTab(nextTab.id);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className="py-14 sm:py-20" aria-labelledby="technology-stack-title">
      <p className="eyebrow text-accent">TECH STACK, EXPLAINED SIMPLY</p>
      <h2 id="technology-stack-title" className="mt-3 max-w-3xl text-balance text-2xl font-bold tracking-tight text-fg sm:text-3xl">
        {bi("전문가가 아니어도 읽히는 기술 지도", "A technical map readable without expertise")}
      </h2>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2">
        {bi(
          "렌더러, 3D, 캐릭터, AI — ToonStudio를 움직이는 네 가지 기술을 비유와 그림으로 풀어냈습니다. 탭을 눌러 살펴보세요.",
          "Renderer, 3D, characters and AI — the four technologies moving ToonStudio, explained with analogies and visuals. Switch tabs to explore.",
        )}
      </p>

      <div className="mt-8">
        <div
          role="tablist"
          aria-label={bi("기술 분야", "Technology areas")}
          className="flex gap-2 overflow-x-auto rounded-3xl border border-line/70 bg-panel/70 p-2"
        >
          {TABS.map((tab, index) => {
            const Icon = tab.icon;
            const selected = tab.id === active;
            return (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`stack-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`stack-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(tab.id)}
                onKeyDown={onTabKeyDown}
                className={cx(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  selected
                    ? "bg-accent text-on-accent"
                    : "text-fg-3 hover:bg-raised hover:text-fg",
                )}
              >
                <Icon size={16} aria-hidden="true" />
                {bi(tab.ko, tab.en)}
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <div
            role="tabpanel"
            id="stack-panel-renderer"
            aria-labelledby="stack-tab-renderer"
            tabIndex={0}
            hidden={active !== "renderer"}
            className="rounded-[2rem] border border-line/70 bg-card/40 p-5 shadow-sm sm:p-7"
          >
            <RendererPanel />
          </div>
          <div
            role="tabpanel"
            id="stack-panel-three-d"
            aria-labelledby="stack-tab-three-d"
            tabIndex={0}
            hidden={active !== "three-d"}
            className="rounded-[2rem] border border-line/70 bg-card/40 p-5 shadow-sm sm:p-7"
          >
            <ThreeDPanel />
          </div>
          <div
            role="tabpanel"
            id="stack-panel-vrm"
            aria-labelledby="stack-tab-vrm"
            tabIndex={0}
            hidden={active !== "vrm"}
            className="rounded-[2rem] border border-line/70 bg-card/40 p-5 shadow-sm sm:p-7"
          >
            <VrmPanel />
          </div>
          <div
            role="tabpanel"
            id="stack-panel-ai"
            aria-labelledby="stack-tab-ai"
            tabIndex={0}
            hidden={active !== "ai"}
            className="rounded-[2rem] border border-line/70 bg-card/40 p-5 shadow-sm sm:p-7"
          >
            <AiPanel />
          </div>
        </div>
      </div>

      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          href="/about/technology/story"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-fg px-4 py-2.5 text-sm font-bold text-canvas transition-transform hover:-translate-y-0.5 motion-reduce:transform-none"
        >
          {bi("근거가 궁금하면 전체 제작 스토리", "Read the full engineering story for evidence")}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
        <Link
          href="/about/technology/references"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-4 py-2.5 text-sm font-bold text-fg-2 transition-colors hover:text-accent"
        >
          {bi("참고 자료와 장애 기록", "References and incident records")}
        </Link>
      </div>
    </section>
  );
}
