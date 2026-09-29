/**
 * Studio 3D 데생 인형 — Magic Poser 벤치마크: 조작 핸들 가이드 (MP7).
 *
 * Magic Poser식 드래그 핸들(무게중심·척추·상체·머리)을 데생 인형 조작 UI의
 * 온보딩 가이드로 정의합니다. 각 핸들이 어떤 관절을 움직이는지 한국어
 * 툴팁(합니다체)으로 안내해 초심자도 포즈 조정을 시작할 수 있게 합니다.
 *
 * 실제 드래그 상호작용은 R3F 뷰 컴포넌트가 이 스펙을 읽어 구현합니다.
 */

import {
  isStudioMannequinJointId,
  STUDIO_MANNEQUIN_JOINT_LABELS,
  type StudioMannequinJointId,
} from "./studio-mannequin-model";

export type StudioMannequinHandleId = "center-of-gravity" | "spine" | "upper-body" | "head";

export interface StudioMannequinHandleGuide {
  readonly id: StudioMannequinHandleId;
  /** UI에 표시할 라벨. */
  readonly label: string;
  /** 핸들이 직접 움직이는 관절. */
  readonly targetJoint: StudioMannequinJointId;
  /** 함께 영향을 받는 보조 관절. */
  readonly affectedJoints: readonly StudioMannequinJointId[];
  /** 한국어 툴팁(합니다체). */
  readonly tooltip: string;
}

export const STUDIO_MANNEQUIN_HANDLE_GUIDES: readonly StudioMannequinHandleGuide[] =
  Object.freeze([
    {
      id: "center-of-gravity",
      label: "무게중심",
      targetJoint: "pelvis",
      affectedJoints: ["leftUpperLeg", "rightUpperLeg", "spine"],
      tooltip:
        "무게중심을 드래그하면 골반이 이동합니다. 앉기·서기·무게 실린 포즈의 기준점으로 사용합니다.",
    },
    {
      id: "spine",
      label: "척추",
      targetJoint: "spine",
      affectedJoints: ["chest", "neck"],
      tooltip:
        "척추를 드래그하면 상체가 굽혀지거나 젖혀집니다. 허리를 숙이는 동작에 사용합니다.",
    },
    {
      id: "upper-body",
      label: "상체",
      targetJoint: "chest",
      affectedJoints: ["spine", "neck", "head", "leftShoulder", "rightShoulder"],
      tooltip:
        "상체를 드래그하면 가슴 위쪽이 함께 움직입니다. 몸을 틀거나 기울이는 연출에 사용합니다.",
    },
    {
      id: "head",
      label: "머리",
      targetJoint: "head",
      affectedJoints: ["neck"],
      tooltip:
        "머리를 드래그하면 고개가 돌아가거나 숙여집니다. 시선 방향을 잡을 때 사용합니다.",
    },
  ] as const satisfies readonly StudioMannequinHandleGuide[]);

/** 핸들 ID로 가이드를 찾습니다. 없으면 undefined를 돌립니다. */
export function findStudioMannequinHandleGuide(
  id: StudioMannequinHandleId,
): StudioMannequinHandleGuide | undefined {
  return STUDIO_MANNEQUIN_HANDLE_GUIDES.find((guide) => guide.id === id);
}

/**
 * 가이드 스펙의 정합성을 검증합니다. ID 중복·유효하지 않은 관절 참조·
 * 빈 툴팁을 찾아내며, 문제는 문자열 목록으로 돌립니다.
 */
export function validateStudioMannequinHandleGuides(
  guides: readonly StudioMannequinHandleGuide[] = STUDIO_MANNEQUIN_HANDLE_GUIDES,
): readonly string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const guide of guides) {
    if (seen.has(guide.id)) {
      problems.push(`중복된 핸들 ID입니다: ${guide.id}`);
    }
    seen.add(guide.id);
    if (!isStudioMannequinJointId(guide.targetJoint)) {
      problems.push(`유효하지 않은 대상 관절입니다: ${guide.id} → ${String(guide.targetJoint)}`);
    }
    for (const jointId of guide.affectedJoints) {
      if (!isStudioMannequinJointId(jointId)) {
        problems.push(`유효하지 않은 보조 관절입니다: ${guide.id} → ${String(jointId)}`);
      }
    }
    if (guide.tooltip.trim().length === 0) {
      problems.push(`툴팁이 비어 있습니다: ${guide.id}`);
    }
  }
  return problems;
}

/** 핸들 가이드의 관절 라벨 목록을 돌립니다(UI 표시용). */
export function describeStudioMannequinHandleJoints(
  guide: StudioMannequinHandleGuide,
): { readonly target: string; readonly affected: readonly string[] } {
  return {
    target: STUDIO_MANNEQUIN_JOINT_LABELS[guide.targetJoint],
    affected: guide.affectedJoints.map((jointId) => STUDIO_MANNEQUIN_JOINT_LABELS[jointId]),
  };
}
