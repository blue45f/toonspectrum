import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const OpaqueIdSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value.trim() === value, "식별자 앞뒤에 공백을 사용할 수 없습니다.")
  .refine((value) => !value.includes("\\"), "식별자에 역슬래시를 사용할 수 없습니다.")
  .refine(
    (value) => ![...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
    }),
    "식별자에 제어 문자를 사용할 수 없습니다."
  );
const WorkIdSchema = z.string().trim().min(1).max(160);
const ShortTextSchema = z.string().trim().min(1).max(240);
const OptionalTextSchema = z.string().trim().max(4_000);
const DateTimeSchema = z.iso.datetime({ offset: true });
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

export const ProductionStageSchema = z.enum([
  "planning", "script", "script-approved", "storyboard",
  "storyboard-approved", "rough", "lineart", "color-background",
  "lettering", "review", "approved", "publishing",
]);
export const ProductionRoleSchema = z.enum([
  "story", "storyboard", "lineart", "color", "background",
  "lettering", "reviewer", "director", "publisher",
]);
const ProductionPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
const ProductionTaskStatusSchema = z.enum(["todo", "doing", "blocked", "done"]);
const ProductionReviewSeveritySchema = z.enum(["blocker", "major", "minor"]);
const ProductionReviewStatusSchema = z.enum(["open", "resolved"]);
const ProductionHierarchyKindSchema = z.enum(["episode", "sequence", "scene", "page"]);
const ProductionHandoffStatusSchema = z.enum([
  "draft", "ready", "accepted", "changes-requested",
]);
const ProductionAuthorityFieldSchema = z.enum([
  "dialogue", "balloon-layout", "panel-layout", "character-continuity",
  "background", "publishing",
]);
const IdentityListSchema = z.array(OpaqueIdSchema).max(128).refine(
  (items) => new Set(items).size === items.length,
  "식별자 목록에 중복을 포함할 수 없습니다."
);
const TextListSchema = z.array(z.string().trim().min(1).max(600)).max(128);

export const ProductionTaskSchema = z.object({
  id: OpaqueIdSchema,
  title: ShortTextSchema,
  owner: z.string().trim().max(240),
  due: DateSchema,
  progress: z.number().finite().min(0).max(100),
  status: ProductionTaskStatusSchema,
  stage: ProductionStageSchema,
  priority: ProductionPrioritySchema,
  role: ProductionRoleSchema.nullable(),
  hierarchyNodeId: OpaqueIdSchema.nullable(),
  dependencyIds: IdentityListSchema,
  assigneeIds: IdentityListSchema,
  reviewerIds: IdentityListSchema,
  blockedReason: OptionalTextSchema,
}).strict().superRefine((task, context) => {
  if (task.dependencyIds.includes(task.id)) {
    context.addIssue({ code: "custom", path: ["dependencyIds"], message: "작업은 자신에게 의존할 수 없습니다." });
  }
});

export const ProductionReviewIssueSchema = z.object({
  id: OpaqueIdSchema,
  title: ShortTextSchema,
  assignee: z.string().trim().max(240),
  severity: ProductionReviewSeveritySchema,
  status: ProductionReviewStatusSchema,
  hierarchyNodeId: OpaqueIdSchema.nullable(),
  pageId: OpaqueIdSchema.nullable(),
  requestedByRole: ProductionRoleSchema.nullable(),
  approvalRequired: z.boolean(),
}).strict();

export const ProductionHierarchyNodeSchema = z.object({
  id: OpaqueIdSchema,
  kind: ProductionHierarchyKindSchema,
  parentId: OpaqueIdSchema.nullable(),
  title: ShortTextSchema,
  order: z.number().int().min(0).max(2_000),
  pageId: OpaqueIdSchema.nullable(),
}).strict().superRefine((node, context) => {
  if ((node.kind === "page") !== (node.pageId !== null)) {
    context.addIssue({
      code: "custom",
      path: ["pageId"],
      message: "page 노드만 안정적인 페이지 식별자를 가져야 합니다.",
    });
  }
  if (node.parentId === node.id) {
    context.addIssue({ code: "custom", path: ["parentId"], message: "노드는 자신을 부모로 가질 수 없습니다." });
  }
});

