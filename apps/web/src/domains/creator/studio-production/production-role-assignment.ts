import type {
  ProductionRole,
  ProductionWorkspace,
} from "./studio-production-workspace-runtime";

export interface ProductionRoleAssignmentInput {
  readonly assignmentId: string;
  readonly memberId: string | null;
  readonly displayName: string;
  readonly role: ProductionRole;
  readonly hierarchyNodeId: string | null;
}

export function applyProductionRoleAssignment(
  current: ProductionWorkspace,
  input: ProductionRoleAssignmentInput,
): ProductionWorkspace {
  const displayName = input.displayName.trim();
  if (!displayName) return current;
  const comparableName = displayName.toLocaleLowerCase();
  const existing = current.roleAssignments.find((assignment) => (
    assignment.hierarchyNodeId === input.hierarchyNodeId
    && (input.memberId
      ? assignment.memberId === input.memberId
      : assignment.memberId === null
        && assignment.displayName.trim().toLocaleLowerCase() === comparableName)
  ));
  const previousComparableName = existing?.displayName.trim().toLocaleLowerCase() ?? null;
  const members = [
    ...current.members.filter((name) => {
      const comparable = name.trim().toLocaleLowerCase();
      return comparable !== comparableName && comparable !== previousComparableName;
    }),
    displayName,
  ];

  if (existing) {
    const roles = existing.roles.includes(input.role)
      ? existing.roles
      : [...existing.roles, input.role];
    return {
      ...current,
      members,
      roleAssignments: current.roleAssignments.map((assignment) => assignment.id === existing.id
        ? {
            ...assignment,
            memberId: input.memberId,
            displayName,
            roles,
          }
        : assignment),
    };
  }

  return {
    ...current,
    members,
    roleAssignments: [
      ...current.roleAssignments,
      {
        id: input.assignmentId,
        memberId: input.memberId,
        displayName,
        roles: [input.role],
        hierarchyNodeId: input.hierarchyNodeId,
      },
    ],
  };
}
