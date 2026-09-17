import {
  ArrowRight,
  Captions,
  FileVideo2,
  MonitorPlay,
  Play,
  ShieldCheck,
  Subtitles,
  Workflow,
} from "lucide-react";

import { AboutSectionNav } from "../AboutSectionNav";
import { ENGINEERING_VIDEO_FORMATS } from "./engineering-story-content";
import {
  EngineeringPageIntro,
  EngineeringStatusBadge,
  EngineeringStoryNav,
} from "./EngineeringStoryUi";
import { useEngineeringLocale } from "./use-engineering-locale";

import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Container } from "@/shared/components/section";

const STORYBOARD = [
  {
    time: "00:00–00:12",
    title: { ko: "끊긴 제작 맥락", en: "Fragmented production context" },
    body: { ko: "기획·드로잉·3D·파일·검수 도구 사이에서 사라지는 맥락을 보여줍니다.", en: "Shows context being lost between planning, drawing, 3D, files and review tools." },
  },
  {
    time: "00:12–00:25",
    title: { ko: "프로젝트 중심 도메인", en: "Project-centered domain" },
    body: { ko: "Workspace, Project, Episode, Cut, Asset와 Approval이 하나의 흐름으로 정렬됩니다.", en: "Workspace, Project, Episode, Cut, Asset and Approval align into one flow." },
  },
  {
    time: "00:25–00:38",
    title: { ko: "브러시와 로컬 우선 데이터", en: "Brushes and local-first data" },
    body: { ko: "입력에서 문서 commit까지의 파이프라인과 OPFS·복구 저널을 시각화합니다.", en: "Visualizes the input-to-document pipeline and OPFS recovery journal." },
  },
  {
    time: "00:38–00:51",
    title: { ko: "Worker·PWA·브라우저 로컬 AI", en: "Workers, PWA and browser-local AI" },
    body: { ko: "59개 전용 Worker와 버전 있는 Service Worker, ONNX WebGPU/WASM·MediaPipe의 요청·취소·메모리 경계를 설명합니다.", en: "Explains request, cancellation and memory boundaries across 59 dedicated workers, versioned service workers, ONNX WebGPU/WASM and MediaPipe." },
  },
  {
    time: "00:51–01:04",
    title: { ko: "협업·AI·개인 클라우드", en: "Collaboration, AI and personal cloud" },
    body: { ko: "외부 공급자를 제품 계약 뒤에 두고 사용자 승인과 권리 정보를 보존합니다.", en: "Places external providers behind product contracts while preserving approval and rights metadata." },
  },
  {
    time: "01:04–01:17",
    title: { ko: "검증 가능한 상태", en: "Verifiable status" },
    body: { ko: "운영, 설정, 실험과 문서 상태를 코드·테스트·워크플로 근거와 연결합니다.", en: "Connects live, configured, experimental and documented states to code, tests and workflows." },
  },
  {
    time: "01:17–01:30",
    title: { ko: "다른 프로젝트에 재사용", en: "Reuse in another project" },
    body: { ko: "패키지 목록이 아니라 경계, 실패, 대체 경로와 검증 순서를 가져가도록 마무리합니다.", en: "Closes by reusing boundaries, failure, fallback and verification order rather than a package list." },
  },
] as const;

const RENDER_PIPELINE = [
  { ko: "기술 스토리 콘텐츠와 장면 구성을 코드 리뷰", en: "Review engineering content and scene composition in code" },
  { ko: "수동 GitHub Actions workflow에서 형식 선택", en: "Choose a format in a manual GitHub Actions workflow" },
  { ko: "Remotion typecheck 후 H.264 MP4·poster·manifest 생성", en: "Typecheck Remotion and generate H.264 MP4, poster and manifest" },
  { ko: "자동 게시 없이 30일 review artifact 업로드", en: "Upload a 30-day review artifact without automatic publishing" },
  { ko: "사람이 자막·권리·실제 화면 일치 여부를 검수 후 배포", en: "A person reviews captions, rights and product accuracy before distribution" },
] as const;