export const ProductionRoleAssignmentSchema = z.object({
  id: OpaqueIdSchema,
  memberId: OpaqueIdSchema.nullable(),
  displayName: z.string().trim().min(1).max(240),
  roles: z.array(ProductionRoleSchema).min(1).max(9).refine(
    (roles) => new Set(roles).size === roles.length,
    "제작 역할을 중복 지정할 수 없습니다."
  ),
  hierarchyNodeId: OpaqueIdSchema.nullable(),
}).strict();

export const ProductionHandoffBriefSchema = z.object({
  id: OpaqueIdSchema,
  hierarchyNodeId: OpaqueIdSchema,
  fromRole: ProductionRoleSchema,
  toRole: ProductionRoleSchema,
  status: ProductionHandoffStatusSchema,
  scenePurpose: OptionalTextSchema,
  emotionalBeat: OptionalTextSchema,
  mustShow: TextListSchema,
  continuityNotes: TextListSchema,
  lockedFields: z.array(ProductionAuthorityFieldSchema).max(6).refine(
    (fields) => new Set(fields).size === fields.length,
    "변경 금지 항목을 중복 지정할 수 없습니다."
  ),
  acceptanceCriteria: TextListSchema,
  createdBy: z.string().trim().max(240),
  assignedTo: z.string().trim().max(240),
  updatedAt: DateTimeSchema,
}).strict().superRefine((handoff, context) => {
  if (handoff.fromRole === handoff.toRole) {
    context.addIssue({ code: "custom", path: ["toRole"], message: "같은 역할 사이에는 인계가 필요하지 않습니다." });
  }
});

export const ProductionPitchSlideSchema = z.object({
  id: OpaqueIdSchema,
  title: ShortTextSchema,
  body: z.string().trim().max(4_000),
}).strict();

export const ProductionVersionSnapshotSchema = z.object({
  id: OpaqueIdSchema,
  name: ShortTextSchema,
  createdAt: DateTimeSchema,
  tasks: z.array(ProductionTaskSchema).max(1_000),
  reviews: z.array(ProductionReviewIssueSchema).max(1_000),
  hierarchy: z.array(ProductionHierarchyNodeSchema).max(2_000),
  roleAssignments: z.array(ProductionRoleAssignmentSchema).max(500),
  handoffs: z.array(ProductionHandoffBriefSchema).max(1_000),
}).strict();

