import "reflect-metadata";
import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import { StudioWorldAcousticController } from "./studio-world-acoustic.controller";
import { StudioWorldAcousticService } from "./studio-world-acoustic.service";
import { StudioAcousticAuthorityError, type StudioWorldAcousticRepository } from "./studio-world-acoustic.repository";
import type { StudioLiveAcousticBinding } from "../creator/studio-live-acoustic-binding";

const authentication=vi.hoisted(()=>({source:"cookie" as string|null,principal:{userId:"actor",sessionVersion:1,expiresAt:Date.now()+60000}}));
vi.mock("../../session-middleware",()=>({getSessionAuthenticationSource:()=>authentication.source,getSessionAuthenticationPrincipal:()=>authentication.principal}));
const input={world:{worldId:"world",revisionId:"revision",contentHash:"a".repeat(64)},zoneId:"zone",doorEpoch:"00000000-0000-4000-8000-000000000001",connectionId:"connection",clientInstanceId:"client",expectedSessionEpoch:null};
function setup(){
  const repository={door:vi.fn().mockResolvedValue({open:false}),changeDoor:vi.fn(),open:vi.fn(),readOpenIntent:vi.fn(),current:vi.fn(),revoke:vi.fn()};
  const bindings={verify:vi.fn().mockResolvedValue(null)};
  const service=new StudioWorldAcousticService(repository as unknown as StudioWorldAcousticRepository,bindings as unknown as StudioLiveAcousticBinding);
  return {repository,bindings,service,controller:new StudioWorldAcousticController(service)};
}
describe("acoustic HTTP authority boundary",()=>{
  it("requires a verified cookie session rather than caller actor headers or a public room ticket",async()=>{
    const f=setup(),request={headers:{"x-user-id":"actor"}} as unknown as Request;
    for(const source of [null,"header"]){authentication.source=source;expect(()=>f.controller.door(request,{workId:"work",zoneId:"zone"})).toThrow("로그인이 필요해요.");}
    expect(f.repository.door).not.toHaveBeenCalled();authentication.source="cookie";
    await f.controller.door(request,{workId:"work",zoneId:"zone"});
    expect(f.repository.door).toHaveBeenCalledWith(authentication.principal,"work","zone");
    expect(()=>f.controller.open(request,{workId:"work"},input,"short")).toThrow();expect(f.repository.open).not.toHaveBeenCalled();
    for(const method of [f.controller.door,f.controller.changeDoor,f.controller.open,f.controller.readOpenIntent,f.controller.current,f.controller.renew,f.controller.revoke]) {
      expect(Reflect.getMetadata("__headers__",method)).toEqual(expect.arrayContaining([{name:"Cache-Control",value:"private, no-store, max-age=0"}]));
    }
  });
  it("does not create a DB lease when the actual joined Core binding cannot be verified",async()=>{
    const f=setup();await expect(f.service.open(authentication.principal,"work",input,"intent-123456789")).rejects.toMatchObject({status:503});
    expect(f.bindings.verify).toHaveBeenCalledOnce();expect(f.repository.open).not.toHaveBeenCalled();
  });
  it("reconciles only a current Core binding and never opens another lease",async()=>{
    const f=setup(),binding={connectionId:input.connectionId,clientInstanceId:input.clientInstanceId,joinedAt:new Date().toISOString()},lease={binding,sessionEpoch:crypto.randomUUID()};
    f.repository.readOpenIntent.mockResolvedValueOnce(null).mockResolvedValue(lease);
    expect(await f.service.readOpenIntent(authentication.principal,"work",input,"intent-123456789")).toEqual({lease:null});
    expect(f.bindings.verify).not.toHaveBeenCalled();
    await expect(f.service.readOpenIntent(authentication.principal,"work",input,"intent-123456789")).rejects.toMatchObject({status:503});
    expect(f.repository.revoke).toHaveBeenCalledWith(authentication.principal.userId,"work",lease.sessionEpoch);
    f.bindings.verify.mockResolvedValue(binding);f.repository.current.mockResolvedValue(lease);
    expect(await f.service.readOpenIntent(authentication.principal,"work",input,"intent-123456789")).toEqual({lease});
    expect(f.repository.open).not.toHaveBeenCalled();
  });
  it.each([["stale",409],["closed",403],["binding",503],["limit",409],["proof",422],["session",403]] as const)("maps %s without claiming a grant or retrying",async(reason,status)=>{
    const f=setup();f.repository.door.mockRejectedValue(new StudioAcousticAuthorityError(reason));
    await expect(f.service.door(authentication.principal,"work","zone")).rejects.toMatchObject({status,response:{code:`studio_acoustic_${reason}`}});
    expect(f.repository.door).toHaveBeenCalledOnce();
  });
});
