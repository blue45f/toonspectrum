import { ArrowDown, Cloud, FileImage, FolderOpen, Layers3, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import "./studio-import-visual-guide.css";

type Locale = "ko" | "en";

const COPY = {
  ko: {
    eyebrow: "가져오기도 한눈에",
    title: "파일을 고르면,\n무엇이 일어나는지 먼저 보여드려요.",
    body: "PSD·PNG·이미지와 외부 저장소 파일을 바로 열기 전에 구조와 안전성을 확인하고, 어떤 상태로 Studio에 들어오는지 미리 보여줍니다.",
    heroAlt: "파일과 레이어가 ToonStudio 작업공간으로 연결되는 오리지널 제품 비주얼",
    sources: [
      ["내 파일", "PSD · PNG · JPEG · 프로젝트 원본"],
      ["동기화 폴더", "Drive · Dropbox · OneDrive 폴더"],
      ["복구할 작업", "브라우저 임시 작업 · 자동 저장본"],
    ],
    steps: [
      ["1", "파일 고르기", "원본은 그대로 두고 읽을 파일을 선택해요."],
      ["2", "열기 전 확인", "레이어·크기·호환성·문제를 먼저 보여줘요."],
      ["3", "안전하게 시작", "가져온 뒤에는 자동 저장되는 작업공간에서 이어가요."],
    ],
    safe: "원본 파일은 가져오기 과정에서 자동으로 덮어쓰지 않아요.",
  },
  en: {
    eyebrow: "SEE THE IMPORT BEFORE OPENING IT",
    title: "Choose a file,\nthen see what will happen.",
    body: "Before PSD, PNG, image or external-drive content enters Studio, preview structure, compatibility and the resulting workspace state.",
    heroAlt: "Original product visual showing files and layers moving into a ToonStudio workspace",
    sources: [
      ["My files", "PSD · PNG · JPEG · project originals"],
      ["Synced folders", "Drive · Dropbox · OneDrive folders"],
      ["Recover work", "Browser drafts · autosaved work"],
    ],
    steps: [
      ["1", "Choose a file", "Select what to read while leaving the original untouched."],
      ["2", "Check before opening", "See layers, dimensions, compatibility and issues first."],
      ["3", "Start safely", "Continue inside an autosaved workspace after import."],
    ],
    safe: "Import does not automatically overwrite the original file.",
  },
} as const;

const SOURCE_ICONS = [FileImage, Cloud, FolderOpen] as const;
const STEP_ICONS = [FolderOpen, Layers3, ShieldCheck] as const;

export function StudioImportVisualGuide({ locale }: { readonly locale: Locale }) {
  const copy = COPY[locale];
  const reducedMotion = useReducedMotion();

  return (
    <section className="studio-import-visual-guide" aria-labelledby="studio-import-visual-title" lang={locale}>
      <div className="studio-import-visual-guide__hero">
        <div className="studio-import-visual-guide__copy">
          <p className="studio-import-visual-guide__eyebrow">{copy.eyebrow}</p>
          <h2 id="studio-import-visual-title">{copy.title}</h2>
          <p>{copy.body}</p>
          <div className="studio-import-visual-guide__sources">
            {copy.sources.map(([title, body], index) => {
              const Icon = SOURCE_ICONS[index] ?? FileImage;
              return <span key={title}><Icon size={16} aria-hidden="true" /><b>{title}</b><small>{body}</small></span>;
            })}
          </div>
        </div>
        <motion.figure
          initial={reducedMotion ? false : { opacity: 0, x: 18 }}
          whileInView={reducedMotion ? undefined : { opacity: 1, x: 0 }}
          viewport={{ once: true, amount: .2 }}
          transition={{ duration: .48, ease: [0.16, 1, 0.3, 1] }}
        >
          <picture>
            <source media="(max-width: 720px)" srcSet="/brand/atelier-world-640.webp" />
            <source media="(max-width: 1200px)" srcSet="/brand/atelier-world-960.webp" />
            <img src="/brand/atelier-world.webp" alt={copy.heroAlt} loading="lazy" decoding="async" />
          </picture>
          <span className="studio-import-visual-guide__float studio-import-visual-guide__float--file"><FileImage size={17} aria-hidden="true" />PSD</span>
          <span className="studio-import-visual-guide__float studio-import-visual-guide__float--layers"><Layers3 size={17} aria-hidden="true" />Layers</span>
          <span className="studio-import-visual-guide__float studio-import-visual-guide__float--safe"><ShieldCheck size={17} aria-hidden="true" />Safe open</span>
        </motion.figure>
      </div>

      <div className="studio-import-visual-guide__steps">
        {copy.steps.map(([number, title, body], index) => {
          const Icon = STEP_ICONS[index] ?? ShieldCheck;
          return (
            <motion.article
              key={title}
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: .3 }}
              transition={{ duration: .38, delay: index * .06, ease: [0.16, 1, 0.3, 1] }}
            >
              <span>{number}</span><Icon size={19} aria-hidden="true" /><h3>{title}</h3><p>{body}</p>
              {index < copy.steps.length - 1 ? <ArrowDown className="studio-import-visual-guide__next" size={17} aria-hidden="true" /> : null}
            </motion.article>
          );
        })}
      </div>

      <p className="studio-import-visual-guide__safe"><ShieldCheck size={16} aria-hidden="true" />{copy.safe}</p>
    </section>
  );
}
