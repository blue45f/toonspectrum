import { ArrowUpRight, MapPin } from "lucide-react";
import { useMemo } from "react";

import type { ProductionProjectAggregate, ProductionTask } from "@toonstudio/core/production";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { rankCreatorProductionWork } from "../production-hub/creator-role-production-work";
import {
  studioVirtualProductionDestination,
  type StudioVirtualProductionDestination,
} from "./studio-virtual-space-production-route";
import {
  STUDIO_VIRTUAL_SPACE_WORK_REASON_LABELS,
} from "./studio-virtual-space-role-preset";
import type { SpaceRolePreset } from "./use-space-role-preset";

const MAX_ROLE_WORK = 2;

/**
 * 작업 시작 안내 안에 들어가는 직군 가이드.
 *
 * 직군이 정한 순서대로 ① 직군 우선 업무 (기존 랭킹 재사용) ② 직군 빠른 실행
 * ③ 추천 공간 이동을 보여 준다. 직군이 없으면 아무것도 그리지 않고,
 * 추천에 없는 업무·공간도 기존 동선으로 전부 닿을 수 있다 (프리셋은 강조만).
 */
export function SpaceRoleGuide({ role, aggregate, onGuide, onGuidePlace }: {
  readonly role: SpaceRolePreset;
  readonly aggregate: ProductionProjectAggregate | null;
  readonly onGuide?: (destination: StudioVirtualProductionDestination) => void;
  readonly onGuidePlace?: (roomId: string) => void;
}) {
  const bt = useBilingual("SpaceRoleGuide");
  const { definition } = role;

  const ranked = useMemo(
    () => (aggregate
      ? rankCreatorProductionWork(aggregate, {
          userId: role.userId,
          activeRole: role.activeRole,
          limit: MAX_ROLE_WORK,
        })
      : []),
    [aggregate, role.activeRole, role.userId],
  );
  const taskById = useMemo(
    () => new Map((aggregate?.tasks ?? []).map((task) => [task.id, task] as const)),
    [aggregate],
  );

  if (!definition) return null;

  const roleName = role.customRoleLabel ?? bt(definition.label.ko, definition.label.en);
  return <div className="studio-vspace-role-guide" aria-label={bt("내 직군 안내", "Your role guide")}>
    <div className="studio-vspace-role-guide__head">
      <span className="studio-vspace-role-guide__badge">{roleName}</span>
      <strong>{bt(definition.workspaceTitle.ko, definition.workspaceTitle.en)}</strong>
      <small>{bt(definition.workspaceSummary.ko, definition.workspaceSummary.en)}</small>
    </div>
    {ranked.length ? <ul className="studio-vspace-role-guide__work">
      {ranked.map((item) => {
        const task: ProductionTask | undefined = taskById.get(item.id);
        const destination = task ? studioVirtualProductionDestination(task) : null;
        return <li key={item.id}>
          <div>
            <strong>{item.title}</strong>
            <small>
              {item.reasons.slice(0, 2).map((reason) => bt(...STUDIO_VIRTUAL_SPACE_WORK_REASON_LABELS[reason])).join(" · ")}
              {item.due ? ` · ${bt(
                `마감 ${new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(`${item.due}T00:00:00`))}`,
                `Due ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${item.due}T00:00:00`))}`,
              )}` : ""}
            </small>
          </div>
          {destination && onGuide ? <button type="button" onClick={() => onGuide(destination)}>
            {bt("작업 공간으로 이동", "Walk to workspace")}<ArrowUpRight size={15} aria-hidden />
          </button> : null}
        </li>;
      })}
    </ul> : null}
    <div className="studio-vspace-role-guide__actions">
      {definition.actions.map((action) => (
        <Link key={action.href} href={action.href}>
          <span>{bt(action.label.ko, action.label.en)}</span>
          <ArrowUpRight size={14} aria-hidden />
        </Link>
      ))}
    </div>
    {onGuidePlace && role.preset.places.length ? <div className="studio-vspace-role-guide__places">
      <span><MapPin size={13} aria-hidden />{bt("내 직군 추천 공간", "Spaces for your role")}</span>
      <div>
        {role.preset.places.map((place) => (
          <button key={place.id} type="button" onClick={() => onGuidePlace(place.roomId)}>
            {bt(place.labelKo, place.labelEn)}
          </button>
        ))}
      </div>
    </div> : null}
  </div>;
}
