import { vi } from "vitest";
import { canonicalJson, type StudioAcousticSessionLease, type StudioConversationSnapshot } from "@toonspectrum/studio-project-model";
import type { StudioLiveParticipant } from "../../live/studio-live-collaboration-protocol";
import type { StudioPrivateRoomApi } from "./studio-private-room-client";
import { StudioPrivateRoomController } from "./studio-private-room-controller";

export const world={worldId:"world",revisionId:"revision",contentHash:"a".repeat(64)};
export const doorEpoch="00000000-0000-4000-8000-000000000001";
export const ids=["00000000-0000-4000-8000-000000000002","00000000-0000-4000-8000-000000000003","00000000-0000-4000-8000-000000000004","00000000-0000-4000-8000-000000000005"];
export const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
export function fixture(count=2){
  let now=Date.now(),open=true,eligible=true,current=true;
  const records=new Map<string,StudioConversationSnapshot>();
  const participants=ids.slice(0,count).map((_,i)=>({sessionId:`client-${i}`,displayName:`Member ${i}`,role:"editor" as const}));
  const receivers=new Map<string,(peer:StudioLiveParticipant,raw:string)=>void>();
  const leases=participants.map((p,i):StudioAcousticSessionLease=>({kind:"acoustic-session-lease-only",world,zoneId:"zone",doorId:"door",doorEpoch,sessionEpoch:ids[i]!,leaseRevision:"1",expiresAt:new Date(now+15000).toISOString(),binding:{connectionId:`socket-${i}`,clientInstanceId:p.sessionId,joinedAt:new Date(now-1000).toISOString()}}));
  const controllers:StudioPrivateRoomController[]=[],apis:StudioPrivateRoomApi[]=[];
  participants.forEach((p,i)=>{
    const api:StudioPrivateRoomApi={
      door:vi.fn(async()=>({world,zoneId:"zone",doorId:"door",epoch:doorEpoch,open,permitted:open,allowedUserIds:["actor-0","actor-1"]})),
      team:vi.fn(async()=>({workId:"work",viewer:{userId:`actor-${i}`,role:"owner",status:"active",capabilities:{view:true,comment:true,edit:true,manageMembers:true,respondInvite:false}},members:[]})),
      changeDoor:vi.fn(async input=>{open=input.open;}),
      open:vi.fn(async()=>leases[i]!),readOpen:vi.fn(async()=>leases[i]!),readSession:vi.fn(async()=>{if(!open)throw new Error("closed");return leases[i]!;}),
      renewSession:vi.fn(async input=>{if(input.expectedLeaseRevision!==leases[i]!.leaseRevision)throw new Error("conflict");leases[i]={...leases[i]!,leaseRevision:String(Number(input.expectedLeaseRevision)+1),expiresAt:new Date(now+15000).toISOString()};return leases[i]!;}),
      closeSession:vi.fn(async()=>{}),
      propose:vi.fn(async input=>{const record:StudioConversationSnapshot={kind:"acoustic-conversation-consent",world,zoneId:"zone",doorId:"door",doorEpoch,conversationId:input.conversationId,revisionId:"consent-1",status:"pending",reason:null,leaseRevision:"1",expiresAt:new Date(now+15000).toISOString(),members:input.memberSessionEpochs.map(epoch=>({sessionEpoch:epoch,binding:leases.find(l=>l.sessionEpoch===epoch)!.binding,accepted:epoch===input.selfSessionEpoch}))};records.set(record.conversationId,record);return structuredClone(record);}),
      change:vi.fn(async input=>{const prev=records.get(input.conversationId)!;const members=prev.members.map(m=>({...m,accepted:m.accepted||(input.action==="accept"&&m.sessionEpoch===input.selfSessionEpoch)}));
        const next:StudioConversationSnapshot={...prev,revisionId:`consent-${Number(prev.revisionId.split("-")[1])+1}`,members,status:input.action==="accept"?(members.every(m=>m.accepted)?"active":"pending"):"revoked",reason:input.action==="accept"?null:input.action==="block"?"blocked":"left"};records.set(next.conversationId,next);return structuredClone(next);}),
      read:vi.fn(async input=>structuredClone(records.get(input.conversationId)!)),
      renew:vi.fn(async input=>{const value={...records.get(input.conversationId)!,leaseRevision:String(Number(input.expectedLeaseRevision)+1),expiresAt:new Date(now+15000).toISOString()};records.set(value.conversationId,value);return structuredClone(value);}),
    };apis.push(api);
    controllers.push(new StudioPrivateRoomController({workId:"work",actorId:`actor-${i}`,world,zoneId:"zone",doorId:"door",binding:leases[i]!.binding},{api,now:()=>now,current:()=>current,canCleanup:()=>current,eligible:()=>eligible,direct:{getPeers:()=>participants.filter(peer=>peer!==p),subscribe(fn){receivers.set(p.sessionId,fn);return()=>receivers.delete(p.sessionId);},send(target,raw){receivers.get(target)?.(p,raw);return true;}}}));
  });
  return {controllers,apis,records,leases,participants,setEligible:(value:boolean)=>{eligible=value;},setCurrent:(value:boolean)=>{current=value;},advance:(ms:number)=>{now+=ms;},
    spoofEpoch(from:number,epoch:string){receivers.get("client-0")?.(participants[from]!,JSON.stringify({wire:"studio-private-room-v1",workId:"work",world:canonicalJson(world),zoneId:"zone",doorEpoch,sessionEpoch:epoch,clientInstanceId:`client-${from}`}));},
    async start(){for(const c of controllers)c.start();await flush();for(const c of controllers)await c.enter();for(const c of controllers)c.tick();await flush();},
    async active(){await this.start();await controllers[0]!.propose(participants.slice(1).map(p=>p.sessionId));const id=controllers[0]!.snapshot().conversations[0]!.conversationId;
      for(const c of controllers.slice(1)){await c.refresh();await c.change(id,"accept");}await controllers[0]!.refresh();return id;},
  };
}
