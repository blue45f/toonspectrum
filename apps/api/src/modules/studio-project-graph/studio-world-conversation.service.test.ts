import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import type { StudioLiveAcousticBinding } from "../creator/studio-live-acoustic-binding";
import type { StudioWorldConversationRepository } from "./studio-world-conversation.repository";
import { StudioWorldConversationService } from "./studio-world-conversation.service";
import { StudioWorldConversationController } from "./studio-world-conversation.controller";

const authentication=vi.hoisted(()=>({source:"cookie" as string|null,principal:{userId:"actor",sessionVersion:1,expiresAt:Date.now()+60000}}));
vi.mock("../../session-middleware",()=>({getSessionAuthenticationSource:()=>authentication.source,getSessionAuthenticationPrincipal:()=>authentication.principal}));
const epoch=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const input={conversationId:epoch(10),selfSessionEpoch:epoch(1),expectedRevisionId:"previous",expectedLeaseRevision:"10"};
const members=[1,2].map(n=>({sessionEpoch:epoch(n),binding:{connectionId:`socket-${n}`,clientInstanceId:`client-${n}`,joinedAt:"2026-09-20T01:00:00.000Z"},accepted:true}));
function setup(mutated=true){
  const context={snapshot:{conversationId:input.conversationId,revisionId:"terminal",status:"revoked",members},participants:[],mutated};
  const repository={current:vi.fn().mockResolvedValue(context),change:vi.fn(),renew:vi.fn(),propose:vi.fn(),prepare:vi.fn()};
  const bindings={verify:vi.fn(),notify:vi.fn()};
  const service=new StudioWorldConversationService(repository as unknown as StudioWorldConversationRepository,bindings as unknown as StudioLiveAcousticBinding);
  return {repository,bindings,service,controller:new StudioWorldConversationController(service)};
}
describe("conversation credential, renewal and terminal notification boundaries",()=>{
  it.each(["accept","renew"] as const)("notifies the fixed roster once when %s preflight commits revocation, without another mutation or RPC",async(action)=>{
    const f=setup();
    if(action==="accept")await f.service.change(authentication.principal,"work",{conversationId:input.conversationId,selfSessionEpoch:input.selfSessionEpoch,expectedRevisionId:input.expectedRevisionId,action},"intent-123456789");
    else await f.service.renew(authentication.principal,"work",input);
    expect(f.repository.change).not.toHaveBeenCalled();expect(f.repository.renew).not.toHaveBeenCalled();expect(f.bindings.verify).not.toHaveBeenCalled();
    expect(f.bindings.notify.mock.calls).toEqual(members.map(member=>[member.binding.connectionId,{version:1,workId:"work",conversationId:input.conversationId,selfSessionEpoch:member.sessionEpoch}]));
  });
  it("does not emit another invalidation on a reconciled read of an already terminal state",async()=>{
    const f=setup(false);await f.service.current(authentication.principal,"work",input);
    expect(f.bindings.notify).not.toHaveBeenCalled();expect(f.bindings.verify).not.toHaveBeenCalled();
  });
  it("requires verified cookie authority for every route and private no-store responses",()=>{
    const f=setup(),request={headers:{"x-user-id":"actor"}} as unknown as Request;
    const propose={conversationId:input.conversationId,selfSessionEpoch:input.selfSessionEpoch,memberSessionEpochs:members.map(member=>member.sessionEpoch)};
    const change={conversationId:input.conversationId,selfSessionEpoch:input.selfSessionEpoch,expectedRevisionId:"previous",action:"accept" as const};
    for(const source of [null,"header"]){authentication.source=source;
      expect(()=>f.controller.current(request,{workId:"work"},input)).toThrow();expect(()=>f.controller.propose(request,{workId:"work"},propose,"intent-123456789")).toThrow();
      expect(()=>f.controller.change(request,{workId:"work"},change,"intent-123456789")).toThrow();expect(()=>f.controller.renew(request,{workId:"work"},input)).toThrow();}
    authentication.source="cookie";expect(f.repository.current).not.toHaveBeenCalled();
    for(const method of [f.controller.current,f.controller.propose,f.controller.change,f.controller.renew])expect(Reflect.getMetadata("__headers__",method)).toEqual(expect.arrayContaining([{name:"Cache-Control",value:"private, no-store, max-age=0"}]));
  });
});
