import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import { canonicalJson, type StudioAcousticDoorChange, type StudioAcousticSessionLease, type StudioAcousticSessionOpen, type StudioAcousticSessionRenew } from "@toonspectrum/studio-project-model";
import type { VerifiedSessionToken } from "../../server/session";
import { StudioLiveAcousticBinding } from "../creator/studio-live-acoustic-binding";
import { StudioIdempotencyConflictError, StudioProjectForbiddenError, StudioProjectNotFoundError, StudioRepositoryInvariantError } from "./studio-project-graph.repository";
import { StudioAcousticAuthorityError, StudioWorldAcousticRepository } from "./studio-world-acoustic.repository";

@Injectable()
export class StudioWorldAcousticService {
  constructor(@Inject(StudioWorldAcousticRepository) private readonly repository: StudioWorldAcousticRepository,
    @Inject(StudioLiveAcousticBinding) private readonly bindings: StudioLiveAcousticBinding) {}
  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); } catch (error) {
      if (error instanceof StudioProjectNotFoundError) throw new NotFoundException({code:error.message});
      if (error instanceof StudioProjectForbiddenError) throw new ForbiddenException({code:error.message});
      if (error instanceof StudioIdempotencyConflictError) throw new ConflictException({code:error.message});
      if (error instanceof StudioRepositoryInvariantError) throw new UnprocessableEntityException({code:error.message,causeCode:error.causeCode});
      if (error instanceof StudioAcousticAuthorityError) {
        if (error.reason === "binding") throw new ServiceUnavailableException({code:error.message});
        if (error.reason === "closed" || error.reason === "session") throw new ForbiddenException({code:error.message});
        if (error.reason === "proof") throw new UnprocessableEntityException({code:error.message});
        throw new ConflictException({code:error.message});
      } throw error;
    }
  }
  door(principal: VerifiedSessionToken, workId: string, zoneId: string) { return this.execute(()=>this.repository.door(principal,workId,zoneId)); }
  changeDoor(principal: VerifiedSessionToken, workId: string, input: StudioAcousticDoorChange, key: string) { return this.execute(()=>this.repository.changeDoor(principal,workId,input,key)); }
  private async finish(principal: VerifiedSessionToken, workId: string, lease: StudioAcousticSessionLease) {
    // No adapter/RPC await occurs inside a work/lease database transaction.
    const current = await this.bindings.verify(principal,workId,lease.binding);
    if (!current || canonicalJson(current)!==canonicalJson(lease.binding)) {
      await this.repository.revoke(principal.userId,workId,lease.sessionEpoch);
      throw new StudioAcousticAuthorityError("binding");
    }
    // Door close, world publication or ACL revocation may win while the RPC is pending.
    return this.repository.current(principal,workId,lease.sessionEpoch);
  }
  open(principal: VerifiedSessionToken, workId: string, input: StudioAcousticSessionOpen, key: string) {
    return this.execute(async()=>{
      const binding=await this.bindings.verify(principal,workId,input); if (!binding) throw new StudioAcousticAuthorityError("binding");
      return this.finish(principal,workId,await this.repository.open(principal,workId,input,binding,key));
    });
  }
  current(principal: VerifiedSessionToken,workId:string,sessionEpoch:string) {
    return this.execute(async()=>this.finish(principal,workId,await this.repository.current(principal,workId,sessionEpoch)));
  }
  renew(principal: VerifiedSessionToken,workId:string,input:StudioAcousticSessionRenew) {
    return this.execute(async()=>{
      const previous=await this.repository.current(principal,workId,input.sessionEpoch);
      const binding=await this.bindings.verify(principal,workId,previous.binding);
      if (!binding || canonicalJson(binding)!==canonicalJson(previous.binding)) {
        await this.repository.revoke(principal.userId,workId,previous.sessionEpoch); throw new StudioAcousticAuthorityError("binding");
      }
      return this.finish(principal,workId,await this.repository.current(principal,workId,input.sessionEpoch,input.expectedLeaseRevision));
    });
  }
  revoke(principal:VerifiedSessionToken,workId:string,epoch:string) { return this.execute(async()=>{await this.repository.revoke(principal.userId,workId,epoch);return {closed:true as const};}); }
}
