import { translateCurrentStaticSourceText, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { useState } from "react";
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

import { ENGINEERING_FILM_CUTS } from "./engineering-playbook-content";
import { ENGINEERING_VIDEO_FORMATS } from "./engineering-story-content";
import {
  EngineeringPageFrame,
  EngineeringPageIntro,
  EngineeringStatusBadge,
} from "./EngineeringStoryUi";
import technologyFilmScript from "./technology-film-script.json";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { ServiceStoryJourney } from "@/shared/components/service-story-journey";
import { MotionEmptyState } from "@/shared/motion-assets/motion-assets-empty";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringVideosPage", ko, en);

const OVERVIEW_FILM = technologyFilmScript.variants.overview;

function filmTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

const STORYBOARD = OVERVIEW_FILM.scenes.map((scene, index) => {
  const duration = OVERVIEW_FILM.durationSeconds / OVERVIEW_FILM.scenes.length;
  return {
    id: scene.id,
    time: `${filmTime(index * duration)}–${filmTime((index + 1) * duration)}`,
    title: scene.title,
    body: scene.body,
    points: scene.points,
  };
});

const RENDER_PIPELINE = [
  { ko: "기술 스토리 콘텐츠와 장면 구성을 코드 리뷰", en: "Review engineering content and scene composition in code" },
  { ko: "수동 GitHub Actions workflow에서 형식 선택", en: "Choose a format in a manual GitHub Actions workflow" },
  { ko: "Remotion typecheck 후 H.264 MP4·poster·manifest 생성", en: "Typecheck Remotion and generate H.264 MP4, poster and manifest" },
  { ko: "자동 게시 없이 30일 review artifact 업로드", en: "Upload a 30-day review artifact without automatic publishing" },
  { ko: "사람이 자막·권리·실제 화면 일치 여부를 검수 후 배포", en: "A person reviews captions, rights and product accuracy before distribution" },
] as const;

export function EngineeringVideosPage() {
  useBilingualI18nRevision();
  // 렌더 결과물은 검수 후 배포되므로 파일이 아직 없으면 폴백 플레이스홀더를 명시한다.
  const [videoFailed, setVideoFailed] = useState(false);


  useDocumentTitle(
    bi("ToonStudio 기술 영상 · Remotion 제작 구조", "ToonStudio engineering film · Remotion production structure"),
  );

  return (
    <EngineeringPageFrame pageId="videos">
      <EngineeringPageIntro
        pageId="videos"
        eyebrow="REMOTION · SINGLE SOURCE · REVIEWABLE FILM"
        title={
          bi("서비스 설명, 발표 화면, 자막과 영상이 같은 장면 원본을 사용합니다.", "Service copy, presentation screens, captions and film share one scene source.")
        }
        description={
          bi("장면 JSON에서 웹 스토리보드, Remotion 컴포지션, 한국어·영어 VTT와 대본을 함께 생성합니다. 영상은 자동 게시하지 않고 수동 workflow artifact를 사람이 검수한 뒤 배포합니다.", "One scene JSON drives the web storyboard, Remotion composition, Korean and English VTT and transcripts. Nothing is auto-published: a person reviews workflow artifacts before distribution.")
        }
        aside={
          <div className="rounded-3xl border border-accent/25 bg-accent-soft/30 p-5">
            <EngineeringStatusBadge status="configured" />
            <p className="mt-4 text-sm font-black text-fg">
              {bi("컴포지션과 렌더 workflow 연결 완료", "Composition and render workflow connected")}
            </p>
            <p className="mt-2 text-xs leading-6 text-fg-3">
              {bi("공개 MP4는 검수 후 별도 배포하므로 페이지가 아직 없는 파일을 성공 영상처럼 재생하지 않습니다.", "Public MP4s are distributed only after review, so the page never pretends a missing file is a successful film.")
              }
            </p>
          </div>
        }
      />

      <ServiceStoryJourney current="film" className="mb-8" />

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]" aria-labelledby="film-preview-title">
        <div className="relative isolate aspect-video overflow-hidden rounded-[2rem] border border-line/70 bg-panel p-6 text-fg shadow-2xl sm:p-9">
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-40"
            style={{ backgroundImage: "radial-gradient(color-mix(in oklab, var(--color-accent) 22%, transparent) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute -right-[8%] top-[12%] -z-10 size-[58%] rounded-full bg-accent/20" aria-hidden="true" />

          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="font-display text-xs font-black tracking-[-0.03em]">ToonStudio<span className="text-accent">✳</span></p>
              <p className="mt-2 text-[0.58rem] uppercase tracking-[0.18em] text-fg-3">{translateCurrentStaticSourceText("domains.legal.technology.EngineeringVideosPage", "en", "ENGINEERING STORY FILM")}</p>
            </div>
            <span className="rounded-full border border-line bg-raised/70 px-3 py-1.5 text-[0.62rem] font-bold text-fg">
              {`${OVERVIEW_FILM.durationSeconds} SEC · ${technologyFilmScript.fps} FPS`}</span>
          </header>

          <div className="my-auto grid h-[70%] items-center gap-6 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.2em] text-accent">{translateCurrentStaticSourceText("domains.legal.technology.EngineeringVideosPage", "en", "WHY · HOW · PROOF")}</p>
              <h2 id="film-preview-title" className="mt-4 max-w-xl text-balance text-2xl font-black leading-[1.16] tracking-[-0.04em] sm:text-4xl">
                {bi("브라우저 제작실을 만든 판단과 검증", "Decisions and evidence behind a browser studio")}
              </h2>
              <p className="mt-4 max-w-lg text-xs leading-6 text-fg-2 sm:text-sm sm:leading-7">
                {bi("문제 → 도메인 경계 → 로컬 실행 → 전문 엔진 → 데이터 → 검증 → 재사용", "Problem → domain boundary → local execution → specialist engines → data → verification → reuse")
                }
              </p>
            </div>
            <div className="rounded-3xl border border-line bg-raised/60 p-4 backdrop-blur">
              <div className="flex items-center justify-between text-[0.58rem] text-fg-2">
                <span>{translateCurrentStaticSourceText("domains.legal.technology.EngineeringVideosPage", "en", "ARCHITECTURE MAP")}</span>
                <span>{`01 / ${String(STORYBOARD.length).padStart(2, "0")}`}</span>
              </div>
              <div className="mt-4 space-y-2">
                {[
                  "Project authority",
                  "Local-first creation",
                  "WebRTC media",
                  "AI · voice · video",
                  "Rights · evidence",
                ].map((label, index) => (
                  <div key={label} className="flex items-center gap-3 rounded-xl border border-line/70 bg-card/70 px-3 py-2">
                    <span className="grid size-6 place-items-center rounded-lg bg-accent text-[0.6rem] font-black text-on-accent">{index + 1}</span>
                    <span className="text-[0.66rem] font-bold text-fg">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-line" aria-hidden="true">
            <div
              className="h-full bg-gradient-to-r from-accent to-accent-2"
              style={{ width: `${100 / STORYBOARD.length}%` }}
            />
          </div>
          <span className="absolute bottom-5 right-6 text-[0.58rem] text-fg-3">{translateCurrentStaticSourceText("domains.legal.technology.EngineeringVideosPage", "en", "toonstudio.cloud")}</span>
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
              <h3 className="mt-5 text-lg font-black text-fg">{bi((format.title).ko, (format.title).en)}</h3>
              <p className="mt-2 text-sm leading-7 text-fg-3">{bi((format.purpose).ko, (format.purpose).en)}</p>
              <code className="mt-4 block overflow-x-auto whitespace-nowrap rounded-xl bg-panel px-3 py-2 text-[0.66rem] text-fg-2">
                {format.composition}
              </code>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="rendered-sample-title" className="rounded-[2rem] border border-line/70 bg-card/65 p-6 sm:p-8">
        <div className="flex items-center gap-2">
          <MonitorPlay size={20} className="text-accent" aria-hidden="true" />
          <p className="text-[0.66rem] font-black uppercase tracking-[0.18em] text-accent">
            {bi("실제 렌더 결과물 · REVIEWED ARTIFACT", "ACTUAL RENDER · REVIEWED ARTIFACT")}
          </p>
        </div>
        <h2 id="rendered-sample-title" className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">
          {bi("같은 파이프라인이 만든 공개 영상", "A public film made by the same pipeline")}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">
          {bi(
            "Remotion typecheck 후 H.264 MP4·poster·한/영 자막(VTT)으로 렌더된 제품 투어 영상입니다. 이 파이프라인의 실제 출력 품질과 자막·나레이션 처리 방식을 보여주는 예시이며, 기술 스토리 필름 자체는 검수 후 별도 배포됩니다.",
            "A product-tour film rendered through the same pipeline: Remotion typecheck, then H.264 MP4, poster and Korean/English subtitle (VTT) output. This sample shows the pipeline's actual output quality and its caption/narration handling; the engineering story film itself is distributed separately after review.",
          )}
        </p>
        {videoFailed ? (
          <MotionEmptyState
            kind="empty"
            title={bi("렌더 결과물을 아직 열 수 없어요", "The rendered artifact is not available yet")}
            description={bi(
              "같은 파이프라인의 렌더 결과물은 검수 후 별도 배포됩니다. 위 웹 스토리보드와 발표 모드에서 같은 내용을 확인할 수 있습니다.",
              "Renders from this pipeline are distributed separately after review. The same content is available in the web storyboard and presentation mode above.",
            )}
            action={
              <Link
                href="/about/technology/deck"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
              >
                <Play size={15} aria-hidden="true" />
                {bi("발표 모드 열기", "Open presentation mode")}
              </Link>
            }
          />
        ) : (
          <video
            className="mt-6 aspect-video w-full rounded-2xl border border-line bg-black object-contain"
            controls
            preload="metadata"
            poster="/brand/toonstudio-product-tour-poster.jpg"
            aria-label={bi("Remotion으로 렌더된 제품 투어 영상", "Product tour film rendered with Remotion")}
            onError={() => setVideoFailed(true)}
          >
            <source src="/brand/toonstudio-product-tour.mp4" type="video/mp4" onError={() => setVideoFailed(true)} />
            <track kind="captions" src="/brand/toonstudio-product-tour.ko.vtt" srcLang="ko" label="한국어" default />
            <track kind="captions" src="/brand/toonstudio-product-tour.en.vtt" srcLang="en" label="English" />
          </video>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href="/product-tour"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
          >
            <Play size={15} aria-hidden="true" />
            {bi("제품 투어 페이지에서 보기", "Watch on the product tour page")}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <p className="text-xs leading-5 text-fg-3">
            {bi("8:24 · 30fps · 합성 내레이션과 자막 포함", "8:24 · 30fps · synthesized narration with captions")}
          </p>
        </div>
      </section>

      <section className="py-14 sm:py-20" aria-labelledby="storyboard-title">
        <p className="eyebrow text-accent">{`${OVERVIEW_FILM.durationSeconds}-SECOND STORYBOARD`}</p>
        <h2 id="storyboard-title" className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">
          {bi("장면마다 하나의 판단만 설명합니다.", "Each scene explains one decision.")}
        </h2>
        <ol className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {STORYBOARD.map((scene, index) => (
            <li key={scene.id} className="rounded-3xl border border-line/70 bg-panel/55 p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-accent text-xs font-black text-on-accent">{index + 1}</span>
                <span className="font-display text-[0.66rem] font-bold text-fg-3">{scene.time}</span>
              </div>
              <h3 className="mt-5 text-lg font-black text-fg">{bi((scene.title).ko, (scene.title).en)}</h3>
              <p className="mt-3 text-sm leading-7 text-fg-3">{bi((scene.body).ko, (scene.body).en)}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {scene.points.map((point) => (
                  <span key={point} className="rounded-full bg-raised px-2.5 py-1 text-[0.64rem] font-bold text-fg-2">
                    {point}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]" aria-labelledby="render-pipeline-title">
        <div className="rounded-[2rem] border border-line/70 bg-card/65 p-6 sm:p-8">
          <Workflow size={23} className="text-accent" aria-hidden="true" />
          <h2 id="render-pipeline-title" className="mt-4 text-2xl font-black text-fg">
            {bi("검토 가능한 렌더 파이프라인", "Reviewable render pipeline")}
          </h2>
          <ol className="mt-6 space-y-3">
            {RENDER_PIPELINE.map((step, index) => (
              <li key={step.ko} className="flex items-start gap-3 rounded-2xl border border-line/65 bg-panel/65 p-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-black text-on-accent">{index + 1}</span>
                <p className="pt-1 text-sm leading-6 text-fg-2">{bi((step).ko, (step).en)}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-4">
          <article className="rounded-[2rem] border border-accent/25 bg-accent-soft/25 p-6">
            <Captions size={22} className="text-accent" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-black text-fg">{bi("무음으로도 이해", "Understandable without sound")}</h2>
            <p className="mt-3 text-sm leading-7 text-fg-2">
              {bi("모든 핵심 메시지는 화면 텍스트로 전달하고, 한국어·영어 VTT와 전체 대본을 영상 artifact와 함께 생성하도록 설계합니다.", "Every key message appears on screen, with Korean and English VTT captions and a complete transcript designed to ship with the artifact.")
              }
            </p>
          </article>
          <article className="rounded-[2rem] border border-line/70 bg-card/65 p-6">
            <ShieldCheck size={22} className="text-accent" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-black text-fg">{bi("자동 공개 없음", "No automatic publication")}</h2>
            <p className="mt-3 text-sm leading-7 text-fg-2">
              {bi("workflow 권한은 contents: read로 제한되고 렌더 결과는 artifact에만 올라갑니다. 운영 사이트 반영은 검수된 파일을 별도 변경으로 제출합니다.", "Workflow permission stays at contents: read and rendered output is uploaded only as an artifact. Publishing requires a separate reviewed change.")
              }
            </p>
          </article>
          <article className="rounded-[2rem] border border-line/70 bg-card/65 p-6">
            <Subtitles size={22} className="text-accent" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-black text-fg">{bi("접근성 폴백", "Accessible fallback")}</h2>
            <p className="mt-3 text-sm leading-7 text-fg-2">
              {bi("영상이 없거나 모션 감소가 설정돼도 스토리 페이지와 웹 발표 모드에서 동일한 내용을 읽을 수 있습니다.", "When film is unavailable or reduced motion is preferred, the story page and web deck expose the same content.")
              }
            </p>
          </article>
        </div>
      </section>

      <section id="film-treatments" className="scroll-mt-32 py-14 sm:py-16" aria-labelledby="film-treatments-title">
        <p className="eyebrow text-accent">FILM TREATMENTS</p>
        <h2 id="film-treatments-title" className="mt-3 max-w-4xl text-balance break-keep text-2xl font-black tracking-tight text-fg sm:text-3xl">
          {bi("길이만 줄이는 것이 아니라 관객의 질문을 바꾸는 네 가지 영상", "Four films that change the audience question, not only the duration")}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">
          {bi("영상 구성안입니다. 실제 렌더 결과는 검수 후 배포하며, 아래 항목이 모두 완성된 영상이라는 뜻은 아닙니다.", "These are film plans. Rendered results ship only after review; the list does not mean every film is finished.")}
        </p>
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {ENGINEERING_FILM_CUTS.map((cut) => (
            <article key={cut.id} className="rounded-[2rem] border border-line/70 bg-card/65 p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-display text-3xl font-black text-accent">{cut.duration}</p>
                  <p className="mt-1 text-xs font-bold text-fg-3">{bi(cut.audience.ko, cut.audience.en)}</p>
                </div>
                <FileVideo2 size={22} className="text-accent" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-lg font-black leading-7 text-fg">{bi(cut.promise.ko, cut.promise.en)}</h3>
              <dl className="mt-4 grid gap-3 lg:grid-cols-3">
                {([
                  [bi("구성", "Beats"), cut.beats],
                  [bi("증거", "Proof"), cut.proof],
                  [bi("피할 것", "Avoid"), cut.avoid],
                ] as const).map(([term, items]) => (
                  <div key={term}>
                    <dt className="text-xs font-black text-accent">{term}</dt>
                    <dd className="mt-2">
                      <ul className="grid gap-1.5 text-xs leading-6 text-fg-2">
                        {items.map((item) => (
                          <li key={item.ko} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />{bi(item.ko, item.en)}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-[2rem] border border-line/70 bg-panel/65 p-6 sm:p-8" aria-labelledby="video-next-title">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <MonitorPlay size={23} className="text-accent" aria-hidden="true" />
            <h2 id="video-next-title" className="mt-4 text-2xl font-black text-fg">
              {bi("영상 렌더 전에도 웹 발표를 바로 사용할 수 있습니다.", "The web presentation works before a film is rendered.")}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">
              {bi("발표 모드는 같은 콘텐츠를 사용하며 키보드, 전체 화면, 발표자 노트와 인쇄·PDF를 지원합니다.", "Presentation mode uses the same content with keyboard controls, fullscreen, speaker notes and print or PDF.")
              }
            </p>
          </div>
          <Link
            href="/about/technology/deck"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
          >
            <Play size={15} aria-hidden="true" />
            {bi("발표 모드 열기", "Open presentation mode")}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </EngineeringPageFrame>
  );
}
