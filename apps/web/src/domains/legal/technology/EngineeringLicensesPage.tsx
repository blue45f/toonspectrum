import {
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText,
  translateLocaleBranchForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  FileCheck2,
  FileText,
  PackageCheck,
  Scale,
  ShieldCheck,
} from "lucide-react";

import { AboutSectionNav } from "../AboutSectionNav";
import {
  ENGINEERING_LICENSE_GROUPS,
  type LocalizedText,
} from "./engineering-story-content";
import {
  EngineeringPageIntro,
  EngineeringStoryNav,
} from "./EngineeringStoryUi";
import { useEngineeringLocale } from "./use-engineering-locale";

import { useDocumentTitle } from "@/hooks/use-document-title";
import { Container } from "@/shared/components/section";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringLicensesPage", ko, en);

const RIGHTS_LAYERS: readonly {
  readonly title: LocalizedText;
  readonly examples: readonly string[];
  readonly rule: LocalizedText;
}[] = [
  {
    title: { ko: "실행 코드", en: "Runtime code" },
    examples: ["npm packages", "WASM", "server libraries"],
    rule: {
      ko: "설치된 버전의 실제 메타데이터와 배포 번들 포함 여부를 함께 확인합니다.",
      en: "Review the installed version's metadata together with whether it ships in the distribution bundle.",
    },
  },
  {
    title: { ko: "폰트와 시각 자산", en: "Fonts and visual assets" },
    examples: ["fonts", "icons", "images", "brush presets", "3D models"],
    rule: {
      ko: "코드 라이선스와 분리해 출처, 저작자 표시, 변경·재배포·상업 이용 범위를 기록합니다.",
      en: "Track source, attribution, modification, redistribution and commercial-use scope separately from code licenses.",
    },
  },
  {
    title: { ko: "외부 서비스", en: "External services" },
    examples: ["OAuth", "cloud storage", "AI APIs", "media providers"],
    rule: {
      ko: "SDK 라이선스뿐 아니라 API 약관, 사용자 데이터 전송, 브랜딩과 심사 조건을 검토합니다.",
      en: "Review API terms, user-data transfer, branding and approval conditions in addition to SDK licensing.",
    },
  },
  {
    title: { ko: "AI 모델과 생성 결과", en: "AI models and generated output" },
    examples: ["model weights", "input references", "generated image", "generated sound"],
    rule: {
      ko: "모델 사용권, 입력 권리, 공급자 약관과 출력 사용 범위를 각각 보존합니다.",
      en: "Preserve model rights, input rights, provider terms and output usage scope as separate records.",
    },
  },
] as const;

const REVIEW_PIPELINE: readonly LocalizedText[] = [
  {
    ko: "lockfile과 실제 설치 메타데이터에서 의존성과 라이선스를 수집합니다.",
    en: "Collect dependencies and licenses from the lockfile and installed package metadata.",
  },
  {
    ko: "런타임·개발 전용·선택 기능·외부 자산을 서로 다른 목록으로 분리합니다.",
    en: "Separate runtime, development-only, optional and external-asset inventories.",
  },
  {
    ko: "금지·검토 필요·고지 필요 규칙으로 자동 분류하고 사람이 예외를 검토합니다.",
    en: "Classify prohibited, review-required and notice-required cases automatically, then review exceptions manually.",
  },
  {
    ko: "빌드에서 THIRD_PARTY_NOTICES를 생성하고 저장소 결과와 차이가 있으면 CI를 실패시킵니다.",
    en: "Generate THIRD_PARTY_NOTICES during build and fail CI when the checked result differs.",
  },
  {
    ko: "출시 전 상업 에셋·AI 모델·공급자 약관의 검토일과 책임자를 갱신합니다.",
    en: "Before release, refresh review dates and ownership for commercial assets, AI models and provider terms.",
  },
] as const;

