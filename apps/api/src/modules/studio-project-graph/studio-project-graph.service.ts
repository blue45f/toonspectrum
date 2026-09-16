import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
  UnprocessableEntityException,
} from "@nestjs/common";

import type {
  CommitStudioRevision,
  CreateCompatibilityReport,
  CreateStudioExternalFileBinding,
  CreateStudioProjectGraph,
  CreateStudioReview,
  CreateStudioReviewComment,
  RegisterStudioBlob,
  UpdateStudioExternalFileBinding,
} from "./studio-project-graph.dto";
import { StudioExternalFileBindingRepository } from "./studio-external-file-binding.repository";
import {
  StudioBlobMetadataConflictError,
  StudioBlobNotReadyError,
  StudioCompatibilityApprovalRequiredError,
  StudioIdempotencyConflictError,
  StudioProjectForbiddenError,
  StudioProjectGraphRepository,
  StudioProjectIdentityConflictError,
  StudioProjectNotFoundError,
  StudioRepositoryInvariantError,
  StudioRevisionConflictError,
} from "./studio-project-graph.repository";

@Injectable()
export class StudioProjectGraphService {
  constructor(
    private readonly repository: StudioProjectGraphRepository,
    private readonly externalBindings: StudioExternalFileBindingRepository,
  ) {}

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (error instanceof StudioProjectNotFoundError) {
      throw new NotFoundException({
        code: error.message,
        target: error.target,
      });
    }
    if (error instanceof StudioProjectForbiddenError) {
      throw new ForbiddenException({
        code: error.message,
        operation: error.operation,
      });
    }
    if (error instanceof StudioRevisionConflictError) {
      throw new ConflictException({
        code: error.message,
        currentRevisionId: error.currentRevisionId,
      });
    }
    if (error instanceof StudioIdempotencyConflictError) {
      throw new ConflictException({ code: error.message });
    }
    if (error instanceof StudioProjectIdentityConflictError) {
      throw new ConflictException({
        code: error.message,
        conflict: error.code,
      });
    }
    if (error instanceof StudioBlobMetadataConflictError) {
      throw new ConflictException({
        code: error.message,
        hash: error.hash,
      });
    }
    if (error instanceof StudioBlobNotReadyError) {
      throw new PreconditionFailedException({
        code: error.message,
        hashes: error.hashes,
      });
    }
    if (error instanceof StudioCompatibilityApprovalRequiredError) {
      throw new PreconditionFailedException({
        code: error.message,
        reportId: error.reportId,
      });
    }
    if (error instanceof StudioRepositoryInvariantError) {
      throw new UnprocessableEntityException({
        code: "studio_invariant_violation",
        causeCode: error.causeCode,
      });
    }
    throw error;
  }

  createProject(
    actorUserId: string,
    input: CreateStudioProjectGraph,
    idempotencyKey: string,
  ) {
    return this.execute(() =>
      this.repository.createProject(actorUserId, input, idempotencyKey));
  }

  getProject(actorUserId: string, projectId: string) {
    return this.execute(() => this.repository.getProject(actorUserId, projectId));
  }

  getProjectByWork(actorUserId: string, workId: string) {
    return this.execute(() => this.repository.getProjectByWork(actorUserId, workId));
  }

  listRevisions(actorUserId: string, artifactId: string) {
    return this.execute(() => this.repository.listRevisions(actorUserId, artifactId));
  }

  registerBlob(
    actorUserId: string,
    projectId: string,
    input: RegisterStudioBlob,
  ) {
    return this.execute(() => this.repository.registerBlob(actorUserId, projectId, input));
  }

  commitRevision(
    actorUserId: string,
    artifactId: string,
    expectedHeadRevisionId: string,
    idempotencyKey: string,
    input: CommitStudioRevision,
  ) {
    return this.execute(() =>
      this.repository.commitRevision(
        actorUserId,
        artifactId,
        expectedHeadRevisionId,
        idempotencyKey,
        input,
      ));
  }

  createReview(
    actorUserId: string,
    artifactId: string,
    input: CreateStudioReview,
  ) {
    return this.execute(() => this.repository.createReview(actorUserId, artifactId, input));
  }

  createReviewComment(
    actorUserId: string,
    reviewId: string,
    input: CreateStudioReviewComment,
  ) {
    return this.execute(() => this.repository.createReviewComment(actorUserId, reviewId, input));
  }

  createCompatibilityReport(
    actorUserId: string,
    projectId: string,
    input: CreateCompatibilityReport,
  ) {
    return this.execute(() =>
      this.repository.createCompatibilityReport(actorUserId, projectId, input));
  }

  listExternalFileBindings(actorUserId: string, artifactId: string) {
    return this.execute(() => this.externalBindings.list(actorUserId, artifactId));
  }

  createExternalFileBinding(
    actorUserId: string,
    artifactId: string,
    input: CreateStudioExternalFileBinding,
  ) {
    return this.execute(() => this.externalBindings.create(actorUserId, artifactId, input));
  }

  updateExternalFileBinding(
    actorUserId: string,
    bindingId: string,
    input: UpdateStudioExternalFileBinding,
  ) {
    return this.execute(() => this.externalBindings.update(actorUserId, bindingId, input));
  }

  removeExternalFileBinding(actorUserId: string, bindingId: string) {
    return this.execute(() => this.externalBindings.remove(actorUserId, bindingId));
  }

  approveCompatibilityReport(actorUserId: string, reportId: string) {
    return this.execute(() =>
      this.repository.approveCompatibilityReport(actorUserId, reportId));
  }
}
