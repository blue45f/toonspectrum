import { createZodDto } from "nestjs-zod";

import {
  StudioRemoteReferenceImageRequestSchema,
  StudioRemoteReferenceImageResponseSchema,
} from "../../../../../lib/studio-remote-reference-image-contract";

export class StudioRemoteReferenceImageRequestDto extends createZodDto(
  StudioRemoteReferenceImageRequestSchema
) {}

export class StudioRemoteReferenceImageResponseDto extends createZodDto(
  StudioRemoteReferenceImageResponseSchema
) {}
