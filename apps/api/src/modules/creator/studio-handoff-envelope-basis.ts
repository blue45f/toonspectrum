import { canonicalJson } from "@toonspectrum/studio-project-model";
import type { StudioProductionWorkspaceDocument } from "./studio-production.dto";

export function studioHandoffRoleBasis(document: StudioProductionWorkspaceDocument, roleId: string) {
  const role = document.roleAssignments.find((candidate) => candidate.id === roleId);
  if (!role) return null;
  const scope: { id: string; kind: string | null; pageId: string | null }[] = []; let id = role.hierarchyNodeId;
  while (id !== null && !scope.some((item) => item.id === id)) {
    const node = document.hierarchy.find((item) => item.id === id);
    scope.push({ id, kind: node?.kind ?? null, pageId: node?.pageId ?? null }); id = node?.parentId ?? null;
  }
  return { id: role.id, memberId: role.memberId, roles: [...role.roles].sort(), scope };
}
export function studioHandoffChangedRoles(current: StudioProductionWorkspaceDocument, next: StudioProductionWorkspaceDocument) {
  return current.roleAssignments.filter((role) => canonicalJson(studioHandoffRoleBasis(current, role.id)) !== canonicalJson(studioHandoffRoleBasis(next, role.id))).map((role) => role.id);
}
export function studioHandoffBriefBasis(document: StudioProductionWorkspaceDocument, handoffId: string) {
  const brief = document.handoffs.find((item) => item.id === handoffId);
  if (!brief) return null;
  return { id: brief.id, hierarchyNodeId: brief.hierarchyNodeId, fromRole: brief.fromRole, toRole: brief.toRole,
    scenePurpose: brief.scenePurpose, emotionalBeat: brief.emotionalBeat, mustShow: brief.mustShow,
    continuityNotes: brief.continuityNotes, lockedFields: [...brief.lockedFields].sort(), acceptanceCriteria: brief.acceptanceCriteria };
}
export function studioHandoffChangedBriefs(current: StudioProductionWorkspaceDocument, next: StudioProductionWorkspaceDocument) {
  return current.handoffs.filter((brief) => canonicalJson(studioHandoffBriefBasis(current, brief.id)) !== canonicalJson(studioHandoffBriefBasis(next, brief.id))).map((brief) => brief.id);
}
