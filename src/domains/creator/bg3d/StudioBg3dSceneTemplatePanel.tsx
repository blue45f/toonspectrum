// "3D 배경" 도구의 씬 템플릿 피커 — StudioBackground3D.tsx "도형" 탭의 복합 오브젝트 프리셋 그리드와
// 같은 패턴(카테고리 칩 + 카드 그리드)을 쓰되, 한 항목이 건물 한 채가 아니라 "교실"·"거리"처럼 이미
// 여러 프리셋이 배치된 완성된 공간이라는 차이가 있다. 프레젠테이션 전용(무상태) — 카테고리 선택 상태와
// "추가" 액션은 모두 부모(StudioBackground3D.tsx)가 소유한다(설계 문서 §2 통합 지점 참고).
import { Building2, Coffee, Trees } from "lucide-react";

import { COMPOSITE_PRESETS } from "../studio-background-3d-composites";
import {
  BG_SCENE_TEMPLATE_CATEGORIES,
  BG_SCENE_TEMPLATE_CATEGORY_LABELS,
  BG_SCENE_TEMPLATES,
  type BgSceneTemplate,
  type BgSceneTemplateCategory,
} from "../studio-background-3d-scene-templates";

import { cx } from "@/lib/cx";

// 템플릿마다 손으로 아이콘을 지정하는 대신 카테고리 단위로만 아이콘을 준다(교실/카페처럼 실내형
// 템플릿이 늘어도 카테고리에 맞는 아이콘을 그대로 재사용할 수 있도록 — COMPOSITE_CATEGORY 칩이
// 아이콘 없이 텍스트만 쓰는 것과 달리, 씬 템플릿 카드는 설명 텍스트가 길어 아이콘으로 스캔성을 보강).
const CATEGORY_ICON: Record<BgSceneTemplateCategory, typeof Building2> = {
  interior: Coffee,
  urban: Building2,
  nature: Trees,
};

// 카드 대표 스와치 색 — 템플릿의 첫 배치가 primitive면 그 color, composite면 참조한 프리셋의
// parts[0].color(복합 프리셋 그리드가 이미 쓰는 "앵커 파츠 색" 관례와 동일). 못 찾으면 중립 회색.
function templatePreviewColor(template: BgSceneTemplate): string {
  const first = template.placements[0];
  if (!first) return "#9aa0a6";
  if (first.type === "primitive") return first.color;
  const preset = COMPOSITE_PRESETS.find((p) => p.id === first.presetId);
  return preset?.parts[0]?.color ?? "#9aa0a6";
}

// 오브젝트(=최종 BgPrimitive) 개수 근사치 — instantiateSceneTemplate을 실제로 돌리지 않고도(순수
// 프레젠테이션 컴포넌트에서 부수효과 없이) 카드에 "대략 몇 개짜리 배치인지" 보여주기 위한 집계.
function estimatedObjectCount(template: BgSceneTemplate): number {
  return template.placements.reduce((sum, placement) => {
    if (placement.type === "primitive") return sum + 1;
    const preset = COMPOSITE_PRESETS.find((p) => p.id === placement.presetId);
    return sum + (preset?.parts.length ?? 0);
  }, 0);
}

export interface StudioBg3dSceneTemplatePanelProps {
  /** null = 전체 카테고리. StudioBackground3D.tsx의 compositeCategory와 동형인 별도 상태(설계 문서 §2). */
  activeCategory: BgSceneTemplateCategory | null;
  onCategoryChange: (category: BgSceneTemplateCategory | null) => void;
  /** 카드를 클릭하면 템플릿 id로 호출됨 — 실제 instantiateSceneTemplate 호출/primitives 배열 반영은 부모 책임. */
  onAddTemplate: (templateId: string) => void;
}

export function StudioBg3dSceneTemplatePanel({ activeCategory, onCategoryChange, onAddTemplate }: StudioBg3dSceneTemplatePanelProps) {
  const visibleTemplates = BG_SCENE_TEMPLATES.filter((t) => activeCategory === null || t.category === activeCategory);

  return (
    <div>
      <p className="mb-2.5 text-[0.68rem] leading-relaxed text-fg-3">
        건물·나무·소품 여러 개가 이미 자연스럽게 배치된 완성형 공간을 한 번에 추가합니다. 추가한 뒤에도 각 부품을 따로 선택해 다듬을 수 있어요.
      </p>

      <div className="mb-2.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          className={cx(
            "rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold transition-colors",
            activeCategory === null ? "border-accent/60 bg-accent-soft text-accent" : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
          )}
          onClick={() => onCategoryChange(null)}
        >
          전체
        </button>
        {BG_SCENE_TEMPLATE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className={cx(
              "rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold transition-colors",
              activeCategory === cat ? "border-accent/60 bg-accent-soft text-accent" : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
            )}
            onClick={() => onCategoryChange(cat)}
          >
            {BG_SCENE_TEMPLATE_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {visibleTemplates.map((template) => {
          const CategoryIcon = CATEGORY_ICON[template.category];
          return (
            <button
              key={template.id}
              type="button"
              className="flex w-full items-start gap-2.5 rounded-lg border border-line bg-card px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-raised"
              onClick={() => onAddTemplate(template.id)}
            >
              <span
                className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-line/70"
                style={{ backgroundColor: templatePreviewColor(template) }}
                aria-hidden
              >
                <CategoryIcon size={15} className="text-white/85 mix-blend-luminosity" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                  {template.label}
                  <span className="rounded-full bg-panel px-1.5 py-0.5 text-[0.6rem] font-medium text-fg-3">오브젝트 {estimatedObjectCount(template)}개</span>
                </span>
                <span className="mt-0.5 block text-[0.66rem] leading-snug text-fg-3">{template.description}</span>
              </span>
            </button>
          );
        })}
        {visibleTemplates.length === 0 ? <p className="py-4 text-center text-[0.68rem] text-fg-3">이 카테고리에는 아직 템플릿이 없어요.</p> : null}
      </div>
    </div>
  );
}
