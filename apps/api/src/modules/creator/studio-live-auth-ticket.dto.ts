import { createZodDto } from "nestjs-zod";

import {
  StudioLiveAuthTicketRequestSchema,
  StudioLiveAuthTicketResponseSchema,
} from "../../../../../lib/studio-live-auth-ticket";

export class StudioLiveAuthTicketRequestDto extends createZodDto(
  StudioLiveAuthTicketRequestSchema,
) {}

export class StudioLiveAuthTicketResponseDto extends createZodDto(
  StudioLiveAuthTicketResponseSchema,
) {}
