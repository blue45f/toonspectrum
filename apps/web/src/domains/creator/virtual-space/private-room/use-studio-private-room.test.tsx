// @vitest-environment jsdom
import { act,cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import type { StudioLiveRoom } from "../../live/studio-live-collaboration-room";
import type { StudioLiveParticipant } from "../../live/studio-live-collaboration-protocol";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import { STUDIO_P2P_HUDDLE_OPEN_EVENT } from "../../live/huddle/studio-p2p-huddle-events";
import { studioVirtualSpaceState } from "../studio-virtual-space-model";
import { StudioPrivateRoomPanel } from "./StudioPrivateRoomPanel";
import { useStudioPrivateRoom,type StudioPrivateRoomOptions } from "./use-studio-private-room";
import { createStudioPrivateRoomApi } from "./studio-private-room-client";

const auth=vi.hoisted(()=>({actor:"actor",listeners:new Set<()=>void>()}));
vi.mock("@/domains/auth/public/session/auth-session-state",()=>({getAuthUserId:()=>auth.actor,listeners:auth.listeners}));
vi.mock("./studio-private-room-client",async importOriginal=>({...await importOriginal<typeof import("./studio-private-room-client")>(),createStudioPrivateRoomApi:vi.fn()}));

const world={worldId:"world",revisionId:"revision",contentHash:"a".repeat(64)},epoch="00000000-0000-4000-8000-000000000001";
const zones=[{id:"zone",roomId:"review",x:0,y:0,width:200,height:200,policy:"private" as const,doorId:"door"}];
function fixture(){
  const lease={kind:"acoustic-session-lease-only" as const,world,zoneId:"zone",doorId:"door",doorEpoch:epoch,sessionEpoch:epoch,leaseRevision:"1",expiresAt:new Date(Date.now()+15000).toISOString(),binding:{connectionId:"socket",clientInstanceId:"client",joinedAt:new Date().toISOString()}};
  const api={door:vi.fn(async()=>({world,zoneId:"zone",doorId:"door",epoch,open:true,permitted:true,allowedUserIds:["actor"]})),team:vi.fn(async()=>({workId:"work",viewer:{userId:"actor",role:"owner" as const,status:"active" as const,capabilities:{view:true,edit:true,comment:true,manageMembers:true,respondInvite:false}},members:[{userId:"actor",name:"관리자",role:"owner" as const,status:"active" as const,isOwner:true,image:""}]})),changeDoor:vi.fn(),open:vi.fn(async()=>lease),readOpen:vi.fn(async()=>lease),readSession:vi.fn(async()=>lease),renewSession:vi.fn(async()=>lease),closeSession:vi.fn(async()=>{}),propose:vi.fn(),read:vi.fn(),renew:vi.fn(),change:vi.fn()};
  vi.mocked(createStudioPrivateRoomApi).mockReturnValue(api);
  let receive:((peer:StudioLiveParticipant,raw:string)=>void)|null=null,roomEvent:((event:unknown)=>void)|null=null;
  const room={ready:true,participant:{sessionId:"client",displayName:"관리자",role:"editor"},acousticCoreBinding:{connectionId:"socket",clientInstanceId:"client"},direct:{getPeers:()=>[],send:()=>false,subscribe:(fn:(peer:StudioLiveParticipant,raw:string)=>void)=>{receive=fn;return()=>{};}},subscribe:(fn:(event:unknown)=>void)=>{roomEvent=fn;return()=>{};}} as unknown as StudioLiveRoom;
  const props:StudioPrivateRoomOptions={workId:"work",actorId:"actor",world,zones,zoneId:"zone",room,enabled:true,presence:{self:studioVirtualSpaceState({x:50,y:50}),peers:[],nearbyPeers:[],selfReaction:null,peerReactions:[],direct:true}};
  return {api,props,lease,receive:(peer:StudioLiveParticipant,raw:string)=>receive?.(peer,raw),event:(value:unknown)=>roomEvent?.(value)};
}
function View({onWalk,...props}:StudioPrivateRoomOptions&{onWalk?:()=>boolean}){const room=useStudioPrivateRoom(props);return <><StudioPrivateRoomPanel room={room} zones={zones} zoneId="zone" onZone={()=>{}} peers={[]} labels={{zone:"검수실"}} onWalk={onWalk}/><output data-testid="state">{JSON.stringify(room.snapshot)}</output></>;}
beforeEach(()=>{auth.actor="actor";Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});});
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("private room hook ownership and UI",()=>{
  it("shows human room names and requires actual arrival after explicit walking before admission",async()=>{
    const f=fixture(),walk=vi.fn(()=>false);const outside={...f.props,presence:{...f.props.presence,self:studioVirtualSpaceState({x:250,y:50})}};
    const view=render(<View {...outside} onWalk={walk}/>);await screen.findByText("문 열림");
    expect(screen.getByRole("option",{name:"검수실"})).toBeTruthy();
    expect(screen.getByRole("button",{name:"이 구역에서 입장 확인"})).toHaveProperty("disabled",true);
    fireEvent.click(screen.getByRole("button",{name:"이 방으로 걸어가기"}));expect(walk).toHaveBeenCalledOnce();
    expect(screen.getByText("이 방으로 가는 길을 찾지 못했어요. 공간 배치를 확인해 주세요.")).toBeTruthy();expect(f.api.open).not.toHaveBeenCalled();
    walk.mockReturnValue(true);fireEvent.click(screen.getByRole("button",{name:"이 방으로 걸어가기"}));
    expect(screen.getByRole("button",{name:"이 구역에서 입장 확인"})).toHaveProperty("disabled",true);expect(f.api.open).not.toHaveBeenCalled();
    view.rerender(<View {...f.props} onWalk={walk}/>);expect(screen.queryByRole("button",{name:"이 방으로 걸어가기"})).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"이 구역에서 입장 확인"}));await screen.findByRole("button",{name:"방에서 나가기"});expect(f.api.open).toHaveBeenCalledOnce();
  });
  it("explains focused admission without issuing an open request",async()=>{
    const f=fixture();render(<View {...f.props} enabled={false} presence={{...f.props.presence,self:{...f.props.presence.self,activity:"focused"}}}/>);
    expect(screen.getByText("집중·자리 비움 상태를 해제한 뒤 입장할 수 있어요.")).toBeTruthy();
    expect(screen.getByRole("button",{name:"이 구역에서 입장 확인"})).toHaveProperty("disabled",true);expect(f.api.open).not.toHaveBeenCalled();
  });
  it("requires explicit admission and preserves the same admission across blur and same-actor renewal",async()=>{
    const f=fixture();render(<View {...f.props}/>);await screen.findByText("문 열림");expect(f.api.open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"이 구역에서 입장 확인"}));await screen.findByRole("button",{name:"방에서 나가기"});
    act(()=>{window.dispatchEvent(new Event("blur"));for(const fn of auth.listeners)fn();});
    await waitFor(()=>expect(f.api.readSession).toHaveBeenCalled());expect(f.api.closeSession).not.toHaveBeenCalled();expect(f.api.open).toHaveBeenCalledOnce();
    expect(screen.getByTestId("state").textContent).toContain(epoch);
  });
  it("clears private names immediately on actor change and ignores a late open response",async()=>{
    const f=fixture();let finish!:(value:typeof f.lease)=>void;f.api.open.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const view=render(<View {...f.props}/>);await screen.findByText("문 열림");fireEvent.click(screen.getByRole("button",{name:"이 구역에서 입장 확인"}));
    act(()=>{auth.actor="other";for(const fn of auth.listeners)fn();});view.rerender(<View {...f.props} actorId="other"/>);
    await act(async()=>{finish(f.lease);await Promise.resolve();});
    const snapshot=JSON.parse(screen.getByTestId("state").textContent!);expect(snapshot.session).toBeNull();expect(snapshot.team).toBeNull();expect(f.api.closeSession).not.toHaveBeenCalled();
  });
  it("preserves the existing view-only media restriction and ends admission immediately on role downgrade",async()=>{
    const f=fixture();const view=render(<View {...f.props}/>);await screen.findByText("문 열림");
    fireEvent.click(screen.getByRole("button",{name:"이 구역에서 입장 확인"}));await screen.findByRole("button",{name:"방에서 나가기"});
    view.rerender(<View {...f.props} room={{...f.props.room,participant:{sessionId:"client",displayName:"관리자",role:"viewer"}} as StudioLiveRoom}/>);
    expect(screen.getByText("현재 보기 전용 권한으로는 대화에 참여할 수 없어요. 공간 관리자에게 팀 권한을 확인해 주세요.")).toBeTruthy();
    expect(screen.getByRole("button",{name:"이 구역에서 입장 확인"})).toHaveProperty("disabled",true);
    expect(JSON.parse(screen.getByTestId("state").textContent!).session).toBeNull();expect(f.api.closeSession).toHaveBeenCalledOnce();expect(f.api.open).toHaveBeenCalledOnce();
  });
  it("excludes a view-only peer from invitations and never opens an already active viewer roster",async()=>{
    const f=fixture(),peer={sessionId:"viewer-client",displayName:"보기 전용 팀원",role:"viewer" as const};
    vi.spyOn(f.props.room!.direct!,"getPeers").mockReturnValue([peer]);
    const props={...f.props,presence:{...f.props.presence,peers:[{participant:peer,state:studioVirtualSpaceState({x:60,y:50}),lastSeen:Date.now(),sequence:1}]}};
    const opened=vi.fn();window.addEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT,opened);
    try{
      render(<View {...props}/>);await screen.findByText("문 열림");fireEvent.click(screen.getByRole("button",{name:"이 구역에서 입장 확인"}));await screen.findByRole("button",{name:"방에서 나가기"});
      const peerEpoch="00000000-0000-4000-8000-000000000002",conversationId="00000000-0000-4000-8000-000000000003";
      act(()=>f.receive(peer,JSON.stringify({wire:"studio-private-room-v1",workId:"work",world:canonicalJson(world),zoneId:"zone",doorEpoch:epoch,sessionEpoch:peerEpoch,clientInstanceId:peer.sessionId})));
      expect(JSON.parse(screen.getByTestId("state").textContent!).candidates).toEqual([]);
      f.api.read.mockResolvedValue({kind:"acoustic-conversation-consent",world,zoneId:"zone",doorId:"door",doorEpoch:epoch,conversationId,revisionId:"revision",status:"active",reason:null,leaseRevision:"1",expiresAt:f.lease.expiresAt,
        members:[{sessionEpoch:epoch,binding:f.lease.binding,accepted:true},{sessionEpoch:peerEpoch,binding:{connectionId:"viewer-socket",clientInstanceId:peer.sessionId,joinedAt:f.lease.binding.joinedAt},accepted:true}]});
      await act(async()=>{f.event({type:"acoustic-invalidation",invalidation:{version:1,workId:"work",conversationId,selfSessionEpoch:epoch}});for(let i=0;i<12;i++)await Promise.resolve();});
      expect(f.api.read).toHaveBeenCalled();expect(opened).not.toHaveBeenCalled();expect(screen.queryByText("모두 수락하여 대화가 준비됐어요.")).toBeNull();
    }finally{window.removeEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT,opened);}
  });
  it("withdraws synchronously on the browser offline event before a polling tick",async()=>{
    const f=fixture();render(<View {...f.props}/>);await screen.findByText("문 열림");
    fireEvent.click(screen.getByRole("button",{name:"이 구역에서 입장 확인"}));await screen.findByRole("button",{name:"방에서 나가기"});
    act(()=>window.dispatchEvent(new Event("offline")));
    expect(f.api.closeSession).toHaveBeenCalledOnce();expect(JSON.parse(screen.getByTestId("state").textContent!).session).toBeNull();
  });
  it("releases the admission on hidden and reconnect and never re-enters automatically",async()=>{
    const f=fixture();const view=render(<View {...f.props}/>);await screen.findByText("문 열림");fireEvent.click(screen.getByRole("button",{name:"이 구역에서 입장 확인"}));await screen.findByRole("button",{name:"방에서 나가기"});
    act(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});document.dispatchEvent(new Event("visibilitychange"));});
    expect(f.api.closeSession).toHaveBeenCalledOnce();expect(JSON.parse(screen.getByTestId("state").textContent!).session).toBeNull();
    act(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});document.dispatchEvent(new Event("visibilitychange"));});
    view.rerender(<View {...f.props} room={{...f.props.room,acousticCoreBinding:{connectionId:"new-socket",clientInstanceId:"client"}} as StudioLiveRoom}/>);
    await waitFor(()=>expect(f.api.door).toHaveBeenCalled());expect(f.api.open).toHaveBeenCalledOnce();
  });
});