const OPEN_SOURCE_ROLES: readonly {
  readonly role: LocalizedText;
  readonly examples: readonly string[];
  readonly boundary: LocalizedText;
}[] = [
  {
    role: { ko: "웹 애플리케이션", en: "Web application" },
    examples: ["React", "TypeScript", "Vite", "Tailwind CSS", "Lucide"],
    boundary: {
      ko: "화면과 디자인 언어를 구성하지만 프로젝트 데이터의 영속 권위는 소유하지 않습니다.",
      en: "Builds the interface and visual language, but does not own durable project authority.",
    },
  },
  {
    role: { ko: "2D·3D 제작", en: "2D and 3D creation" },
    examples: ["CanvasKit / Skia", "Three.js", "Babylon.js", "perfect-freehand", "Yjs"],
    boundary: {
      ko: "각 엔진은 입력, 렌더링, 협업 등 맡은 역할만 소유하고 최종 문서 commit은 하나의 경로로 수렴합니다.",
      en: "Each engine owns only its input, rendering or collaboration role, while final document commit converges on one path.",
    },
  },
  {
    role: { ko: "검증과 전달", en: "Verification and delivery" },
    examples: ["Vitest", "Playwright", "Remotion", "ESLint"],
    boundary: {
      ko: "테스트·영상·규칙 자동화를 담당하며 실제 기능 상태를 대신 주장하지 않습니다.",
      en: "Automates tests, films and rules without substituting for verified product state.",
    },
  },
] as const;

