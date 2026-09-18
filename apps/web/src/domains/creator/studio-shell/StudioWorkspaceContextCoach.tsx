import { translateCurrentStaticSourceText, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { Boxes, CheckCircle2, Move3d, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";




import type { StudioWorkspaceSurface } from "../studio-workspace-route";

import "./studio-workspace-context-coach.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioWorkspaceContextCoach", ko, en);

type CoachSurface = Extract<StudioWorkspaceSurface, "bg3d" | "poser" | "character">;

const COPY = {
  ko: {
    bg3d: {
      title: "3D 배경은 세 가지만 기억하면 돼요.",
      body: "전문 3D 메뉴를 먼저 익힐 필요 없이 장면을 고르고, 구도를 잡고, 현재 컷에 적용하면 됩니다.",
      steps: ["배경·소품 고르기", "카메라·위치 조정", "현재 컷에 적용"],
    },
    poser: {
      title: "포즈도 장면 기준으로 시작하세요.",
      body: "모델을 고른 뒤 필요한 관절만 움직이고, 현재 컷의 드로잉 참고로 사용하면 됩니다.",
      steps: ["모델 고르기", "관절·시선 조정", "컷 참고로 사용"],
    },
    character: {
      title: "캐릭터는 만들고 바로 재사용하세요.",
      body: "외형과 표정·포즈를 정리한 뒤 프로젝트 소재로 저장해 다음 컷에서도 이어서 사용합니다.",
      steps: ["외형 만들기", "표정·포즈 확인", "프로젝트에 저장"],
    },
    dismiss: "가이드 닫기",
  },
  en: {
    bg3d: {
      title: "3D backgrounds only need three steps.",
      body: "You do not need to learn the whole 3D toolset first. Pick a scene, frame it, then apply it to the current panel.",
      steps: ["Choose scene & props", "Frame camera & position", "Apply to current panel"],
    },
    poser: {
      title: "Start posing from the panel you need.",
      body: "Choose a model, adjust only the joints you need, then use the result as drawing reference for the current panel.",
      steps: ["Choose a model", "Adjust pose & gaze", "Use as panel reference"],
    },
    character: {
      title: "Build a character once, then reuse it.",
      body: "Shape appearance, expressions and poses, then save the result as a project material for later panels.",
      steps: ["Shape appearance", "Check expression & pose", "Save to project"],
    },
    dismiss: "Dismiss guide",
  },
} as const;

const ICONS = [Boxes, Move3d, CheckCircle2] as const;

function storageKey(surface: CoachSurface) {
  return `toonstudio:context-coach:v1:${surface}`;
}

export function StudioWorkspaceContextCoach({ surface }: { readonly surface: CoachSurface }) {
  useBilingualI18nRevision();


  const copy = bi((COPY).ko, (COPY).en);
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return window.sessionStorage.getItem(storageKey(surface)) !== "seen"; } catch { return true; }
  });

  const dismiss = useCallback(() => {
    try { window.sessionStorage.setItem(storageKey(surface), "seen"); } catch { /* no-op */ }
    setVisible(false);
  }, [surface]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(dismiss, 16000);
    return () => window.clearTimeout(timer);
  }, [dismiss, visible]);

  const content = copy[surface];
  return (
    <AnimatePresence>
      {visible ? (
        <motion.aside
          className="studio-context-coach"
          aria-label={content.title}
          initial={reducedMotion ? false : { opacity: 0, y: -10, scale: .985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0, y: -8, scale: .985 }}
          transition={{ duration: .28, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="studio-context-coach__visual" aria-hidden="true">
            <img src={surface === "bg3d" ? "/brand/production-os-workspace.svg" : surface === "poser" ? "/brand/theme-scenes/graphite-studio.svg" : "/brand/theme-scenes/blossom-studio.svg"} alt="" />
          </div>
          <div className="studio-context-coach__body">
            <p><Sparkles size={13} aria-hidden="true" /> {translateCurrentStaticSourceText("domains.creator.studio.shell.StudioWorkspaceContextCoach", "en", "JUST-IN-TIME GUIDE")}</p>
            <strong>{content.title}</strong>
            <span>{content.body}</span>
            <ol>
              {content.steps.map((step, index) => {
                const Icon = ICONS[index] ?? CheckCircle2;
                return <li key={step}><Icon size={14} aria-hidden="true" /><span>{index + 1}</span>{step}</li>;
              })}
            </ol>
          </div>
          <button type="button" onClick={dismiss} aria-label={copy.dismiss}><X size={16} aria-hidden="true" /></button>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
