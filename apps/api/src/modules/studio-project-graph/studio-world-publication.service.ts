import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { StudioWorldPublish } from "@toonspectrum/studio-project-model/world-publication";
import { StudioIdempotencyConflictError, StudioProjectForbiddenError, StudioProjectNotFoundError, StudioRepositoryInvariantError } from "./studio-project-graph.repository";
import { StudioWorldPublicationConflictError, StudioWorldPublicationRepository } from "./studio-world-publication.repository";

@Injectable()
export class StudioWorldPublicationService {
  constructor(@Inject(StudioWorldPublicationRepository) private readonly repository: StudioWorldPublicationRepository) {}
  private async execute<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); }
    catch (error) {
      if (error instanceof StudioProjectNotFoundError) throw new NotFoundException({ code: error.message, target: error.target });
      if (error instanceof StudioProjectForbiddenError) throw new ForbiddenException({ code: error.message, operation: error.operation });
      if (error instanceof StudioWorldPublicationConflictError) throw new ConflictException({ code: error.message, currentPublishedRevisionId: error.currentPublishedRevisionId });
      if (error instanceof StudioIdempotencyConflictError) throw new ConflictException({ code: error.message });
      if (error instanceof StudioRepositoryInvariantError) throw new UnprocessableEntityException({ code: "studio_invariant_violation", causeCode: error.causeCode });
      throw error;
    }
  }
  current(actor: string, workId: string) { return this.execute(async () => ({ publication: await this.repository.current(actor, workId) })); }
  publish(actor: string, workId: string, input: StudioWorldPublish, idempotencyKey: string) {
    return this.execute(() => this.repository.publish(actor, workId, input, idempotencyKey));
  }
}
