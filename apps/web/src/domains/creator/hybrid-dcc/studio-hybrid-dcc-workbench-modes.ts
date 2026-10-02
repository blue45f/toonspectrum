import { Building2, Clapperboard, Hand, Palette, Ruler, Shapes } from "lucide-react";

import type { StudioDccWorkbenchMode } from "../studio-workspace-route";
import type { LucideIcon } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

// 작업 모드 목록과 이름 조회 훅은 컴포넌트 파일(StudioHybridDccWorkbenchChrome.tsx)과 분리해 두어 Fast Refresh 규칙을 지킨다.

interface WorkbenchModeSpec {
  readonly id: StudioDccWorkbenchMode;
  readonly icon: LucideIcon;
  readonly label: readonly [ko: string, en: string];
  readonly hint: readonly [ko: string, en: string];
}

/** 라우트 제목(3D 모델링·공간 제작·정밀 CAD·조형·재질·UV·컷·선화)과 같은 이름 + 쉬운 한 줄 설명. */
export const WORKBENCH_MODES: readonly WorkbenchModeSpec[] = [
  { id: "model", icon: Shapes, label: ["모델링", "Modeling"], hint: ["도형 만들고 다듬기", "Make and refine shapes"] },
  { id: "build", icon: Building2, label: ["공간 제작", "Sets"], hint: ["방·배경 세트", "Rooms and sets"] },
  { id: "cad", icon: Ruler, label: ["정밀 CAD", "Precise CAD"], hint: ["치수가 정확한 부품", "Exact-size parts"] },
  { id: "sculpt", icon: Hand, label: ["조형", "Sculpt"], hint: ["손으로 빚기 · 실험", "Push and pull · beta"] },
  { id: "material", icon: Palette, label: ["재질·UV", "Surface & UV"], hint: ["텍스처 붙일 준비", "Prepare for textures"] },
  { id: "shot", icon: Clapperboard, label: ["컷·선화", "Shots"], hint: ["카메라 컷을 원고로", "Camera shots to pages"] },
];

export function useStudioHybridDccModeLabel(): (mode: StudioDccWorkbenchMode) => string {
  const bt = useBilingual("StudioHybridDccWorkbench");
  return (mode) => {
    const spec = WORKBENCH_MODES.find(({ id }) => id === mode) ?? WORKBENCH_MODES[0];
    return bt(spec.label[0], spec.label[1]);
  };
}
