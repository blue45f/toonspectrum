// @vitest-environment jsdom
import { useSyncExternalStore } from "react";
import { act,cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,describe,expect,it,vi } from "vitest";
import type { StudioAcousticSessionLease } from "@toonspectrum/studio-project-model";
import { studioVirtualSpaceState } from "../studio-virtual-space-model";
import { fixture,flush } from "./studio-private-room-controller.fixture";
import { StudioPrivateRoomPanel } from "./StudioPrivateRoomPanel";

afterEach(cleanup);
describe("private panel explicit withdrawal while network work is pending",()=>{
  it.each(["decline","cancel","leave","block","room"] as const)("keeps %s available and never revives from the late read",async action=>{
    const f=fixture();let id:string,index=0;
    if(action==="decline"||action==="cancel"){
      await f.start();await f.controllers[0]!.propose(["client-1"]);id=f.controllers[0]!.snapshot().conversations[0]!.conversationId;
      await f.controllers[1]!.refresh();if(action==="decline")index=1;
    }else id=await f.active();
    const c=f.controllers[index]!,api=f.apis[index]!;
    let finish!:(lease:StudioAcousticSessionLease)=>void;
    vi.mocked(api.readSession).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    vi.mocked(api.change).mockRejectedValueOnce(new Error("response lost"));
    function View(){const snapshot=useSyncExternalStore(c.subscribe,c.snapshot);return <StudioPrivateRoomPanel
      room={{controller:c,snapshot,available:true,entryReason:null}} zones={[{id:"zone",roomId:"review",x:0,y:0,width:200,height:200,policy:"private",doorId:"door"}]}
      zoneId="zone" onZone={()=>{}} peers={f.participants.filter((_,i)=>i!==index).map(participant=>({participant,state:studioVirtualSpaceState({x:50,y:50}),lastSeen:Date.now(),sequence:1}))}/>;}
    render(<View/>);let pending!:Promise<void>;
    await act(async()=>{pending=c.refresh();await flush();});await waitFor(()=>expect(finish).toBeTypeOf("function"));
    expect(c.snapshot().busy).toBe(true);
    const name=action==="decline"?"거절":action==="block"?"Member 1 이번 방문에서 차단":action==="room"?"방에서 나가기":"대화 나가기";
    const button=screen.getByRole("button",{name});expect(button).toHaveProperty("disabled",false);
    fireEvent.click(button);expect(c.mediaValid(id)).toBe(false);
    if(action==="room")expect(c.snapshot().session).toBeNull();else expect(c.snapshot().conversations[0]!.status).toBe("revoked");
    await act(async()=>{finish(f.leases[index]!);await pending;await flush();await c.refresh();});
    expect(c.mediaValid(id)).toBe(false);
    if(action==="room"){expect(api.closeSession).toHaveBeenCalledOnce();expect(c.snapshot().conversations).toEqual([]);}
    else {expect(api.change).toHaveBeenCalledOnce();expect(c.snapshot().conversations[0]!.status).toBe("revoked");}
    for(const controller of f.controllers)controller.close();
  });
});
