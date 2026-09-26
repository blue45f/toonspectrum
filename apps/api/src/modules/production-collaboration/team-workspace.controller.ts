import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, Headers, Inject, Param, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { AcceptTeamWorkspaceDto, CreateTeamWorkspaceDto, TeamWorkspaceParamsDto, WorkspaceCommandSchema } from "./team-workspace.dto";
import { TeamWorkspaceRepository } from "./team-workspace.repository";

function actor(value: string | undefined): string {
  // Existing session middleware injects a verified user after removing client identity headers.
  if (!value) throw new ForbiddenException("로그인이 필요합니다.");
  return value;
}
@Controller("/production/workspaces")
export class TeamWorkspaceController {
  constructor(@Inject(TeamWorkspaceRepository) private readonly repository: TeamWorkspaceRepository) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@Headers("x-user-id") userId?: string) { return this.repository.list(actor(userId)); }
  @Post()
  @Header("Cache-Control", "private, no-store")
  create(@Body(new ZodValidationPipe(CreateTeamWorkspaceDto)) body: CreateTeamWorkspaceDto,
    @Headers("x-user-id") userId?: string) { return this.repository.create(actor(userId), body); }
  @Post("/accept-invite")
  @Header("Cache-Control", "private, no-store")
  accept(@Body(new ZodValidationPipe(AcceptTeamWorkspaceDto)) body: AcceptTeamWorkspaceDto,
    @Headers("x-user-id") userId?: string) { return this.repository.accept(actor(userId), body); }
  @Get("/:workspaceId")
  @Header("Cache-Control", "private, no-store")
  detail(@Param(new ZodValidationPipe(TeamWorkspaceParamsDto)) params: TeamWorkspaceParamsDto,
    @Headers("x-user-id") userId?: string) { return this.repository.detail(actor(userId), params.workspaceId); }
  @Get("/:workspaceId/usage")
  @Header("Cache-Control", "private, no-store")
  usage(@Param(new ZodValidationPipe(TeamWorkspaceParamsDto)) params: TeamWorkspaceParamsDto,
    @Headers("x-user-id") userId?: string) { return this.repository.usage(actor(userId), params.workspaceId); }
  @Post("/:workspaceId/commands")
  @Header("Cache-Control", "private, no-store")
  command(@Param(new ZodValidationPipe(TeamWorkspaceParamsDto)) params: TeamWorkspaceParamsDto,
    @Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const parsed = WorkspaceCommandSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("요청 형식이 올바르지 않습니다.");
    return this.repository.command(actor(userId), params.workspaceId, parsed.data);
  }
}
