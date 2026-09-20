import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioLiveAcousticBinding, verifyLocalStudioAcousticBinding } from "./studio-live-acoustic-binding";
import { studioLivePrincipalFingerprint } from "../../server/session";
import type { StudioLiveGatewayHost } from "./studio-live-gateway-host";

const identity={connectionId:"connection",clientInstanceId:"client"};
const binding={...identity,joinedAt:"2026-09-20T01:00:00.000Z"};
const principal={userId:"actor",sessionVersion:2,expiresAt:Date.now()+60000};
function namespace(responses:unknown[]=[]){return {on:vi.fn(),off:vi.fn(),serverSideEmitWithAck:vi.fn().mockResolvedValue(responses)};}
afterEach(()=>vi.useRealTimers());
describe("server-owned Core acoustic binding",()=>{
  it("fails closed without the actual Core gateway and verifies local bindings without remote lookup",async()=>{
    const port=new StudioLiveAcousticBinding(); expect(await port.verify(principal,"work",identity)).toBeNull();
    const server=namespace();port.bind(server,async()=>binding);
    expect(await port.verify(principal,"work",identity)).toEqual(binding);expect(server.serverSideEmitWithAck).not.toHaveBeenCalled();
    port.onModuleDestroy();expect(server.off).toHaveBeenCalledOnce();
  });
  it("accepts exactly one actual remote owner and rejects ambiguous or malformed replies",async()=>{
    for(const [responses,expected] of [[[{binding}],binding],[[{binding},{binding}],null],[[{binding:{...binding,connectionId:"different"}}],null],[[{binding:{...binding,credential:"forged"}}],null],[[],null]] as const){
      const port=new StudioLiveAcousticBinding(), server=namespace([...responses]);port.bind(server,async()=>null);
      expect(await port.verify(principal,"work",identity)).toEqual(expected);
      const request=server.serverSideEmitWithAck.mock.calls[0]![1];expect(request).not.toHaveProperty("userId");expect(request).not.toHaveProperty("token");expect(request.sessionVersion).toBe(2);port.onModuleDestroy();
    }
  });
  it("bounds a failed adapter RPC without mutation retries",async()=>{
    vi.useFakeTimers();const server=namespace();server.serverSideEmitWithAck.mockImplementation(()=>new Promise(()=>undefined));
    const port=new StudioLiveAcousticBinding();port.bind(server,async()=>null);const pending=port.verify(principal,"work",identity);
    await vi.advanceTimersByTimeAsync(2001);expect(await pending).toBeNull();expect(server.serverSideEmitWithAck).toHaveBeenCalledOnce();port.onModuleDestroy();
  });
  it("does not return a late binding after the Core gateway is detached",async()=>{
    let finish!:(value:typeof binding)=>void;
    const port=new StudioLiveAcousticBinding();port.bind(namespace(),()=>new Promise(resolve=>{finish=resolve;}));
    const pending=port.verify(principal,"work",identity);port.onModuleDestroy();finish(binding);
    expect(await pending).toBeNull();
  });
  it("checks socket-private principal version, actual joined participant and post-await principal ownership",async()=>{
    const socket={id:identity.connectionId}, actualPrincipal={...principal};let current=true;
    const host={server:{sockets:new Map([[identity.connectionId,socket]])},socketAuthentication:{principal:()=>actualPrincipal},
      isSocketPrincipalCurrent:()=>current,runWithAuthorizedParticipant:vi.fn(async(_socket,_work,_edit,_force,action)=>({value:action(binding)}))} as unknown as StudioLiveGatewayHost;
    const request={...identity,workId:"work",fingerprint:studioLivePrincipalFingerprint(principal.userId),sessionVersion:2,deadline:Date.now()+2000};
    expect(await verifyLocalStudioAcousticBinding(host,request)).toEqual(binding);
    expect(await verifyLocalStudioAcousticBinding(host,{...request,sessionVersion:1})).toBeNull();
    expect(await verifyLocalStudioAcousticBinding(host,{...request,clientInstanceId:"other"})).toBeNull();
    current=false;expect(await verifyLocalStudioAcousticBinding(host,request)).toBeNull();
    expect(host.runWithAuthorizedParticipant).toHaveBeenCalledWith(socket,"work",false,true,expect.any(Function));
  });
});