function uniqueIds(items: readonly { id: string }[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}
export const StudioProductionWorkspaceDocumentSchema = z.object({
  schemaVersion: z.literal(3),
  revision: z.number().int().min(0).max(2_147_483_647),
  scopeKey: z.string().min(6).max(170).regex(/^work:[^\\\u0000-\u001f\u007f]+$/u),
  title: ShortTextSchema,
  updatedAt: DateTimeSchema,
  tasks: z.array(ProductionTaskSchema).max(1_000),
  reviews: z.array(ProductionReviewIssueSchema).max(1_000),
  hierarchy: z.array(ProductionHierarchyNodeSchema).max(2_000),
  roleAssignments: z.array(ProductionRoleAssignmentSchema).max(500),
  handoffs: z.array(ProductionHandoffBriefSchema).max(1_000),
  versions: z.array(ProductionVersionSnapshotSchema).max(200),
  slides: z.array(ProductionPitchSlideSchema).max(200),
  members: z.array(z.string().trim().min(1).max(240)).max(200),
  inviteToken: z.null(),
}).strict().superRefine((workspace, context) => {
  const groups = [
    ["tasks", workspace.tasks],
    ["reviews", workspace.reviews],
    ["hierarchy", workspace.hierarchy],
    ["roleAssignments", workspace.roleAssignments],
    ["handoffs", workspace.handoffs],
    ["versions", workspace.versions],
    ["slides", workspace.slides],
  ] as const;
  for (const [path, items] of groups) {
    if (!uniqueIds(items)) {
      context.addIssue({ code: "custom", path: [path], message: "항목 식별자는 중복될 수 없습니다." });
    }
  }
  const hierarchyById = new Map(workspace.hierarchy.map((node) => [node.id, node] as const));
  const taskIds = new Set(workspace.tasks.map((task) => task.id));
  const pageIds = new Set<string>();
  for (const node of workspace.hierarchy) {
    if (node.parentId !== null && !hierarchyById.has(node.parentId)) {
      context.addIssue({ code: "custom", path: ["hierarchy"], message: "계층 부모 노드를 찾을 수 없습니다." });
    }
    if (node.pageId !== null) {
      if (pageIds.has(node.pageId)) {
        context.addIssue({ code: "custom", path: ["hierarchy"], message: "페이지는 계층에 한 번만 연결할 수 있습니다." });
      }
      pageIds.add(node.pageId);
    }
    const visited = new Set<string>([node.id]);
    let cursor = node.parentId;
    while (cursor !== null) {
      if (visited.has(cursor)) {
        context.addIssue({ code: "custom", path: ["hierarchy"], message: "제작 계층에 순환 참조가 있습니다." });
        break;
      }
      visited.add(cursor);
      cursor = hierarchyById.get(cursor)?.parentId ?? null;
    }
  }
  for (const task of workspace.tasks) {
    if (task.hierarchyNodeId !== null && !hierarchyById.has(task.hierarchyNodeId)) {
      context.addIssue({ code: "custom", path: ["tasks"], message: "작업의 제작 범위를 찾을 수 없습니다." });
    }
    if (task.dependencyIds.some((id) => !taskIds.has(id))) {
      context.addIssue({ code: "custom", path: ["tasks"], message: "작업 의존 대상을 찾을 수 없습니다." });
    }
  }
  for (const review of workspace.reviews) {
    if (review.hierarchyNodeId !== null && !hierarchyById.has(review.hierarchyNodeId)) {
      context.addIssue({ code: "custom", path: ["reviews"], message: "검수 항목의 제작 범위를 찾을 수 없습니다." });
    }
  }
  for (const assignment of workspace.roleAssignments) {
    if (assignment.hierarchyNodeId !== null && !hierarchyById.has(assignment.hierarchyNodeId)) {
      context.addIssue({ code: "custom", path: ["roleAssignments"], message: "역할의 제작 범위를 찾을 수 없습니다." });
    }
  }
  for (const handoff of workspace.handoffs) {
    if (!hierarchyById.has(handoff.hierarchyNodeId)) {
      context.addIssue({ code: "custom", path: ["handoffs"], message: "인계 대상 장면을 찾을 수 없습니다." });
    }
  }
  const serialized = JSON.stringify(workspace);
  if (serialized.length > 2_000_000) {
    context.addIssue({ code: "custom", message: "제작 운영 문서가 크기 제한을 초과했습니다." });
  }
});

export const StudioProductionWorkParamsSchema = z.object({ id: WorkIdSchema }).strict();
export const UpdateStudioProductionWorkspaceSchema = z.object({
  baseRevision: z.number().int().min(0).max(2_147_483_647),
  document: StudioProductionWorkspaceDocumentSchema,
}).strict();

const PersonalKitMapSchema = z.record(
  z.string().min(1).max(80),
  z.union([z.string().max(240), z.number().finite(), z.boolean(), z.null()])
);
const PersonalKitObjectSchema = z.record(z.string().min(1).max(80), z.unknown());
const FORBIDDEN_PERSONAL_KIT_KEYS = [
  "apikey", "secret", "password", "credential", "authorization",
  "clipboard", "rawprompt", "rawstroke", "documentsnapshot", "privatekey",
] as const;

function inspectPersonalKitValue(value: unknown): { safe: boolean; entries: number } {
  let entries = 0;
  const visit = (current: unknown, depth: number): boolean => {
    if (depth > 8 || entries > 5_000) return false;
    if (Array.isArray(current)) {
      entries += current.length;
      return current.length <= 1_000 && current.every((item) => visit(item, depth + 1));
    }
    if (current && typeof current === "object") {
      const pairs = Object.entries(current as Record<string, unknown>);
      entries += pairs.length;
      if (pairs.length > 500) return false;
      return pairs.every(([key, nested]) => {
        const normalized = key.toLowerCase().replace(/[^a-z0-9]/gu, "");
        return !FORBIDDEN_PERSONAL_KIT_KEYS.some((forbidden) => normalized.includes(forbidden))
          && visit(nested, depth + 1);
      });
    }
    return current === null
      || typeof current === "string"
      || typeof current === "boolean"
      || (typeof current === "number" && Number.isFinite(current));
  };
  return { safe: visit(value, 0), entries };
}

export const StudioPersonalKitDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: DateTimeSchema,
  workspaceProfiles: z.array(PersonalKitObjectSchema).max(20),
  quickAccess: PersonalKitObjectSchema,
  gestureMap: PersonalKitMapSchema,
  penButtonMap: PersonalKitMapSchema,
  touchPolicy: z.enum(["pen-draw-touch-pan", "pen-only", "touch-draw", "mouse-keyboard"]),
  favoriteRefs: z.array(z.string().trim().min(1).max(240)).max(2_000).refine(
    (items) => new Set(items).size === items.length,
    "즐겨찾기 참조를 중복 저장할 수 없습니다."
  ),
}).strict().superRefine((document, context) => {
  const inspection = inspectPersonalKitValue(document);
  if (!inspection.safe) {
    context.addIssue({
      code: "custom",
      message: "Personal Kit에는 비밀정보·원고·클립보드 또는 과도하게 깊은 데이터를 저장할 수 없습니다.",
    });
  }
  if (JSON.stringify(document).length > 512_000) {
    context.addIssue({ code: "custom", message: "Personal Kit가 크기 제한을 초과했습니다." });
  }
});

