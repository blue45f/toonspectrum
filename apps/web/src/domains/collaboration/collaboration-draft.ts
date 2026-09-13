import {
  COLLABORATION_MODES, COLLABORATION_PAY, COLLABORATION_ROLES, COLLABORATION_TYPES,
  COLLABORATION_UNITS, collaborationRecord, isCollaborationKey,
} from "../../../../../packages/core/src/collaboration";

import type { CollaborationInput } from "../../../../../packages/core/src/collaboration";

export function emptyCollaborationDraft(): CollaborationInput {
  return { type: "commission", role: "ink", title: "", payType: "negotiable", workMode: "remote", details: {
    description: "", deliverables: "", terms: "", compensation: "", budgetMin: null, budgetMax: null,
    budgetUnit: "episode", deadline: "", location: "", genre: "", tools: [], portfolioUrl: "",
  } };
}
export const collaborationDraftKey = (userId: string) => `toonstudio:collaboration-draft:v1:${userId}`;
export function readCollaborationDraft(storage: Pick<Storage, "getItem">, userId: string): CollaborationInput | null {
  try {
    const raw = storage.getItem(collaborationDraftKey(userId));
    if (!raw || raw.length > 30_000) return null;
    const envelope = collaborationRecord(JSON.parse(raw));
    if (envelope.version !== 1) return null;
    const data = collaborationRecord(envelope.input); const details = collaborationRecord(data.details);
    if (!isCollaborationKey(COLLABORATION_TYPES, data.type) || !isCollaborationKey(COLLABORATION_ROLES, data.role)
      || !isCollaborationKey(COLLABORATION_PAY, data.payType) || !isCollaborationKey(COLLABORATION_MODES, data.workMode)
      || !isCollaborationKey(COLLABORATION_UNITS, details.budgetUnit)) return null;
    const base = emptyCollaborationDraft();
    for (const key of ["description", "deliverables", "terms", "compensation", "deadline", "location", "genre", "portfolioUrl"] as const) {
      if (typeof details[key] !== "string") return null;
      base.details[key] = details[key];
    }
    if (typeof data.title !== "string" || !Array.isArray(details.tools) || details.tools.some((tool) => typeof tool !== "string")) return null;
    for (const key of ["budgetMin", "budgetMax"] as const) {
      if (details[key] !== null && (typeof details[key] !== "number" || !Number.isFinite(details[key]))) return null;
      base.details[key] = details[key] as number | null;
    }
    return { ...base, type: data.type, role: data.role, title: data.title, payType: data.payType, workMode: data.workMode,
      details: { ...base.details, budgetUnit: details.budgetUnit, tools: details.tools as string[] } };
  } catch { return null; }
}
export function saveCollaborationDraft(storage: Pick<Storage, "setItem">, userId: string, input: CollaborationInput): boolean {
  try { storage.setItem(collaborationDraftKey(userId), JSON.stringify({ version: 1, input })); return true; }
  catch { return false; }
}
export function collaborationTemplate(kind: "ink" | "background" | "team"): CollaborationInput {
  const input = emptyCollaborationDraft();
  input.type = kind === "team" ? "team" : "commission";
  input.role = kind === "background" ? "background" : kind === "team" ? "story" : "ink";
  input.title = kind === "team" ? "새 웹툰을 함께 만들 팀원을 모집합니다" : kind === "background" ? "웹툰 배경 제작 작업자를 찾습니다" : "웹툰 선화 보조 작업자를 찾습니다";
  input.details.description = "작품의 장르와 분위기, 현재 제작 단계, 함께할 분에게 기대하는 역할을 소개해 주세요. 참고할 공개 포트폴리오와 가능한 작업 일정을 함께 확인하고 싶습니다.";
  input.details.deliverables = "회차 또는 컷 수, 작업 난이도, 납품 파일 형식, 첫 납품일과 피드백 일정을 구체적으로 작성해 주세요.";
  input.details.compensation = "최소 보수 또는 협의 기준, 지급 시점, 테스트 작업의 유료 여부와 중도 취소 시 정산 기준을 적어 주세요.";
  input.details.terms = "저작권 귀속과 이용 범위, 크레딧 표기, 포트폴리오 공개 가능 시점, 포함되는 수정 횟수를 작업 전 서면으로 합의합니다.";
  return input;
}
