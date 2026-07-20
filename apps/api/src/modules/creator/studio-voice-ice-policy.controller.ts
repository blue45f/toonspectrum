import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Param,
} from "@nestjs/common";

import { ZodValidationPipe } from "../../common/zod-validation.pipe";

import { CreatorTeamWorkParamsDto } from "./creator.dto";
import { StudioVoiceIcePolicyService } from "./studio-voice-ice-policy.service";

function authenticatedUserId(userId: string | undefined): string {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

@Controller()
export class StudioVoiceIcePolicyController {
  constructor(
    @Inject(StudioVoiceIcePolicyService)
    private readonly service: StudioVoiceIcePolicyService
  ) {}

  @Get("/creator/works/:id/voice/ice")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async issue(
    @Param(new ZodValidationPipe(CreatorTeamWorkParamsDto))
    params: CreatorTeamWorkParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.service.issue(authenticatedUserId(userId), params.id);
  }

  @Get("/creator/works/:id/screen-share/ice")
  @Header("Cache-Control", "private, no-store, max-age=0")
  async issueScreenShare(
    @Param(new ZodValidationPipe(CreatorTeamWorkParamsDto))
    params: CreatorTeamWorkParamsDto,
    @Headers("x-user-id") userId?: string
  ) {
    return this.service.issueScreenShare(authenticatedUserId(userId), params.id);
  }
}
