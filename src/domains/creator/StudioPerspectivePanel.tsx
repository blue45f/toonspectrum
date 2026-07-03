/**
 * Studio Perspective Panel — 원근자(소실점 스냅) 인스펙터: on/off 토글 + 소실점
 * 목록(좌표 입력 + 삭제) + 추가 버튼. 캔버스 위 핸들 드래그는 StudioPerspectiveOverlay
 * (Konva, Stage 트리 안에 있어야 해서 별도 파일)가 담당하고 동일한 onMovePoint 콜백을
 * 공유한다 — 좌표는 항상 StudioPage 가 소유하는 fully-controlled 컴포넌트(로컬 상태 없음).
 */
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { StudioToggleChip } from "./studio-panel-ui";
import { canAddVanishingPoint, MAX_VANISHING_POINTS, type VanishingPoint } from "./studio-perspective-guide";

import type { ReactElement } from "react";

import { cn } from "@/lib/utils";

/**
 * X/Y 좌표 입력 한 칸 — 완전히 controlled(부모 value가 유일한 진실)로 만들면 "-"만 입력한 순간
 * Number("-")===NaN 이 되어 매 키스트로크마다 0으로 스냅되며 방금 타이핑한 걸 지워버린다.
 * 로컬 텍스트 버퍼를 두어 파싱 가능한 값이 나올 때만 부모에 반영하고, 외부에서 값이 바뀌면
 * (드래그 등) useEffect로 버퍼를 재동기화한다.
 */
function VpCoordInput({
  value,
  onCommit,
  label,
  ariaLabel,
}: {
  value: number;
  onCommit: (next: number) => void;
  label: string;
  ariaLabel: string;
}): ReactElement {
  const [text, setText] = useState(() => String(Math.round(value)));
  useEffect(() => {
    setText(String(Math.round(value)));
  }, [value]);
  return (
    <label className="flex flex-1 items-center gap-1 text-[0.65rem] text-fg-3">
      <span>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (raw === "" || raw === "-") return; // 입력 중간 상태 — 아직 커밋하지 않는다.
          const n = Number(raw);
          if (Number.isFinite(n)) onCommit(n);
        }}
        onBlur={() => setText(String(Math.round(value)))} // 유효하지 않게 남은 입력을 실제 값으로 되돌림.
        className="w-full rounded border border-line bg-card px-1 py-0.5 text-[0.65rem] text-fg focus-visible:outline focus-visible:outline-accent"
      />
    </label>
  );
}

export type StudioPerspectivePanelProps = {
  active: boolean;
  points: VanishingPoint[];
  onToggleActive: () => void;
  onAddPoint: () => void;
  onRemovePoint: (id: string) => void;
  onMovePoint: (id: string, x: number, y: number) => void;
};

export function StudioPerspectivePanel({
  active,
  points,
  onToggleActive,
  onAddPoint,
  onRemovePoint,
  onMovePoint,
}: StudioPerspectivePanelProps): ReactElement {
  const canAdd = canAddVanishingPoint(points);
  return (
    <div className="pt-2.5 border-t border-line/35 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-fg-3">원근자 (Perspective)</p>
        <StudioToggleChip
          active={active}
          onClick={onToggleActive}
          title="소실점을 향해 선이 자동으로 정렬됩니다. (펜·직선 도구에 적용)"
        >
          {active ? "켜짐" : "꺼짐"}
        </StudioToggleChip>
      </div>

      {active && (
        <div className="space-y-2 pl-1.5 border-l border-line/50 ml-1 py-1 animate-fade-in">
          {points.length === 0 ? (
            <p className="text-[0.7rem] leading-relaxed text-fg-3">
              소실점을 추가하면 그 방향으로 선이 스냅돼요.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {points.map((vp, index) => (
                <li key={vp.id} className="flex items-center gap-1.5">
                  <span className="w-14 shrink-0 text-[0.68rem] font-semibold text-fg-3">
                    소실점 {index + 1}
                  </span>
                  <VpCoordInput
                    label="X"
                    ariaLabel={`소실점 ${index + 1} X`}
                    value={vp.x}
                    onCommit={(next) => onMovePoint(vp.id, next, vp.y)}
                  />
                  <VpCoordInput
                    label="Y"
                    ariaLabel={`소실점 ${index + 1} Y`}
                    value={vp.y}
                    onCommit={(next) => onMovePoint(vp.id, vp.x, next)}
                  />
                  <button
                    type="button"
                    aria-label={`소실점 ${index + 1} 삭제`}
                    title="이 소실점 삭제"
                    onClick={() => onRemovePoint(vp.id)}
                    className="grid size-6 shrink-0 place-items-center rounded border border-line text-fg-3 transition-colors hover:bg-raised hover:text-fg"
                  >
                    <Trash2 className="size-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={onAddPoint}
            disabled={!canAdd}
            title={canAdd ? "소실점 추가" : `소실점은 최대 ${MAX_VANISHING_POINTS}개까지 추가할 수 있어요.`}
            className={cn(
              "flex w-full items-center justify-center gap-1 rounded border border-line bg-card py-1 text-[0.68rem] font-semibold text-fg-2 transition-colors",
              canAdd ? "hover:bg-raised cursor-pointer" : "cursor-not-allowed opacity-45"
            )}
          >
            <Plus className="size-3" aria-hidden />
            소실점 추가
          </button>

          <p className="flex items-start gap-1 text-[0.68rem] leading-relaxed text-fg-3">
            <Sparkles className="mt-0.5 shrink-0 size-3 text-accent" aria-hidden />
            소실점을 1~3개 배치하면 펜·직선이 그 점을 향해 자동으로 정렬됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
