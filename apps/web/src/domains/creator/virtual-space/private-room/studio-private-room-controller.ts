import { canonicalJson, studioConversationInvalidationSchema, type StudioAcousticSessionLease, type StudioAcousticSessionOpen,
  type StudioAcousticWorldPin, type StudioConversationChange, type StudioConversationSnapshot } from "@toonspectrum/studio-project-model";
import { z } from "zod";
import type { StudioLiveDirectPort } from "../../live/studio-live-direct-port";
import type { StudioTeamSnapshot } from "../../studio-team-client";
import { privateRoomFailure, samePrivatePin, StudioPrivateRoomError, type StudioPrivateDoor, type StudioPrivateRoomApi } from "./studio-private-room-client";

const packet=z.object({wire:z.literal("studio-private-room-v1"),workId:z.string().max(160),world:z.string().max(512),zoneId:z.string().max(160),
  doorEpoch:z.uuid(),sessionEpoch:z.uuid(),clientInstanceId:z.string().max(80),conversationId:z.uuid().optional(),targetSessionEpoch:z.uuid().optional()}).strict();
export interface StudioPrivateContext {
  workId:string;actorId:string;world:StudioAcousticWorldPin;zoneId:string;doorId:string;
  binding:{connectionId:string;clientInstanceId:string};
}
export interface StudioPrivateCandidate { peerId:string;sessionEpoch:string;seenAt:number }
export interface StudioPrivateSnapshot {
  door:StudioPrivateDoor|null;team:StudioTeamSnapshot|null;session:StudioAcousticSessionLease|null;
  conversations:readonly StudioConversationSnapshot[];candidates:readonly StudioPrivateCandidate[];
  busy:boolean;uncertain:boolean;reason:string|null;
  entryPending?:boolean;
}
export interface StudioPrivateDependencies {
  api:StudioPrivateRoomApi;direct:StudioLiveDirectPort;now?:()=>number;randomId?:()=>string;
  /** Current actor, publication, Core binding, visibility and exact zone; checked synchronously. */
  current():boolean;
  canCleanup?():boolean;
  /** Actual current presence geometry. Callers must never use a room-at fallback. */
  eligible(peerIds:readonly string[],stage:"enter"|"active"):boolean;
}
export class StudioPrivateRoomController {
  private readonly listeners=new Set<()=>void>();
  private readonly now:()=>number;
  private readonly randomId:()=>string;
  private owner=0;private closed=false;private pending:AbortController|null=null;private off:()=>void=()=>{};
  private captureVersion=0;
  private readonly peers=new Map<string,StudioPrivateCandidate>();
  private readonly records=new Map<string,StudioConversationSnapshot>();
  private readonly invalidGrants=new Set<string>();
  private readonly terminal=new Set<string>();
  private readonly pendingReads=new Set<string>();
  private readonly expectedRosters=new Map<string,readonly string[]>();
  private readonly unresolvedChanges=new Map<string,StudioConversationChange>();
  private attemptedSessionRenew:string|null=null;
  private readonly attemptedConversationRenew=new Map<string,string>();
  private openIntent:{input:StudioAcousticSessionOpen;key:string}|null=null;
  private nextRead=0;private nextAnnounce=0;private teamUntil=0;private leaseUntil=0;
  private grantUntil=new Map<string,number>();
  private state:StudioPrivateSnapshot={door:null,team:null,session:null,conversations:[],candidates:[],busy:false,uncertain:false,reason:null};
  constructor(readonly context:StudioPrivateContext,private readonly deps:StudioPrivateDependencies){this.now=deps.now??Date.now;this.randomId=deps.randomId??(()=>crypto.randomUUID());}
  snapshot=()=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
  private emit(patch:Partial<StudioPrivateSnapshot>={}){const next={...this.state,...patch};this.state={...next,
    conversations:[...this.records.values()].map(record=>this.terminal.has(record.conversationId)?{...record,status:"revoked",reason:record.reason??"left"}:record),
    candidates:[...this.peers.values()],entryPending:Boolean(this.openIntent&&!next.session)};for(const fn of this.listeners)fn();}
  start(){this.off=this.deps.direct.subscribe((sender,raw)=>this.receive(sender.sessionId,raw));void this.refresh();}
  current=()=>!this.closed&&this.deps.current();
  captureRevision=()=>this.captureVersion;
  /** Same actor publication preserves existing media but fences every unfinished admission and prompt. */
  authRefresh=()=>{++this.owner;++this.captureVersion;this.pending?.abort();this.pending=null;this.emit({busy:false});return this.refresh();};
  private validLease(){const value=this.state.session;return !!value&&this.current()&&this.now()<this.teamUntil&&this.state.door?.open===true
    &&this.state.door.permitted&&this.state.door.epoch===value.doorEpoch&&this.now()<this.leaseUntil&&Date.parse(value.expiresAt)>this.now();}
  mediaValid=(id:string)=>{
    const record=this.records.get(id);
    return this.validLease()&&!!record&&record.status==="active"&&!this.invalidGrants.has(id)&&!this.terminal.has(id)
      &&this.now()<(this.grantUntil.get(id)??0)&&record.members.every(member=>member.accepted)
      &&this.deps.eligible(this.peerIds(record),"active");
  };
  peerIds=(record:StudioConversationSnapshot)=>record.members.filter(member=>member.sessionEpoch!==this.state.session?.sessionEpoch).map(member=>member.binding.clientInstanceId);
  private stopMedia(){for(const id of this.records.keys())this.invalidGrants.add(id);this.emit();}
  private clearAuthority(reason:string){this.openIntent=null;this.stopMedia();this.peers.clear();this.records.clear();this.pendingReads.clear();this.grantUntil.clear();
    this.unresolvedChanges.clear();this.expectedRosters.clear();this.attemptedConversationRenew.clear();this.attemptedSessionRenew=null;
    this.teamUntil=0;this.leaseUntil=0;this.emit({session:null,team:null,door:null,reason});}
  invalidate(reason="context"){++this.owner;this.pending?.abort();this.pending=null;this.clearAuthority(reason);this.emit({busy:false});}
  close(){if(this.closed)return;const epoch=this.state.session?.sessionEpoch;this.closed=true;this.invalidate();this.off();
    // Same actor only. A new account must never send an old actor's cleanup request.
    if(epoch&&(this.deps.canCleanup?.()??this.deps.current()))void this.deps.api.closeSession(epoch,new AbortController().signal).catch(()=>{});}
  private async run(operation:(signal:AbortSignal)=>Promise<void>,mutation=false){
    if(!this.current()||this.pending)return;
    const scope=this.owner,request=new AbortController();this.pending=request;this.emit({busy:true,reason:null});
    try{await operation(request.signal);if(scope===this.owner&&this.current())this.emit({uncertain:this.unresolvedChanges.size>0||Boolean(this.openIntent&&!this.state.session)});}
    catch(error){if(scope!==this.owner||!this.current())return;this.stopMedia();
      const reason=privateRoomFailure(error);if(reason==="access"||reason==="invalid")this.clearAuthority(reason);
      else this.emit({reason,uncertain:mutation||this.state.uncertain});}
    finally{if(this.pending===request){this.pending=null;this.nextRead=this.now()+3000;this.emit({busy:false});}}
  }
  private assertCurrent(signal:AbortSignal){if(signal.aborted||!this.current())throw new Error("context");}
  private applyLease(value:StudioAcousticSessionLease,started:number){
    const c=this.context;
    if(!samePrivatePin(value.world,c.world)||value.zoneId!==c.zoneId||value.doorId!==c.doorId
      ||value.binding.connectionId!==c.binding.connectionId||value.binding.clientInstanceId!==c.binding.clientInstanceId
      ||value.doorEpoch!==this.state.door?.epoch||Date.parse(value.expiresAt)<=this.now()
      ||(this.state.session&&this.state.session.sessionEpoch!==value.sessionEpoch))throw new StudioPrivateRoomError("invalid");
    this.leaseUntil=Math.min(started+15000,Date.parse(value.expiresAt));this.emit({session:value});
  }
  private applyRecord(value:StudioConversationSnapshot,started:number){
    const own=this.state.session,self=value.members.find(member=>member.sessionEpoch===own?.sessionEpoch);
    const expected=this.expectedRosters.get(value.conversationId);
    if(expected&&canonicalJson([...expected].sort())!==canonicalJson(value.members.map(member=>member.binding.clientInstanceId).sort()))throw new StudioPrivateRoomError("invalid");
    if(!own||!self||canonicalJson(self.binding)!==canonicalJson(own.binding)||!samePrivatePin(value.world,this.context.world)
      ||value.zoneId!==own.zoneId||value.doorId!==own.doorId||value.doorEpoch!==own.doorEpoch)throw new StudioPrivateRoomError("invalid");
    const previous=this.records.get(value.conversationId);
    if(previous&&canonicalJson(previous.members.map(({accepted:_,...member})=>member))!==canonicalJson(value.members.map(({accepted:_,...member})=>member)))throw new StudioPrivateRoomError("invalid");
    const unresolved=this.unresolvedChanges.get(value.conversationId);
    if(unresolved&&(value.status==="revoked"||(unresolved.action==="accept"&&(self.accepted||value.revisionId!==unresolved.expectedRevisionId))))this.unresolvedChanges.delete(value.conversationId);
    if(this.terminal.has(value.conversationId)&&value.status!=="revoked")return;
    if(value.status==="revoked"){this.terminal.add(value.conversationId);this.invalidGrants.add(value.conversationId);}
    else if(Date.parse(value.expiresAt)<=this.now())throw new StudioPrivateRoomError("invalid");
    else if(this.deps.eligible(this.peerIds(value),value.status==="active"?"active":"enter"))this.invalidGrants.delete(value.conversationId);
    else this.invalidGrants.add(value.conversationId);
    this.records.set(value.conversationId,value);this.grantUntil.set(value.conversationId,Math.min(started+15000,Date.parse(value.expiresAt)));
    if(this.records.size>24)for(const [id,item]of this.records){if(item.status==="revoked"){this.records.delete(id);this.grantUntil.delete(id);break;}}
    this.emit();
  }
  refresh=()=>this.run(async signal=>{
    const started=this.now(),[door,team]=await Promise.all([this.deps.api.door(signal),this.deps.api.team(signal)]);this.assertCurrent(signal);
    if(!samePrivatePin(door.world,this.context.world)||door.zoneId!==this.context.zoneId||door.doorId!==this.context.doorId
      ||team.workId!==this.context.workId||team.viewer.userId!==this.context.actorId||team.viewer.status!=="active"||!team.viewer.capabilities.view)throw new StudioPrivateRoomError("invalid");
    if(started+15000<=this.now())throw new StudioPrivateRoomError("invalid");
    if(this.state.door?.epoch!==door.epoch)this.stopMedia();
    this.teamUntil=started+15000;this.emit({door,team});
    if(this.openIntent&&!this.state.session){const lease=await this.deps.api.readOpen(this.openIntent.input,this.openIntent.key,signal);this.assertCurrent(signal);if(lease)this.applyLease(lease,started);}
    else if(this.state.session){const lease=await this.deps.api.readSession(this.state.session.sessionEpoch,signal);this.assertCurrent(signal);this.applyLease(lease,started);}
    const own=this.state.session;if(!own)return;
    for(const id of new Set([...this.pendingReads,...this.records.keys()])){
      if(this.records.get(id)?.status==="revoked")continue;
      const value=await this.deps.api.read({conversationId:id,selfSessionEpoch:own.sessionEpoch},signal);this.assertCurrent(signal);this.applyRecord(value,started);this.pendingReads.delete(id);
    }
  });
  enter=()=>this.run(async signal=>{
    const door=this.state.door;if(!door?.open||!door.permitted||!door.epoch||this.teamUntil<=this.now()||this.openIntent||this.state.session||!this.deps.eligible([],"enter"))return;
    const input:StudioAcousticSessionOpen={world:this.context.world,zoneId:this.context.zoneId,doorEpoch:door.epoch,...this.context.binding,expectedSessionEpoch:null};
    this.openIntent={input,key:this.randomId()};const started=this.now();
    const lease=await this.deps.api.open(input,this.openIntent.key,signal);this.assertCurrent(signal);this.applyLease(lease,started);
  },true);
  /** Only an explicit user retry may resend the byte-identical open intent. */
  retryEntry=()=>this.run(async signal=>{
    const intent=this.openIntent,door=this.state.door;
    if(!intent||this.state.session||!door?.open||!door.permitted||door.epoch!==intent.input.doorEpoch||this.teamUntil<=this.now()
      ||!this.deps.eligible([],"enter"))return;
    const started=this.now(),lease=await this.deps.api.open(intent.input,intent.key,signal);this.assertCurrent(signal);this.applyLease(lease,started);
  },true);
  changeDoor=(open:boolean,allowedUserIds:readonly string[])=>this.run(async signal=>{
    if(!this.state.team?.viewer.capabilities.manageMembers||!this.state.door||this.teamUntil<=this.now())return;
    const input={world:this.context.world,zoneId:this.context.zoneId,expectedDoorEpoch:this.state.door.epoch,open,allowedUserIds:[...new Set(allowedUserIds)]};
    this.stopMedia();await this.deps.api.changeDoor(input,this.randomId(),signal);this.assertCurrent(signal);
    this.clearAuthority("door-changed");
  },true);
  propose=(peerIds:readonly string[])=>this.run(async signal=>{
    if(!this.validLease()||peerIds.length<1||peerIds.length>3||new Set(peerIds).size!==peerIds.length||!this.deps.eligible(peerIds,"enter")||this.state.uncertain)return;
    const selected=peerIds.map(id=>this.peers.get(id));if(selected.some(value=>!value||this.now()-value.seenAt>5000))return;
    const own=this.state.session!,id=this.randomId();this.pendingReads.add(id);this.expectedRosters.set(id,[own.binding.clientInstanceId,...peerIds]);const started=this.now();
    const value=await this.deps.api.propose({conversationId:id,selfSessionEpoch:own.sessionEpoch,memberSessionEpochs:[own.sessionEpoch,...selected.map(value=>value!.sessionEpoch)],
      expectedMembers:[{sessionEpoch:own.sessionEpoch,clientInstanceId:own.binding.clientInstanceId},...selected.map(value=>({sessionEpoch:value!.sessionEpoch,clientInstanceId:value!.peerId}))]},this.randomId(),signal);
    this.assertCurrent(signal);this.applyRecord(value,started);this.pendingReads.delete(id);this.announce();
  },true);
  change=(id:string,action:StudioConversationChange["action"],targetSessionEpoch?:string)=>{
    // A manual withdrawal wins over an in-flight read/renew before the network busy gate.
    if(action!=="accept"&&this.records.has(id)){
      ++this.owner;this.pending?.abort();this.pending=null;this.terminal.add(id);this.invalidGrants.add(id);this.emit({busy:false});
    }
    return this.run(async signal=>{
    const record=this.records.get(id),own=this.state.session;
    if(!own||!record||record.status==="revoked"||(action==="accept"&&this.state.uncertain))return;
    if(action==="accept"&&(!this.validLease()||!this.deps.eligible(this.peerIds(record),"enter")))return;
    const input:StudioConversationChange={conversationId:id,selfSessionEpoch:own.sessionEpoch,expectedRevisionId:record.revisionId,action,...(targetSessionEpoch?{targetSessionEpoch}:{})};
    this.unresolvedChanges.set(id,input);
    const started=this.now(),value=await this.deps.api.change(input,this.randomId(),signal);
    this.assertCurrent(signal);this.applyRecord(value,started);
    },true);
  };
  leave=()=>{const epoch=this.state.session?.sessionEpoch;this.invalidate("left");this.openIntent=null;this.records.clear();this.pendingReads.clear();this.emit();
    if(epoch&&(this.deps.canCleanup?.()??this.deps.current()))void this.deps.api.closeSession(epoch,new AbortController().signal).catch(()=>{if(this.current())this.emit({reason:"unavailable"});});};
  hint=(raw:unknown)=>{const parsed=studioConversationInvalidationSchema.safeParse(raw),own=this.state.session;
    if(!parsed.success||parsed.data.workId!==this.context.workId||parsed.data.selfSessionEpoch!==own?.sessionEpoch||this.pendingReads.size>=24)return;
    this.invalidGrants.add(parsed.data.conversationId);this.pendingReads.add(parsed.data.conversationId);this.emit();this.nextRead=0;void this.refresh();};
  private receive(peerId:string,raw:string){if(raw.length>1500||!this.validLease())return;
    let data:unknown;try{data=JSON.parse(raw);}catch{return;}const parsed=packet.safeParse(data);if(!parsed.success)return;
    const p=parsed.data;if(p.workId!==this.context.workId||p.world!==canonicalJson(this.context.world)||p.zoneId!==this.context.zoneId||p.doorEpoch!==this.state.session?.doorEpoch
      ||p.clientInstanceId!==peerId||!this.deps.direct.getPeers().some(peer=>peer.sessionId===peerId)||!this.deps.eligible([peerId],"enter"))return;
    if(this.peers.size<24||this.peers.has(peerId))this.peers.set(peerId,{peerId,sessionEpoch:p.sessionEpoch,seenAt:this.now()});
    if(p.conversationId&&p.targetSessionEpoch===this.state.session?.sessionEpoch&&!this.records.has(p.conversationId)&&this.pendingReads.size<24){this.pendingReads.add(p.conversationId);this.nextRead=0;}
    this.emit();}
  private announce(){const own=this.state.session;if(!own||!this.validLease())return;
    const base={wire:"studio-private-room-v1",workId:this.context.workId,world:canonicalJson(this.context.world),zoneId:this.context.zoneId,doorEpoch:own.doorEpoch,sessionEpoch:own.sessionEpoch,clientInstanceId:own.binding.clientInstanceId};
    for(const peer of this.deps.direct.getPeers())if(this.deps.eligible([peer.sessionId],"enter"))this.deps.direct.send(peer.sessionId,JSON.stringify(base));
    for(const record of this.records.values())if(record.status==="pending")for(const member of record.members)if(member.sessionEpoch!==own.sessionEpoch)this.deps.direct.send(member.binding.clientInstanceId,JSON.stringify({...base,conversationId:record.conversationId,targetSessionEpoch:member.sessionEpoch}));
  }
  tick=()=>{
    if(!this.current()){if(this.state.session||this.state.team)this.leave();return;}
    const now=this.now();if(this.teamUntil&&now>=this.teamUntil){this.teamUntil=0;this.emit({team:null,door:null});}
    for(const [id,peer]of this.peers)if(now-peer.seenAt>5000||!this.deps.eligible([id],"enter"))this.peers.delete(id);
    for(const [id,value]of this.records)if(value.status!=="revoked"&&value.status==="active"){
      if(!this.deps.eligible(this.peerIds(value),"active")){this.terminal.add(id);this.leave();this.emit({reason:"boundary"});return;}
      // Once a live audience crosses its boundary, a late read cannot restart capture or consent.
      if(!this.mediaValid(id)&&!this.invalidGrants.has(id)){this.terminal.add(id);this.leave();this.emit({reason:"boundary"});return;}
    }
    if(this.state.session&&(!this.validLease()||!this.deps.eligible([],"active"))){this.leave();this.emit({reason:"expired"});return;}
    if(now>=this.nextAnnounce){this.nextAnnounce=now+2000;this.announce();this.emit();}
    if(this.pending)return;
    const renewalCas=this.state.session?`${this.state.session.sessionEpoch}:${this.state.session.leaseRevision}`:null;
    if(this.state.session&&this.leaseUntil-now<=7500&&!this.state.uncertain&&this.attemptedSessionRenew!==renewalCas){void this.run(async signal=>{
      const started=this.now(),own=this.state.session!;this.attemptedSessionRenew=renewalCas;
      const lease=await this.deps.api.renewSession({sessionEpoch:own.sessionEpoch,expectedLeaseRevision:own.leaseRevision},signal);this.assertCurrent(signal);this.applyLease(lease,started);
      for(const record of this.records.values())if(record.status==="active"&&record.leaseRevision&&!this.invalidGrants.has(record.conversationId)){
        const cas=`${record.revisionId}:${record.leaseRevision}`;if(this.attemptedConversationRenew.get(record.conversationId)===cas)continue;
        this.attemptedConversationRenew.set(record.conversationId,cas);
        const value=await this.deps.api.renew({conversationId:record.conversationId,selfSessionEpoch:own.sessionEpoch,expectedRevisionId:record.revisionId,expectedLeaseRevision:record.leaseRevision},signal);this.assertCurrent(signal);this.applyRecord(value,started);}
    },true);return;}
    if(now>=this.nextRead)void this.refresh();
  };
}
