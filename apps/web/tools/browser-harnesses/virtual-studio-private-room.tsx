import { useState } from "react";
import { createRoot } from "react-dom/client";

import { persistSession,SessionContext } from "../../src/compat/auth-session-store";
import StudioP2pHuddleLauncher from "../../src/domains/creator/live/huddle/StudioP2pHuddleLauncher";
import { StudioLiveCollaborationContext,EMPTY_STUDIO_LIVE_CONTEXT } from "../../src/domains/creator/live/studio-live-collaboration-context";
import { StudioPrivateRoomPanel } from "../../src/domains/creator/virtual-space/private-room/StudioPrivateRoomPanel";
import { useStudioPrivateRoom } from "../../src/domains/creator/virtual-space/private-room/use-studio-private-room";
import { studioVirtualSpaceState } from "../../src/domains/creator/virtual-space/studio-virtual-space-model";

import type { StudioLiveParticipant } from "../../src/domains/creator/live/studio-live-collaboration-protocol";
import type { StudioLiveRoom } from "../../src/domains/creator/live/studio-live-collaboration-room";
import type { StudioVirtualSpaceSnapshot } from "../../src/domains/creator/virtual-space/studio-virtual-space-presence";
import "../../src/styles/globals.css";
import "../../src/domains/creator/virtual-space/studio-virtual-space.css";
import "../../src/shared/components/virtual-studio/virtual-studio-shell.css";

// Product hook, HTTP parser, room panel and Huddle. Auth/Core admission and HTTP are synthetic;
// the two browser contexts exchange real ordered RTCDataChannel packets and generated test media.
if(!import.meta.env.DEV)throw new Error("Private room fixture is development-only");
const index=new URLSearchParams(location.search).get("actor")==="b"?1:0;
const actor=`actor-${index}`,self:StudioLiveParticipant={sessionId:`client-${index}`,displayName:index?"팀원 B":"관리자 A",role:"editor"};
const peer:StudioLiveParticipant={sessionId:`client-${1-index}`,displayName:index?"관리자 A":"팀원 B",role:"editor"};
persistSession({user:{id:actor,name:self.displayName}});
const pc=new RTCPeerConnection({iceServers:[]});
let channel:RTCDataChannel|null=null,update=()=>{};
const receivers=new Set<(sender:StudioLiveParticipant,raw:string)=>void>();
const roomListeners=new Set<(event:unknown)=>void>();
const wire=(value:RTCDataChannel)=>{channel=value;value.onmessage=event=>{if(typeof event.data==="string")for(const fn of receivers)fn(peer,event.data);};
  value.onopen=()=>update();value.onclose=()=>{for(const fn of roomListeners)fn({type:"transport-status",status:{state:"disconnected",recoverable:false}});update();};};
pc.ondatachannel=event=>wire(event.channel);
const iceComplete=()=>pc.iceGatheringState==="complete"?Promise.resolve():new Promise<void>(resolve=>{const listener=()=>{if(pc.iceGatheringState==="complete"){pc.removeEventListener("icegatheringstatechange",listener);resolve();}};pc.addEventListener("icegatheringstatechange",listener);});
const direct={getPeers:()=>channel?.readyState==="open"?[peer]:[],send(target:string,raw:string){if(target!==peer.sessionId||channel?.readyState!=="open")return false;channel.send(raw);return true;},subscribe(fn:(sender:StudioLiveParticipant,raw:string)=>void){receivers.add(fn);return()=>receivers.delete(fn);}};
const room={workId:"private-qa",participant:self,get ready(){return channel?.readyState==="open";},get direct(){return channel?.readyState==="open"?direct:null;},
  get acousticCoreBinding(){return channel?.readyState==="open"?{connectionId:`socket-${index}`,clientInstanceId:self.sessionId}:null;},
  subscribe(fn:(event:unknown)=>void){roomListeners.add(fn);return()=>roomListeners.delete(fn);},subscribeVoice:()=>()=>{}} as unknown as StudioLiveRoom;
const zones=[{id:"private-zone",roomId:"review",x:0,y:0,width:200,height:200,policy:"private" as const,doorId:"review-door"}];
const world={worldId:"private-world",revisionId:"published-1",contentHash:"a".repeat(64)};
const bridge={async offer(){wire(pc.createDataChannel("private-control",{ordered:true}));await pc.setLocalDescription(await pc.createOffer());await iceComplete();return pc.localDescription;},
  async accept(offer:RTCSessionDescriptionInit){await pc.setRemoteDescription(offer);await pc.setLocalDescription(await pc.createAnswer());await iceComplete();return pc.localDescription;},
  async answer(answer:RTCSessionDescriptionInit){await pc.setRemoteDescription(answer);},disconnect(){channel?.close();pc.close();},
  hint(value:unknown){for(const fn of roomListeners)fn({type:"acoustic-invalidation",invalidation:value});}};
Object.assign(window,{privateFixture:bridge});
function Fixture(){
  const [,render]=useState(0),[outside,setOutside]=useState(false),[identity,setIdentity]=useState(actor);update=()=>render(value=>value+1);
  const point={x:outside?250:50,y:50},other={x:60,y:50};
  const presence:StudioVirtualSpaceSnapshot={self:studioVirtualSpaceState(point),peers:[{participant:peer,state:studioVirtualSpaceState(other),lastSeen:Date.now(),sequence:1}],nearbyPeers:[],direct:room.ready,selfReaction:null,peerReactions:[]};
  const privateRoom=useStudioPrivateRoom({workId:"private-qa",actorId:identity,world,zones,zoneId:"private-zone",room,presence,enabled:true});
  return <SessionContext.Provider value={{data:{user:{id:identity},token:null},ready:true,status:"authenticated",update:async()=>null}}>
    <StudioLiveCollaborationContext.Provider value={{...EMPTY_STUDIO_LIVE_CONTEXT,room,availability:room.ready?"ready":"connecting",canChat:true}}>
      <main className="mx-auto max-w-xl space-y-4 p-4 text-fg"><p>개발용 합성 HTTP·Core 인증 / 실제 RTC와 제품 대화 UI</p>
        <button type="button" onClick={()=>setOutside(!outside)}>예시 구역 이탈</button>
        <button type="button" onClick={()=>{persistSession({user:{id:"replacement"}});setIdentity("replacement");}}>예시 계정 전환</button>
        <StudioPrivateRoomPanel key={identity} room={privateRoom} zones={zones} zoneId="private-zone" onZone={()=>{}} peers={presence.peers} labels={{"private-zone":"검수실"}}/>
        <output id="fixture-state" className="sr-only">{JSON.stringify({ready:room.ready,...privateRoom.snapshot})}</output>
      </main><StudioP2pHuddleLauncher/>
    </StudioLiveCollaborationContext.Provider>
  </SessionContext.Provider>;
}
createRoot(document.getElementById("test-root")!).render(<Fixture/>);
