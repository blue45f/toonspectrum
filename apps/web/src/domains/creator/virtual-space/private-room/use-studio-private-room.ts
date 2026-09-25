import { useLayoutEffect, useRef, useState } from "react";
import { getAuthUserId, listeners as authListeners } from "@/domains/auth/public/session/auth-session-state";
import type { StudioAcousticWorldPin } from "@toonspectrum/studio-project-model/world-acoustic";
import type { StudioLiveRoom } from "../../live/studio-live-collaboration-room";
import { closeStudioP2pHuddle, openStudioP2pHuddle, STUDIO_P2P_HUDDLE_CLOSED_EVENT, type StudioP2pHuddleClosedDetail } from "../../live/huddle/studio-p2p-huddle-events";
import { registerStudioHuddleAuthority } from "../../live/huddle/studio-p2p-huddle-authority";
import { resolveStudioAcousticZone, type StudioWorldAcousticZoneDefinition } from "../studio-virtual-space-acoustics";
import type { StudioVirtualSpaceSnapshot } from "../studio-virtual-space-presence";
import { createStudioPrivateRoomApi } from "./studio-private-room-client";
import { StudioPrivateRoomController, type StudioPrivateSnapshot } from "./studio-private-room-controller";

export interface StudioPrivateRoomOptions {
  workId:string;actorId:string|null;world:StudioAcousticWorldPin|null;zones:readonly StudioWorldAcousticZoneDefinition[];
  zoneId:string|null;room:StudioLiveRoom|null;presence:StudioVirtualSpaceSnapshot;enabled:boolean;
  onConversation?:()=>void;
}
const EMPTY:StudioPrivateSnapshot={door:null,team:null,session:null,conversations:[],candidates:[],knocks:[],busy:false,uncertain:false,reason:null,knockPending:false,knockOutcome:null};
function distanceToZone(point:{readonly x:number;readonly y:number},zone:StudioWorldAcousticZoneDefinition):number{
  const dx=Math.max(zone.x-point.x,0,point.x-(zone.x+zone.width));
  const dy=Math.max(zone.y-point.y,0,point.y-(zone.y+zone.height));
  return Math.hypot(dx,dy);
}
export function useStudioPrivateRoom(options:StudioPrivateRoomOptions){
  const latest=useRef(options);latest.current=options;
  const binding=options.room?.acousticCoreBinding;
  const key=JSON.stringify([options.workId,options.actorId,options.world,options.zoneId,binding,options.enabled,options.room?.participant?.role]);
  const owner=useRef<{key:string;controller:StudioPrivateRoomController}|null>(null);
  const [view,setView]=useState({key,snapshot:EMPTY});
  // Render-time identity fence: stale callbacks and an old account's private roster are unusable.
  const liveKey=useRef(key);liveKey.current=key;
  useLayoutEffect(()=>{
    const initial=latest.current;
    const {world,actorId,zoneId,room}=initial,zone=initial.zones.find(item=>item.id===zoneId);
    const core=room?.acousticCoreBinding,direct=room?.direct;
    if(!initial.enabled||!world||!actorId||!zone?.doorId||!room||!core||!direct||room.participant?.role==="viewer")return;
    const current=()=>liveKey.current===key&&latest.current.enabled&&getAuthUserId()===actorId&&document.visibilityState!=="hidden"
      &&navigator.onLine!==false&&room.ready&&room.participant?.role!=="viewer"&&JSON.stringify(room.acousticCoreBinding)===JSON.stringify(core);
    const eligible=(ids:readonly string[],stage:"enter"|"active")=>{
      const snapshot=latest.current.presence;if(!current()||!snapshot.direct)return false;
      const points=[snapshot.self];
      if(new Set(ids).size!==ids.length||ids.length>3)return false;
      for(const id of ids){const peer=snapshot.peers.find(item=>item.participant.sessionId===id);
        if(!peer||peer.participant.role==="viewer"||Date.now()-peer.lastSeen>10000||!direct.getPeers().some(item=>item.sessionId===id&&item.role!=="viewer"))return false;points.push(peer.state);}
      if(points.some(point=>point.activity==="away"||point.activity==="focused"||resolveStudioAcousticZone(latest.current.zones,point)?.id!==zoneId))return false;
      return points.every(a=>points.every(b=>Math.hypot(a.x-b.x,a.y-b.y)<=(stage==="enter"?120:156)));
    };
    const knockEligible=(peerId?:string)=>{
      if(!current())return false;
      const snapshot=latest.current.presence;
      const point=peerId?snapshot.peers.find(item=>item.participant.sessionId===peerId)?.state:snapshot.self;
      if(!point||point.activity==="away"||point.activity==="focused")return false;
      if(peerId&&!direct.getPeers().some(item=>item.sessionId===peerId&&item.role!=="viewer"))return false;
      return distanceToZone(point,zone)<=80;
    };
    const controller=new StudioPrivateRoomController({workId:initial.workId,actorId,world,zoneId:zone.id,doorId:zone.doorId,binding:core},
      {api:createStudioPrivateRoomApi(initial.workId,zone.id),direct,current,canCleanup:()=>getAuthUserId()===actorId,eligible,knockEligible});
    owner.current={key,controller};
    let active:{id:string;dispose:()=>void}|null=null;
    const sync=()=>{
      if(liveKey.current!==key)return;
      const snapshot=controller.snapshot();
      if(active&&!controller.mediaValid(active.id)){const previous=active;active=null;previous.dispose();closeStudioP2pHuddle({conversationId:previous.id});}
      const grant=snapshot.conversations.find(record=>controller.mediaValid(record.conversationId));
      if(grant&&!active){
        const capability=registerStudioHuddleAuthority({conversationId:grant.conversationId,peerIds:controller.peerIds(grant),
          valid:()=>controller.mediaValid(grant.conversationId),captureRevision:controller.captureRevision,subscribe:controller.subscribe});
        active={id:grant.conversationId,dispose:capability.dispose};latest.current.onConversation?.();
        openStudioP2pHuddle({source:"virtual-space",conversationId:grant.conversationId,peerIds:controller.peerIds(grant),authorityToken:capability.token});
      }
      setView({key,snapshot});
    };
    const off=controller.subscribe(sync),offRoom=room.subscribe(event=>{
      if(event.type==="acoustic-invalidation")controller.hint(event.invalidation);
      if(event.type==="transport-status")controller.tick();
    });
    const onAuth=()=>{if(getAuthUserId()!==actorId)controller.invalidate();else void controller.authRefresh();};
    const onVisibility=()=>{if(document.visibilityState==="hidden")controller.leave();else void controller.refresh();};
    const onFocus=()=>void controller.refresh();
    const onOffline=()=>controller.leave();
    const onClosed=(event:Event)=>{const id=(event as CustomEvent<StudioP2pHuddleClosedDetail>).detail?.conversationId;
      if(id&&controller.mediaValid(id))void controller.change(id,"leave");};
    authListeners.add(onAuth);document.addEventListener("visibilitychange",onVisibility);window.addEventListener("focus",onFocus);
    window.addEventListener("offline",onOffline);window.addEventListener(STUDIO_P2P_HUDDLE_CLOSED_EVENT,onClosed);
    const timer=window.setInterval(()=>controller.tick(),200);controller.start();
    return()=>{off();offRoom();authListeners.delete(onAuth);document.removeEventListener("visibilitychange",onVisibility);window.removeEventListener("focus",onFocus);
      window.removeEventListener("offline",onOffline);window.removeEventListener(STUDIO_P2P_HUDDLE_CLOSED_EVENT,onClosed);window.clearInterval(timer);
      const previous=active;active=null;controller.close();previous?.dispose();if(previous)closeStudioP2pHuddle({conversationId:previous.id});
      if(owner.current?.controller===controller)owner.current=null;};
    // Latest positions are read synchronously; only immutable authority identity recreates the owner.
  },[key]);
  useLayoutEffect(()=>{owner.current?.controller.tick();},[options.presence]);
  const controller=owner.current?.key===key?owner.current.controller:null;
  const entryReason=options.room?.participant?.role==="viewer" ? "read-only" : options.presence.self.activity==="focused"||options.presence.self.activity==="away" ? "focused"
    : !options.enabled ? "unavailable" : resolveStudioAcousticZone(options.zones,options.presence.self)?.id!==options.zoneId ? "outside" : null;
  return {snapshot:view.key===key?view.snapshot:EMPTY,controller,available:!!binding&&!!options.world&&options.enabled&&options.room?.participant?.role!=="viewer",entryReason};
}
