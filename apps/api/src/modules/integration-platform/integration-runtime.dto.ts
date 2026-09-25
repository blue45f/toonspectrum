import { z } from "zod";

const ProjectIdSchema = z.string().trim().min(1).max(120);
const MutationIdSchema = z.string().uuid();
const ExternalIdSchema = z.string().trim().min(1).max(240);
const ShortTextSchema = z.string().trim().min(1).max(240);
const BodyTextSchema = z.string().trim().max(10_000).default("");
const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const OptionalHttpUrlSchema = z.string().url().max(2_048).refine((value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "Only HTTPS links are allowed.").optional();

const NotionActionSchema = z.object({
  providerId: z.literal("notion"),
  action: z.literal("task.upsert"),
  input: z.object({
    dataSourceId: ExternalIdSchema,
    pageId: ExternalIdSchema.optional(),
    title: ShortTextSchema,
    description: BodyTextSchema,
    descriptionProperty: z.string().trim().min(1).max(120).default("Description"),
    titleProperty: z.string().trim().min(1).max(120).default("Name"),
    status: z.string().trim().min(1).max(120).optional(),
    statusProperty: z.string().trim().min(1).max(120).default("Status"),
    dueDate: LocalDateSchema.optional(),
    dueProperty: z.string().trim().min(1).max(120).default("Due"),
  }).strict(),
}).strict();

const LinearActionSchema = z.object({
  providerId: z.literal("linear"),
  action: z.literal("task.upsert"),
  input: z.object({
    teamId: ExternalIdSchema,
    issueId: ExternalIdSchema.optional(),
    title: ShortTextSchema,
    description: BodyTextSchema,
    stateId: ExternalIdSchema.optional(),
    assigneeId: ExternalIdSchema.optional(),
    dueDate: LocalDateSchema.optional(),
  }).strict(),
}).strict();

const JiraActionSchema = z.object({
  providerId: z.literal("jira"),
  action: z.literal("task.upsert"),
  input: z.object({
    projectKey: z.string().trim().min(1).max(32).regex(/^[A-Z][A-Z0-9_]*$/u),
    issueKey: z.string().trim().min(1).max(64).regex(/^[A-Z][A-Z0-9_]*-\d+$/u).optional(),
    issueType: z.string().trim().min(1).max(80).default("Task"),
    title: ShortTextSchema,
    description: BodyTextSchema,
    dueDate: LocalDateSchema.optional(),
    assigneeAccountId: ExternalIdSchema.optional(),
  }).strict(),
}).strict();

const TrelloActionSchema = z.object({
  providerId: z.literal("trello"),
  action: z.literal("task.upsert"),
  input: z.object({
    listId: ExternalIdSchema,
    cardId: ExternalIdSchema.optional(),
    title: ShortTextSchema,
    description: BodyTextSchema,
    dueAt: z.string().datetime({ offset: true }).optional(),
  }).strict(),
}).strict();

const MessageInputSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  text: z.string().trim().min(1).max(4_000),
  url: OptionalHttpUrlSchema,
  severity: z.enum(["info", "success", "warning", "critical"]).default("info"),
}).strict();

const SlackActionSchema = z.object({
  providerId: z.literal("slack"),
  action: z.literal("message.send"),
  input: MessageInputSchema,
}).strict();

const TeamsActionSchema = z.object({
  providerId: z.literal("microsoft-teams"),
  action: z.literal("message.send"),
  input: MessageInputSchema,
}).strict();

const FigmaActionSchema = z.object({
  providerId: z.literal("figma"),
  action: z.literal("design.inspect"),
  input: z.object({
    fileKey: z.string().trim().min(8).max(240).regex(/^[A-Za-z0-9_-]+$/u),
    nodeIds: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    includeImages: z.boolean().default(false),
  }).strict(),
}).strict();

const ZoomActionSchema = z.object({
  providerId: z.literal("zoom"),
  action: z.literal("meeting.create"),
  input: z.object({
    userId: z.string().trim().min(1).max(240).default("me"),
    topic: ShortTextSchema,
    startTime: z.string().datetime({ offset: true }),
    durationMinutes: z.number().int().min(5).max(1_440),
    timezone: z.string().trim().min(1).max(80).default("Asia/Seoul"),
    agenda: z.string().trim().max(2_000).default(""),
    waitingRoom: z.boolean().default(true),
  }).strict(),
}).strict();

const NaverDataLabActionSchema = z.object({
  providerId: z.literal("naver-datalab"),
  action: z.literal("trends.read"),
  input: z.object({
    startDate: LocalDateSchema,
    endDate: LocalDateSchema,
    timeUnit: z.enum(["date", "week", "month"]),
    keywordGroups: z.array(z.object({
      groupName: z.string().trim().min(1).max(100),
      keywords: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
    }).strict()).min(1).max(5),
    device: z.enum(["pc", "mo"]).optional(),
    gender: z.enum(["m", "f"]).optional(),
    ages: z.array(z.enum(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"])).max(11).optional(),
  }).strict(),
}).strict();

const WikidataActionSchema = z.object({
  providerId: z.literal("wikidata"),
  action: z.literal("trends.read"),
  input: z.object({
    query: z.string().trim().min(1).max(240),
    language: z.string().trim().min(2).max(12).regex(/^[A-Za-z-]+$/u).default("ko"),
    limit: z.number().int().min(1).max(20).default(10),
  }).strict(),
}).strict();

const GoogleBooksActionSchema = z.object({
  providerId: z.literal("google-books"),
  action: z.literal("trends.read"),
  input: z.object({
    query: z.string().trim().min(1).max(240),
    language: z.string().trim().min(2).max(12).regex(/^[A-Za-z-]+$/u).optional(),
    maxResults: z.number().int().min(1).max(20).default(10),
  }).strict(),
}).strict();

export const IntegrationRuntimeActionSchema = z.discriminatedUnion("providerId", [
  NotionActionSchema,
  LinearActionSchema,
  JiraActionSchema,
  TrelloActionSchema,
  SlackActionSchema,
  TeamsActionSchema,
  FigmaActionSchema,
  ZoomActionSchema,
  NaverDataLabActionSchema,
  WikidataActionSchema,
  GoogleBooksActionSchema,
]);
export type IntegrationRuntimeActionDto = z.infer<typeof IntegrationRuntimeActionSchema>;

export const IntegrationRuntimeExecuteSchema = z.object({
  projectId: ProjectIdSchema,
  mutationId: MutationIdSchema,
  dryRun: z.boolean().default(true),
  confirm: z.boolean().default(false),
  request: IntegrationRuntimeActionSchema,
}).strict().superRefine((value, context) => {
  if (!value.dryRun && !value.confirm) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirm"],
      message: "Live external execution requires explicit confirmation.",
    });
  }
});
export type IntegrationRuntimeExecuteDto = z.infer<typeof IntegrationRuntimeExecuteSchema>;

export const IntegrationRuntimeReceiptQuerySchema = z.object({
  projectId: ProjectIdSchema,
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict();
export type IntegrationRuntimeReceiptQueryDto = z.infer<typeof IntegrationRuntimeReceiptQuerySchema>;