export function EngineeringVideosPage() {
  const locale = useEngineeringLocale();
  const ko = locale === "ko";

  useDocumentTitle(
    ko
      ? "ToonStudio 기술 영상 · Remotion 제작 구조"
      : "ToonStudio engineering film · Remotion production structure",
  );

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <AboutSectionNav />
      <EngineeringStoryNav className="mt-3" />

      <EngineeringPageIntro
        eyebrow="REMOTION · REVIEWABLE FILM"
        title={
          ko
            ? "영상도 페이지와 같은 사실을 말하도록 코드로 만듭니다."
            : "The film is coded to tell the same facts as the website."
        }
        description={
          ko
            ? "기존 격리된 Remotion 도구 체인에 기술 스토리 컴포지션을 추가했습니다. 영상은 자동 게시하지 않고, 수동 workflow에서 렌더한 artifact를 사람이 검수한 뒤 배포합니다."
            : "Engineering-story compositions are registered in the existing isolated Remotion toolchain. Nothing is auto-published: a person reviews manually rendered workflow artifacts before distribution."
        }
        aside={
          <div className="rounded-3xl border border-accent/25 bg-accent-soft/30 p-5">
            <EngineeringStatusBadge status="configured" locale={locale} />
            <p className="mt-4 text-sm font-black text-fg">
              {ko ? "컴포지션과 렌더 workflow 연결 완료" : "Composition and render workflow connected"}
            </p>
            <p className="mt-2 text-xs leading-6 text-fg-3">
              {ko
                ? "공개 MP4는 검수 후 별도 배포하므로 페이지가 아직 없는 파일을 성공 영상처럼 재생하지 않습니다."
                : "Public MP4s are distributed only after review, so the page never pretends a missing file is a successful film."
              }
            </p>
          </div>
        }
      />

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]" aria-labelledby="film-preview-title">
        <div className="relative isolate aspect-video overflow-hidden rounded-[2rem] border border-line/70 bg-[#193629] p-6 text-[#f3f4e9] shadow-2xl sm:p-9">
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-40"
            style={{ backgroundImage: "radial-gradient(#cce89022 1px, transparent 1px)", backgroundSize: "18px 18px" }}
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute -right-[8%] top-[12%] -z-10 size-[58%] rounded-full bg-[#2b5037]" aria-hidden="true" />

          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="font-display text-xs font-black tracking-[-0.03em]">ToonStudio<span className="text-[#b5d782]">✳</span></p>
              <p className="mt-2 text-[0.58rem] uppercase tracking-[0.18em] text-[#b6c9ae]">ENGINEERING STORY FILM</p>
            </div>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[0.62rem] font-bold text-[#d7e7cf]">
              90 SEC · 30 FPS
            </span>
          </header>

          <div className="my-auto grid h-[70%] items-center gap-6 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.2em] text-[#b5d782]">WHY · HOW · PROOF</p>
              <h2 id="film-preview-title" className="mt-4 max-w-xl text-balance text-2xl font-black leading-[1.16] tracking-[-0.04em] sm:text-4xl">
                {ko ? "브라우저 제작실을 만든 판단과 검증" : "Decisions and evidence behind a browser studio"}
              </h2>
              <p className="mt-4 max-w-lg text-xs leading-6 text-[#c6d8bf] sm:text-sm sm:leading-7">
                {ko
                  ? "문제 → 도메인 경계 → 로컬 실행 → 전문 엔진 → 데이터 → 검증 → 재사용"
                  : "Problem → domain boundary → local execution → specialist engines → data → verification → reuse"
                }
              </p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <div className="flex items-center justify-between text-[0.58rem] text-[#c6d8bf]">
                <span>ARCHITECTURE MAP</span>
                <span>01 / 07</span>
              </div>
              <div className="mt-4 space-y-2">
                {["Creative experience", "Domain contracts", "Specialist engines", "Data & infrastructure", "Verification"].map((label, index) => (
                  <div key={label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                    <span className="grid size-6 place-items-center rounded-lg bg-[#d7eca4] text-[0.6rem] font-black text-[#23402b]">{index + 1}</span>
                    <span className="text-[0.66rem] font-bold text-[#eff7eb]">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[#294a33]" aria-hidden="true">
            <div className="h-full w-[16.66%] bg-[#b5d782]" />
          </div>
          <span className="absolute bottom-5 right-6 text-[0.58rem] text-[#b6c9ae]">toonstudio.cloud</span>
        </div>

        <div className="space-y-4">
          {ENGINEERING_VIDEO_FORMATS.map((format) => (
            <article key={format.id} className="rounded-3xl border border-line/70 bg-card/65 p-5">
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-10 place-items-center rounded-2xl border border-line bg-panel text-accent">
                  <FileVideo2 size={19} aria-hidden="true" />
                </span>
                <span className="rounded-full border border-line bg-raised px-3 py-1.5 font-display text-[0.66rem] font-black text-fg-3">
                  {format.duration}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-black text-fg">{format.title[locale]}</h3>
              <p className="mt-2 text-sm leading-7 text-fg-3">{format.purpose[locale]}</p>
              <code className="mt-4 block overflow-x-auto whitespace-nowrap rounded-xl bg-panel px-3 py-2 text-[0.66rem] text-fg-2">
                {format.composition}
              </code>
            </article>
          ))}
        </div>
      </section>

      <section className="py-14 sm:py-20" aria-labelledby="storyboard-title">
        <p className="eyebrow text-accent">90-SECOND STORYBOARD</p>
        <h2 id="storyboard-title" className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">
          {ko ? "장면마다 하나의 판단만 설명합니다." : "Each scene explains one decision."}
        </h2>
        <ol className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {STORYBOARD.map((scene, index) => (
            <li key={scene.time} className="rounded-3xl border border-line/70 bg-panel/55 p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-accent text-xs font-black text-on-accent">{index + 1}</span>
                <span className="font-display text-[0.66rem] font-bold text-fg-3">{scene.time}</span>
              </div>
              <h3 className="mt-5 text-lg font-black text-fg">{scene.title[locale]}</h3>
              <p className="mt-3 text-sm leading-7 text-fg-3">{scene.body[locale]}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]" aria-labelledby="render-pipeline-title">
        <div className="rounded-[2rem] border border-line/70 bg-card/65 p-6 sm:p-8">
          <Workflow size={23} className="text-accent" aria-hidden="true" />
          <h2 id="render-pipeline-title" className="mt-4 text-2xl font-black text-fg">
            {ko ? "검토 가능한 렌더 파이프라인" : "Reviewable render pipeline"}
          </h2>
          <ol className="mt-6 space-y-3">
            {RENDER_PIPELINE.map((step, index) => (
              <li key={step.ko} className="flex items-start gap-3 rounded-2xl border border-line/65 bg-panel/65 p-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-black text-on-accent">{index + 1}</span>
                <p className="pt-1 text-sm leading-6 text-fg-2">{step[locale]}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-4">
          <article className="rounded-[2rem] border border-accent/25 bg-accent-soft/25 p-6">
            <Captions size={22} className="text-accent" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-black text-fg">{ko ? "무음으로도 이해" : "Understandable without sound"}</h2>
            <p className="mt-3 text-sm leading-7 text-fg-2">
              {ko
                ? "모든 핵심 메시지는 화면 텍스트로 전달하고, 한국어·영어 VTT와 전체 대본을 영상 artifact와 함께 생성하도록 설계합니다."
                : "Every key message appears on screen, with Korean and English VTT captions and a complete transcript designed to ship with the artifact."
              }
            </p>
          </article>
          <article className="rounded-[2rem] border border-line/70 bg-card/65 p-6">
            <ShieldCheck size={22} className="text-accent" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-black text-fg">{ko ? "자동 공개 없음" : "No automatic publication"}</h2>
            <p className="mt-3 text-sm leading-7 text-fg-2">
              {ko
                ? "workflow 권한은 contents: read로 제한되고 렌더 결과는 artifact에만 올라갑니다. 운영 사이트 반영은 검수된 파일을 별도 변경으로 제출합니다."
                : "Workflow permission stays at contents: read and rendered output is uploaded only as an artifact. Publishing requires a separate reviewed change."
              }
            </p>
          </article>
          <article className="rounded-[2rem] border border-line/70 bg-card/65 p-6">
            <Subtitles size={22} className="text-accent" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-black text-fg">{ko ? "접근성 폴백" : "Accessible fallback"}</h2>
            <p className="mt-3 text-sm leading-7 text-fg-2">
              {ko
                ? "영상이 없거나 모션 감소가 설정돼도 스토리 페이지와 웹 발표 모드에서 동일한 내용을 읽을 수 있습니다."
                : "When film is unavailable or reduced motion is preferred, the story page and web deck expose the same content."
              }
            </p>
          </article>
        </div>
      </section>

      <section className="mt-10 rounded-[2rem] border border-line/70 bg-panel/65 p-6 sm:p-8" aria-labelledby="video-next-title">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <MonitorPlay size={23} className="text-accent" aria-hidden="true" />
            <h2 id="video-next-title" className="mt-4 text-2xl font-black text-fg">
              {ko ? "영상 렌더 전에도 웹 발표를 바로 사용할 수 있습니다." : "The web presentation works before a film is rendered."}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">
              {ko
                ? "발표 모드는 같은 콘텐츠를 사용하며 키보드, 전체 화면, 발표자 노트와 인쇄·PDF를 지원합니다."
                : "Presentation mode uses the same content with keyboard controls, fullscreen, speaker notes and print or PDF."
              }
            </p>
          </div>
          <Link
            href="/about/technology/deck"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
          >
            <Play size={15} aria-hidden="true" />
            {ko ? "발표 모드 열기" : "Open presentation mode"}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </Container>
  );
}