export function EngineeringLicensesPage() {
  useBilingualI18nRevision();



  useDocumentTitle(
    bi("ToonStudio 오픈소스와 라이선스 · 코드부터 생성 결과까지", "ToonStudio open source and licensing · From code to generated output"),
  );

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <AboutSectionNav />
      <EngineeringStoryNav className="mt-3" />

      <EngineeringPageIntro
        eyebrow="OPEN SOURCE · RIGHTS · NOTICES"
        title={
          bi("라이선스는 패키지 이름이 아니라 배포 방식과 자산의 권리까지 함께 봅니다.", "Licensing is reviewed with distribution and asset rights, not package names alone.")
        }
        description={
          bi("ToonStudio는 실행 코드, 개발 도구, 폰트·이미지·브러시·3D, 외부 API, AI 모델과 생성 결과를 별도의 권리 계층으로 관리합니다. 이 페이지는 법률 자문을 대신하지 않으며, 실제 배포 시점의 버전과 약관을 다시 확인합니다.", "ToonStudio tracks runtime code, development tools, fonts, images, brushes, 3D assets, external APIs, AI models and generated output as separate rights layers. This page is not legal advice; versions and terms are rechecked at distribution time.")
        }
        aside={
          <div className="rounded-3xl border border-accent/25 bg-accent-soft/30 p-5">
            <PackageCheck size={21} className="text-accent" aria-hidden="true" />
            <p className="mt-4 text-sm font-black text-fg">
              {bi("고지 생성과 라이선스 audit를 CI에 포함", "Notice generation and license audit run in CI")}
            </p>
            <p className="mt-2 text-xs leading-6 text-fg-3">
              {bi("자동 수집 결과는 출발점이며, 자산과 외부 약관은 사람이 검토한 기록을 함께 유지합니다.", "Automated inventory is the starting point; human review records are retained for assets and external terms.")
              }
            </p>
          </div>
        }
      />

      <section aria-labelledby="open-source-map-title">
        <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.technology.EngineeringLicensesPage", "en", "OPEN-SOURCE ROLE MAP")}</p>
        <h2 id="open-source-map-title" className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">
          {bi("사용한 기술과 소유하지 않는 역할을 함께 공개합니다.", "Document what each technology does—and what it does not own.")}
        </h2>
        <div className="mt-7 grid gap-4 lg:grid-cols-3">
          {OPEN_SOURCE_ROLES.map((item) => (
            <article key={item.role.en} className="rounded-[1.75rem] border border-line/70 bg-panel/60 p-6 shadow-sm">
              <Boxes size={21} className="text-accent" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-black text-fg">{bi((item.role).ko, (item.role).en)}</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.examples.map((example) => (
                  <span key={example} className="rounded-full border border-line bg-card px-3 py-1.5 font-display text-[0.67rem] font-bold text-fg-2">
                    {example}
                  </span>
                ))}
              </div>
              <p className="mt-5 border-t border-line/70 pt-4 text-xs leading-6 text-fg-2">
                {bi((item.boundary).ko, (item.boundary).en)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16" aria-labelledby="rights-layers-title">
        <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.technology.EngineeringLicensesPage", "en", "RIGHTS LAYERS")}</p>
        <h2 id="rights-layers-title" className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">
          {bi("코드 라이선스 하나로 모든 권리를 판단하지 않습니다.", "One code license cannot answer every rights question.")}
        </h2>
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {RIGHTS_LAYERS.map((layer, index) => (
            <article key={layer.title.en} className="rounded-[1.75rem] border border-line/70 bg-card/70 p-6">
              <div className="flex items-start gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-accent/25 bg-accent-soft font-display text-xs font-black text-accent">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-lg font-black text-fg">{bi((layer.title).ko, (layer.title).en)}</h3>
                  <p className="mt-3 text-sm leading-7 text-fg-2">{bi((layer.rule).ko, (layer.rule).en)}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {layer.examples.map((example) => (
                  <span key={example} className="rounded-lg bg-raised px-2.5 py-1.5 font-display text-[0.64rem] font-semibold text-fg-3">
                    {example}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16" aria-labelledby="license-groups-title">
        <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.technology.EngineeringLicensesPage", "en", "LICENSE FAMILIES")}</p>
        <h2 id="license-groups-title" className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">
          {bi("종류별 기본 의무와 추가 확인 지점", "Baseline obligations and review points by license family")}
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2">
          {bi("아래 내용은 빠른 분류 기준입니다. 정확한 의무는 설치한 버전의 원문, 수정·결합·배포 방식과 관할 법률에 따라 검토합니다.", "These are triage rules. Exact obligations depend on the installed version's text, modification, combination and distribution model, and applicable law.")
          }
        </p>
        <div className="mt-7 overflow-hidden rounded-[1.75rem] border border-line/70 bg-panel/55">
          <div className="hidden grid-cols-[0.8fr_1.1fr_1.45fr_1.45fr] gap-5 border-b border-line bg-raised/70 px-6 py-3 font-display text-[0.64rem] font-black uppercase tracking-[0.12em] text-fg-3 lg:grid">
            <span>{bi("종류", "Family")}</span>
            <span>{bi("예시", "Examples")}</span>
            <span>{bi("기본 의무", "Baseline obligation")}</span>
            <span>{bi("주의", "Caution")}</span>
          </div>
          {ENGINEERING_LICENSE_GROUPS.map((group) => (
            <article key={group.id} className="grid gap-4 border-b border-line/70 px-5 py-6 last:border-b-0 sm:px-6 lg:grid-cols-[0.8fr_1.1fr_1.45fr_1.45fr] lg:gap-5">
              <div>
                <span className="lg:hidden text-[0.62rem] font-black uppercase tracking-[0.12em] text-fg-3">{bi("종류", "Family")}</span>
                <h3 className="mt-1 font-black text-fg lg:mt-0">{bi((group.title).ko, (group.title).en)}</h3>
              </div>
              <div>
                <span className="lg:hidden text-[0.62rem] font-black uppercase tracking-[0.12em] text-fg-3">{bi("예시", "Examples")}</span>
                <p className="mt-1 text-xs leading-6 text-fg-2 lg:mt-0">{group.examples.join(" · ")}</p>
              </div>
              <div>
                <span className="lg:hidden text-[0.62rem] font-black uppercase tracking-[0.12em] text-fg-3">{bi("기본 의무", "Baseline obligation")}</span>
                <p className="mt-1 flex items-start gap-2 text-xs leading-6 text-fg-2 lg:mt-0">
                  <CheckCircle2 size={14} className="mt-1 shrink-0 text-success" aria-hidden="true" />
                  <span>{bi((group.obligation).ko, (group.obligation).en)}</span>
                </p>
              </div>
              <div>
                <span className="lg:hidden text-[0.62rem] font-black uppercase tracking-[0.12em] text-fg-3">{bi("주의", "Caution")}</span>
                <p className="mt-1 flex items-start gap-2 text-xs leading-6 text-fg-2 lg:mt-0">
                  <AlertTriangle size={14} className="mt-1 shrink-0 text-accent" aria-hidden="true" />
                  <span>{bi((group.caution).ko, (group.caution).en)}</span>
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]" aria-labelledby="license-pipeline-title">
        <div className="rounded-[2rem] border border-line/70 bg-panel/65 p-6 shadow-sm sm:p-8">
          <FileCheck2 size={23} className="text-accent" aria-hidden="true" />
          <p className="mt-5 eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.technology.EngineeringLicensesPage", "en", "AUTOMATED + HUMAN REVIEW")}</p>
          <h2 id="license-pipeline-title" className="mt-3 text-2xl font-black tracking-tight text-fg">
            {bi("고지는 자동화하고, 판단은 검토 기록으로 남깁니다.", "Automate notices and record human judgment.")}
          </h2>
          <ol className="mt-6 space-y-3">
            {REVIEW_PIPELINE.map((step, index) => (
              <li key={step.en} className="flex gap-3 rounded-2xl border border-line/70 bg-card/70 p-4 text-sm leading-7 text-fg-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-[0.64rem] font-black text-accent">
                  {index + 1}
                </span>
                <span>{bi((step).ko, (step).en)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-4">
          <article className="rounded-[1.75rem] border border-line/70 bg-card/70 p-6">
            <FileText size={21} className="text-accent" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-black text-fg">{translateCurrentStaticSourceText("domains.legal.technology.EngineeringLicensesPage", "en", "THIRD_PARTY_NOTICES.generated.md")}</h3>
            <p className="mt-3 text-sm leading-7 text-fg-2">
              {bi("빌드 후 배포물에 포함되는 제3자 코드 고지를 생성합니다. 생성 결과가 현재 의존성과 달라지면 audit가 실패해 고지 누락을 조기에 드러냅니다.", "The build generates third-party code notices for distribution. License audit exposes missing updates when the generated result diverges from current dependencies.")
              }
            </p>
            <code className="mt-5 block overflow-x-auto rounded-2xl border border-line bg-[#101612] p-4 font-mono text-xs leading-6 text-[#dfe9dc]">
              pnpm audit:licenses{"\n"}pnpm build
            </code>
          </article>

          <article className="rounded-[1.75rem] border border-line/70 bg-card/70 p-6">
            <Scale size={21} className="text-accent" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-black text-fg">
              {bi("Remotion은 일반적인 permissive 패키지로 단정하지 않습니다.", "Remotion is not assumed to be an ordinary permissive package.")}
            </h3>
            <p className="mt-3 text-sm leading-7 text-fg-2">
              {bi("조직 규모, 제작 방식과 자동 렌더 사용량에 따라 적용 조건이 달라질 수 있으므로 영상 제작 또는 렌더 인프라 변경 시 공식 라이선스 정책을 다시 확인합니다.", "Applicable terms can depend on organization size, production mode and automated rendering volume, so the official policy is rechecked when authoring or render infrastructure changes.")
              }
            </p>
            <a
              href="https://www.remotion.dev/docs/licensing"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex min-h-10 items-center rounded-xl border border-line-strong bg-panel px-4 py-2 text-xs font-black text-fg-2 hover:border-accent/40 hover:text-accent"
            >
              {bi("Remotion 공식 라이선스 확인", "Review Remotion licensing")}
            </a>
          </article>

          <article className="rounded-[1.75rem] border border-accent/25 bg-accent-soft/25 p-6">
            <ShieldCheck size={21} className="text-accent" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-black text-fg">
              {bi("출시 전 반드시 사람이 확인할 항목", "Human review required before release")}
            </h3>
            <ul className="mt-4 space-y-2 text-sm leading-7 text-fg-2">
              {[
                bi("WASM·정적 링크와 copyleft 결합 방식", "WASM, static linking and copyleft combination"),
                bi("상업 폰트·이미지·브러시·3D·사운드의 프로젝트별 사용권", "Project-specific rights for commercial fonts, images, brushes, 3D and sound"),
                bi("AI 모델·API 약관, 입력 권리와 생성 결과의 배포 범위", "AI model/API terms, input rights and generated-output distribution"),
                bi("외부 서비스의 로고·브랜딩·심사·데이터 보존 조건", "External-service logo, branding, review and data-retention conditions"),
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="mt-1.5 shrink-0 text-accent" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <aside className="mt-12 flex items-start gap-4 rounded-3xl border border-line/70 bg-raised/70 p-5" role="note">
        <Scale size={22} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <p className="font-black text-fg">{bi("검토 기준", "Review standard")}</p>
          <p className="mt-2 text-xs leading-6 text-fg-2">
            {bi("페이지의 예시는 기술 교육을 위한 분류이며 법률 의견이 아닙니다. 실제 출시에서는 라이선스 원문, 계약, 배포 국가와 조직 정책에 따라 담당자 또는 법률 전문가의 검토를 거칩니다.", "Examples are engineering education categories, not legal opinions. A real release is reviewed against original license text, contracts, distribution jurisdictions and organizational policy by accountable owners or legal counsel.")
            }
          </p>
        </div>
      </aside>
    </Container>
  );
}
