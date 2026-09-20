import { Body, Controller, Get, Header, Headers, Inject, Optional, Param, Post, Query } from "@nestjs/common";

import { collaborationWriteGate } from "../collaboration/collaboration.controller";
import { requireCollaborationUser } from "../collaboration/collaboration.service";
import { hiringId, parseHiring } from "../collaboration/hiring.validation";

import { CareerConfirmationRepository } from "./career-confirmation.repository";
import { confirmationActionSchema, confirmationCollaboratorsSchema, confirmationListSchema, confirmationPreviewSchema, confirmationPublicSchema, confirmationRequestSchema } from "./career-confirmation.validation";

// sessionAuth replaces x-user-id with its verified session principal before routing.
// POST continues through the application's existing CSRF middleware.
@Controller("/collaborations/career-confirmations")
export class CareerConfirmationController {
  constructor(@Optional() @Inject(CareerConfirmationRepository) private readonly repository = new CareerConfirmationRepository()) {}
  @Get("/capability") @Header("Cache-Control", "private, no-store, max-age=0")
  capability(@Headers("x-user-id") actor?: string) { return this.repository.capability(requireCollaborationUser(actor)); }
  @Get("/collaborators") @Header("Cache-Control", "private, no-store, max-age=0")
  collaborators(@Query() query: unknown, @Headers("x-user-id") actor?: string) {
    const input = parseHiring(confirmationCollaboratorsSchema, query);
    return this.repository.collaborators(requireCollaborationUser(actor), input.after);
  }
  @Post("/preview") @Header("Cache-Control", "private, no-store, max-age=0")
  preview(@Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.repository.preview(requireCollaborationUser(actor), parseHiring(confirmationPreviewSchema, body)); }
  @Post("/requests") @Header("Cache-Control", "private, no-store, max-age=0")
  request(@Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.repository.request(collaborationWriteGate(actor, "career-confirmation-request", 30), parseHiring(confirmationRequestSchema, body)); }
  @Get("/requests") @Header("Cache-Control", "private, no-store, max-age=0")
  list(@Query() query: unknown, @Headers("x-user-id") actor?: string) {
    const input = parseHiring(confirmationListSchema, query);
    return this.repository.list(requireCollaborationUser(actor), input.direction, input.after);
  }
  @Post("/requests/:id/actions") @Header("Cache-Control", "private, no-store, max-age=0")
  action(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") actor?: string) { return this.repository.action(collaborationWriteGate(actor, "career-confirmation-action"), parseHiring(hiringId, id), parseHiring(confirmationActionSchema, body)); }
  @Post("/public-summaries") @Header("Cache-Control", "no-store, max-age=0")
  publicSummaries(@Body() body: unknown) { return this.repository.publicSummaries(parseHiring(confirmationPublicSchema, body).careerIds); }
}
