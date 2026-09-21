import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const identity = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const mutation = { mutationId: z.string().uuid() };
const versioned = { ...mutation, expectedRevision: z.number().int().nonnegative().max(2_147_483_646) };
const role = z.enum(["admin", "member", "guest"]);
export const WorkspaceCreateSchema = z.object({ ...mutation, name: z.string().trim().min(1).max(20) }).strict();
export const WorkspaceCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...versioned, type: z.literal("rename"), name: z.string().trim().min(1).max(20) }).strict(),
  z.object({ ...versioned, type: z.literal("invite"), email: z.string().trim().toLowerCase().email().max(320), role }).strict(),
  z.object({ ...versioned, type: z.literal("revoke-invite"), invitationId: identity }).strict(),
  z.object({ ...versioned, type: z.literal("change-member-role"), userId: identity, role }).strict(),
  z.object({ ...versioned, type: z.literal("remove-member"), userId: identity }).strict(),
  z.object({ ...versioned, type: z.literal("transfer-owner"), userId: identity }).strict(),
  z.object({ ...versioned, type: z.literal("attach-project"), projectId: identity }).strict(),
  z.object({ ...versioned, type: z.literal("detach-project"), projectId: identity }).strict(),
]);
export const WorkspaceParamsSchema = z.object({ workspaceId: identity }).strict();
export const WorkspaceAcceptSchema = z.object({
  ...mutation, token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
}).strict();
export class CreateTeamWorkspaceDto extends createZodDto(WorkspaceCreateSchema) {}
export class TeamWorkspaceParamsDto extends createZodDto(WorkspaceParamsSchema) {}
export class AcceptTeamWorkspaceDto extends createZodDto(WorkspaceAcceptSchema) {}
export type WorkspaceCommand = z.infer<typeof WorkspaceCommandSchema>;
