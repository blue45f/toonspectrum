import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import { type StudioConversationPropose, type StudioConversationRead, type StudioConversationChange, type StudioConversationRenew } from "@toonspectrum/studio-project-model/world-conversation";
import type { VerifiedSessionToken } from "../../server/session";
import { StudioLiveAcousticBinding } from "../creator/studio-live-acoustic-binding";
import { StudioProjectForbiddenError, StudioProjectNotFoundError, StudioIdempotencyConflictError, StudioRepositoryInvariantError } from "./studio-project-graph.repository";
import { StudioAcousticAuthorityError, type StudioAcousticParticipant } from "./studio-world-acoustic.repository";
import { StudioWorldConversationRepository, type StudioConversationContext } from "./studio-world-conversation.repository";

@Injectable()
export class StudioWorldConversationService {
  constructor(@Inject(StudioWorldConversationRepository)private readonly repository:StudioWorldConversationRepository,
    @Inject(StudioLiveAcousticBinding)private readonly bindings:StudioLiveAcousticBinding){}
  private async execute<T>(action:()=>Promise<T>){try{return await action();}catch(error){
    if(error instanceof StudioProjectForbiddenError)throw new ForbiddenException({code:error.message});
    if(error instanceof StudioProjectNotFoundError)throw new NotFoundException({code:error.message});
    if(error instanceof StudioIdempotencyConflictError)throw new ConflictException({code:error.message});
    if(error instanceof StudioRepositoryInvariantError)throw new UnprocessableEntityException({code:error.message});
    if(error instanceof StudioAcousticAuthorityError){
      if(error.reason==="binding")throw new ServiceUnavailableException({code:error.message});
      if(error.reason==="proof")throw new UnprocessableEntityException({code:error.message});
      if(error.reason==="closed"||error.reason==="session")throw new ForbiddenException({code:error.message});
      throw new ConflictException({code:error.message});
    }throw error;
  }}
  private async verify(workId:string,participants:StudioAcousticParticipant[]):Promise<boolean>{
    // Every actor/version comes exclusively from the verified server descriptor. No RPC runs under a DB lock.
    const checks=await Promise.all(participants.map(async member=>{
      const binding=await this.bindings.verify({userId:member.actor,sessionVersion:member.sessionVersion,expiresAt:Date.parse(member.expiresAt)},workId,member.binding);
      return binding!==null&&canonicalJson(binding)===canonicalJson(member.binding);
    }));return checks.every(Boolean);
  }
  private notify(workId:string,context:StudioConversationContext){for(const member of context.snapshot.members)this.bindings.notify(member.binding.connectionId,{version:1,workId,conversationId:context.snapshot.conversationId,selfSessionEpoch:member.sessionEpoch});}
  private async finish(principal:VerifiedSessionToken,workId:string,input:StudioConversationRead,context:StudioConversationContext,emitHint=true){
    let current=context;
    if(current.snapshot.status!=="revoked"){
      if(!await this.verify(workId,current.participants))current=await this.repository.invalidate(principal,workId,input,"binding_lost");
      else current=await this.repository.current(principal,workId,input);
    }
    if(emitHint||context.mutated||current.mutated||current.snapshot.revisionId!==context.snapshot.revisionId)this.notify(workId,current);
    return {conversation:current.snapshot,replayed:context.replayed??false};
  }
  propose(principal:VerifiedSessionToken,workId:string,input:StudioConversationPropose,key:string){return this.execute(async()=>{
    const participants=await this.repository.prepare(principal,workId,input);
    if(!await this.verify(workId,participants))throw new StudioAcousticAuthorityError("binding");
    return this.finish(principal,workId,input,await this.repository.propose(principal,workId,input,key));
  });}
  current(principal:VerifiedSessionToken,workId:string,input:StudioConversationRead){return this.execute(async()=>this.finish(principal,workId,input,await this.repository.current(principal,workId,input),false));}
  change(principal:VerifiedSessionToken,workId:string,input:StudioConversationChange,key:string){return this.execute(async()=>{
    if(input.action==="accept"){
      const before=await this.repository.current(principal,workId,input);
      if(before.snapshot.status==="revoked")return this.finish(principal,workId,input,before,false);
      if(!await this.verify(workId,before.participants))return this.finish(principal,workId,input,await this.repository.invalidate(principal,workId,input,"binding_lost"));
    }
    return this.finish(principal,workId,input,await this.repository.change(principal,workId,input,key));
  });}
  renew(principal:VerifiedSessionToken,workId:string,input:StudioConversationRenew){return this.execute(async()=>{
    const before=await this.repository.current(principal,workId,input);
    if(before.snapshot.status==="revoked")return this.finish(principal,workId,input,before,false);
    if(!await this.verify(workId,before.participants))return this.finish(principal,workId,input,await this.repository.invalidate(principal,workId,input,"binding_lost"));
    return this.finish(principal,workId,input,await this.repository.renew(principal,workId,input),false);
  });}
}