export const UpdateStudioPersonalKitSchema = z.object({
  baseRevision: z.number().int().min(0).max(2_147_483_647),
  document: StudioPersonalKitDocumentSchema,
}).strict();

export const StudioReviewLinkRoleSchema = z.enum(["viewer", "commenter"]);
export const CreateStudioReviewLinkSchema = z.object({
  role: StudioReviewLinkRoleSchema,
  pageIds: z.array(OpaqueIdSchema).max(500).refine(
    (items) => new Set(items).size === items.length,
    "검토 페이지를 중복 지정할 수 없습니다."
  ),
  watermark: z.boolean(),
  allowDownload: z.boolean(),
  expiresInHours: z.number().int().min(1).max(24 * 30),
}).strict();

export const StudioReviewLinkParamsSchema = z.object({
  id: WorkIdSchema,
  linkId: OpaqueIdSchema,
}).strict();
export const StudioReviewTokenParamsSchema = z.object({
  token: z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/u),
}).strict();
export const StudioReviewFeedbackAnchorSchema = z.object({
  pageId: OpaqueIdSchema,
  x: z.number().finite().min(0).max(1).optional(),
  y: z.number().finite().min(0).max(1).optional(),
}).strict().superRefine((anchor, context) => {
  if ((anchor.x === undefined) !== (anchor.y === undefined)) {
    context.addIssue({ code: "custom", message: "좌표는 x와 y를 함께 입력해야 합니다." });
  }
});
export const CreateStudioReviewFeedbackSchema = z.object({
  kind: z.enum(["comment", "approve", "reject"]),
  reviewerName: z.string().trim().min(1).max(120),
  anchor: StudioReviewFeedbackAnchorSchema.nullable().default(null),
  body: z.string().trim().max(4_000),
}).strict().superRefine((feedback, context) => {
  if (feedback.kind !== "approve" && feedback.body.length === 0) {
    context.addIssue({ code: "custom", path: ["body"], message: "댓글 또는 반려 사유를 입력해 주세요." });
  }
});

export class StudioProductionWorkParamsDto extends createZodDto(
  StudioProductionWorkParamsSchema
) {}
export class UpdateStudioProductionWorkspaceDto extends createZodDto(
  UpdateStudioProductionWorkspaceSchema
) {}
export class UpdateStudioPersonalKitDto extends createZodDto(
  UpdateStudioPersonalKitSchema
) {}
export class CreateStudioReviewLinkDto extends createZodDto(
  CreateStudioReviewLinkSchema
) {}
export class StudioReviewLinkParamsDto extends createZodDto(
  StudioReviewLinkParamsSchema
) {}
export class StudioReviewTokenParamsDto extends createZodDto(
  StudioReviewTokenParamsSchema
) {}
export class CreateStudioReviewFeedbackDto extends createZodDto(
  CreateStudioReviewFeedbackSchema
) {}

export type StudioProductionWorkspaceDocument = z.infer<
  typeof StudioProductionWorkspaceDocumentSchema
>;
export type StudioPersonalKitDocument = z.infer<typeof StudioPersonalKitDocumentSchema>;
export type CreateStudioReviewLinkInput = z.infer<typeof CreateStudioReviewLinkSchema>;
export type StudioReviewFeedbackInput = z.infer<typeof CreateStudioReviewFeedbackSchema>;
export type StudioReviewLinkRole = z.infer<typeof StudioReviewLinkRoleSchema>;
