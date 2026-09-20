interface HierarchyIdentity { readonly id: string; readonly parentId: string | null }
interface RoleIdentity { readonly id: string; readonly memberId: string | null; readonly hierarchyNodeId: string | null }

/** Explicit production hierarchy scope; role identifiers never become user identities. */
export function studioReviewRoleAssignmentCoversTask(
  taskHierarchyNodeId: string | null | undefined,
  roleHierarchyNodeId: string | null | undefined,
  hierarchy: readonly HierarchyIdentity[],
): boolean {
  const taskId = taskHierarchyNodeId ?? null, roleId = roleHierarchyNodeId ?? null;
  const nodes = new Map(hierarchy.map((node) => [node.id, node]));
  if (nodes.size !== hierarchy.length || (taskId !== null && !nodes.has(taskId)) || (roleId !== null && !nodes.has(roleId))) return false;
  const seen = new Set<string>();
  let current = taskId, found = roleId === null;
  while (current !== null) {
    if (seen.has(current)) return false;
    seen.add(current);
    const node = nodes.get(current);
    if (!node) return false;
    if (current === roleId) found = true;
    current = node.parentId;
  }
  return found;
}

export interface StudioReviewTaskRoleChoice { readonly userId: string; readonly roleAssignmentIds: readonly string[] }
export interface StudioReviewTaskAssignmentInput {
  readonly assigneeUserIds: readonly string[];
  readonly task: { readonly hierarchyNodeId?: string | null };
  readonly roleAssignments: readonly RoleIdentity[];
  readonly hierarchy: readonly HierarchyIdentity[];
  /** Supplied from fresh authenticated membership policy, never from the reference itself. */
  readonly eligibleUserIds: readonly string[];
}

export function studioReviewTaskAssignmentChoices(input: StudioReviewTaskAssignmentInput): readonly StudioReviewTaskRoleChoice[] {
  const eligible = new Set(input.eligibleUserIds), counts = new Map<string, number>();
  for (const role of input.roleAssignments) counts.set(role.id, (counts.get(role.id) ?? 0) + 1);
  return [...new Set(input.assigneeUserIds)].sort().map((userId) => ({ userId,
    roleAssignmentIds: eligible.has(userId) ? input.roleAssignments.filter((role) => role.memberId === userId
      && counts.get(role.id) === 1 && studioReviewRoleAssignmentCoversTask(input.task.hierarchyNodeId, role.hierarchyNodeId, input.hierarchy))
      .map((role) => role.id).sort() : [],
  }));
}

/** Every assignee is explicitly bound to one existing role. Extra or user-ID-shaped guesses fail. */
export function resolveStudioReviewTaskRoleSelections(
  input: StudioReviewTaskAssignmentInput, selections: Readonly<Record<string, string>>,
): readonly string[] | null {
  const choices = studioReviewTaskAssignmentChoices(input), keys = Object.keys(selections);
  if (keys.length !== choices.length || keys.some((key) => !choices.some((choice) => choice.userId === key))) return null;
  const selected: string[] = [];
  for (const choice of choices) {
    if (!Object.hasOwn(selections, choice.userId) || !choice.roleAssignmentIds.includes(selections[choice.userId]!)) return null;
    selected.push(selections[choice.userId]!);
  }
  return [...new Set(selected)].sort();
}
