import { ArrowRight, FileUp, PlayCircle, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import Link from "@/compat/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";

import "./studio-project-library-empty-visual.css";

type Locale = "ko" | "en";

const COPY = {
  ko: {
    eyebrow: "첫 작업은 여기서",
    title: "표시할 작업이 없습니다",
    body: "새 작품을 만들거나, 기존 파일을 가져오거나, 샘플 제작 흐름을 먼저 둘러볼 수 있어요. 그리기 시작과 동시에 이 기기에 임시 자동저장됩니다.",
    visualAlt: "웹툰 제작 화면과 장면 카드가 펼쳐진 ToonStudio 오리지널 스튜디오 비주얼",
    badges: ["자동 저장", "언제든 이어하기", "클라우드는 선택"],
    primary: "새 작업 시작",
    import: "기존 파일 가져오기",
    sample: "샘플 제작 흐름 보기",
    routes: [
      ["01", "새로 만들기", "웹툰·일러스트·스토리보드·3D 등 만들 결과를 고르면 추천 작업공간을 바로 준비해요."],
      ["02", "파일에서 이어가기", "PSD·PNG·프로젝트 원본을 열기 전에 구조와 호환성을 먼저 확인해요."],
      ["03", "샘플로 이해하기", "기획부터 검토·연재까지 연결된 프로젝트를 건드리지 않고 둘러볼 수 있어요."],
    ],
  },
  en: {
    eyebrow: "START YOUR FIRST WORK",
    title: "No work to show",
    body: "Create a new work, bring in an existing file, or explore a safe sample workflow first. Temporary autosave begins as soon as you start creating.",
    visualAlt: "Original ToonStudio visual showing a creative workspace and story panels",
    badges: ["Autosave", "Resume anytime", "Cloud is optional"],
    primary: "Start new work",
    import: "Import existing files",
    sample: "Explore sample workflow",
    routes: [
      ["01", "Create new", "Choose the outcome—webtoon, illustration, storyboard, 3D and more—and open a recommended workspace."],
      ["02", "Continue from files", "Inspect PSD, PNG and project originals for structure and compatibility before opening."],
      ["03", "Learn from a sample", "Explore a safe project connected from planning through review and publishing."],
    ],
  },
} as const;

const HREFS = ["/studio/new", "/studio/import", "/production/projects/sample-project/overview"] as const;

export function StudioProjectLibraryEmptyVisual({ locale }: { readonly locale: Locale }) {
  const copy = COPY[locale];
  const reducedMotion = useReducedMotion();
  return (
    <section className="studio-project-empty-visual" aria-labelledby="studio-project-empty-title" lang={locale}>
      <div className="studio-project-empty-visual__copy">
        <p className="studio-project-empty-visual__eyebrow"><Sparkles size={14} aria-hidden="true" />{copy.eyebrow}</p>
        <h2 id="studio-project-empty-title">{copy.title}</h2>
        <p className="studio-project-empty-visual__body">{copy.body}</p>
        <div className="studio-project-empty-visual__badges" aria-label={locale === "ko" ? "작업 보호 기능" : "Work protection features"}>
          {copy.badges.map((badge) => <span key={badge}><ShieldCheck size={13} aria-hidden="true" />{badge}</span>)}
        </div>
        <div className="studio-project-empty-visual__actions">
          <Link href="/studio/new" className={buttonClass({ className: "gap-2" })}><Plus size={16} aria-hidden="true" />{copy.primary}</Link>
          <Link href="/studio/import" className={buttonClass({ variant: "outline", className: "gap-2" })}><FileUp size={16} aria-hidden="true" />{copy.import}</Link>
        </div>
        <Link href="/production/projects/sample-project/overview" className="studio-project-empty-visual__sample"><PlayCircle size={16} aria-hidden="true" />{copy.sample}<ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
      <motion.figure
        initial={reducedMotion ? false : { opacity: 0, y: 16, rotate: 0.4 }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <img src="/brand/theme-scenes/aurora-studio.svg" alt={copy.visualAlt} loading="lazy" decoding="async" />
        <figcaption>TOONSTUDIO · START → CREATE → CONTINUE</figcaption>
      </motion.figure>
      <div className="studio-project-empty-visual__routes">
        {copy.routes.map(([number, title, body], index) => (
          <motion.div key={title} initial={reducedMotion ? false : { opacity: 0, y: 10 }} animate={reducedMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: .34, delay: index * .055 }}>
            <Link href={HREFS[index]}><span>{number}</span><strong>{title}</strong><p>{body}</p><ArrowRight size={15} aria-hidden="true" /></Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
