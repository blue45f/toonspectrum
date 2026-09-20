import { canonicalJson } from "@toonspectrum/studio-project-model";
import { studioAcousticSessionLeaseSchema, studioAcousticWorldPinSchema, type StudioAcousticDoorChange, type StudioAcousticSessionLease, type StudioAcousticSessionOpen, type StudioAcousticSessionRenew, type StudioAcousticWorldPin } from "@toonspectrum/studio-project-model/world-acoustic";
import { studioConversationSnapshotSchema, type StudioConversationChange, type StudioConversationPropose, type StudioConversationRead, type StudioConversationRenew, type StudioConversationSnapshot } from "@toonspectrum/studio-project-model/world-conversation";
import { z } from "zod";
import { api, httpStatus } from "@/infrastructure/api";
import { getStudioTeam, type StudioTeamSnapshot } from "../../studio-team-client";

const id = z.string().min(1).max(160);
export const studioPrivateDoorSchema = z.object({ world:studioAcousticWorldPinSchema, zoneId:id, doorId:id,
  epoch:z.uuid().nullable(), open:z.boolean(), permitted:z.boolean(), allowedUserIds:z.array(id).max(24).optional() }).strict();
export type StudioPrivateDoor = z.infer<typeof studioPrivateDoorSchema>;
export class StudioPrivateRoomError extends Error {
  constructor(readonly reason:"invalid"|"access"|"conflict"|"unavailable") { super(reason); }
}
export function privateRoomFailure(error:unknown) {
  if(error instanceof StudioPrivateRoomError)return error.reason;
  const status=httpStatus(error);
  return status===401||status===403||status===404 ? "access" : status===409 ? "conflict" : status===422 ? "invalid" : "unavailable";
}
export const samePrivatePin=(a:StudioAcousticWorldPin,b:StudioAcousticWorldPin)=>canonicalJson(a)===canonicalJson(b);
export function parseStudioPrivateLease(raw:unknown):StudioAcousticSessionLease {
  const parsed=studioAcousticSessionLeaseSchema.safeParse(raw);
  if(!parsed.success)throw new StudioPrivateRoomError("invalid");
  return parsed.data;
}
export function parseStudioPrivateConversation(raw:unknown):StudioConversationSnapshot {
  const parsed=z.object({conversation:studioConversationSnapshotSchema,replayed:z.boolean()}).strict().safeParse(raw);
  if(!parsed.success)throw new StudioPrivateRoomError("invalid");
  const value=parsed.data.conversation;
  if(new Set(value.members.map(member=>member.sessionEpoch)).size!==value.members.length
    ||new Set(value.members.map(member=>member.binding.connectionId)).size!==value.members.length
    ||new Set(value.members.map(member=>member.binding.clientInstanceId)).size!==value.members.length
    ||(value.status==="active"&&(!value.members.every(member=>member.accepted)||!value.leaseRevision||value.reason!==null))
    ||(value.status==="revoked"&&value.reason===null))throw new StudioPrivateRoomError("invalid");
  return value;
}
export interface StudioPrivateRoomApi {
  door(signal:AbortSignal):Promise<StudioPrivateDoor>;
  team(signal:AbortSignal):Promise<StudioTeamSnapshot>;
  changeDoor(input:StudioAcousticDoorChange,key:string,signal:AbortSignal):Promise<void>;
  open(input:StudioAcousticSessionOpen,key:string,signal:AbortSignal):Promise<StudioAcousticSessionLease>;
  readOpen(input:StudioAcousticSessionOpen,key:string,signal:AbortSignal):Promise<StudioAcousticSessionLease|null>;
  readSession(epoch:string,signal:AbortSignal):Promise<StudioAcousticSessionLease>;
  renewSession(input:StudioAcousticSessionRenew,signal:AbortSignal):Promise<StudioAcousticSessionLease>;
  closeSession(epoch:string,signal:AbortSignal):Promise<void>;
  propose(input:StudioConversationPropose,key:string,signal:AbortSignal):Promise<StudioConversationSnapshot>;
  change(input:StudioConversationChange,key:string,signal:AbortSignal):Promise<StudioConversationSnapshot>;
  read(input:StudioConversationRead,signal:AbortSignal):Promise<StudioConversationSnapshot>;
  renew(input:StudioConversationRenew,signal:AbortSignal):Promise<StudioConversationSnapshot>;
}
export function createStudioPrivateRoomApi(workId:string,zoneId:string):StudioPrivateRoomApi {
  const path=`/studio-project-graph/works/${encodeURIComponent(workId)}/acoustic`;
  const post=(suffix:string,input:unknown,signal:AbortSignal,key?:string)=>api.post<unknown>(`${path}/${suffix}`,input,
    {signal,retry:0,cache:"no-store",...(key?{headers:{"Idempotency-Key":key}}:{})});
  return {
    async door(signal){const raw=await api.get<unknown>(`${path}/zones/${encodeURIComponent(zoneId)}/door`,{signal,retry:0,cache:"no-store"});
      const parsed=studioPrivateDoorSchema.safeParse(raw);if(!parsed.success)throw new StudioPrivateRoomError("invalid");return parsed.data;},
    team:signal=>getStudioTeam(workId,signal),
    async changeDoor(input,key,signal){await post("door",input,signal,key);},
    async open(input,key,signal){return parseStudioPrivateLease(await post("sessions/open",input,signal,key));},
    async readOpen(input,key,signal){const parsed=z.object({lease:studioAcousticSessionLeaseSchema.nullable()}).strict().safeParse(await post("sessions/read-open-intent",input,signal,key));
      if(!parsed.success)throw new StudioPrivateRoomError("invalid");return parsed.data.lease;},
    async readSession(sessionEpoch,signal){return parseStudioPrivateLease(await post("sessions/read",{sessionEpoch},signal));},
    async renewSession(input,signal){return parseStudioPrivateLease(await post("sessions/renew",input,signal));},
    async closeSession(sessionEpoch,signal){await post("sessions/close",{sessionEpoch},signal);},
    async propose(input,key,signal){return parseStudioPrivateConversation(await post("conversations/propose",input,signal,key));},
    async change(input,key,signal){return parseStudioPrivateConversation(await post("conversations/change",input,signal,key));},
    async read(input,signal){return parseStudioPrivateConversation(await post("conversations/read",input,signal));},
    async renew(input,signal){return parseStudioPrivateConversation(await post("conversations/renew",input,signal));},
  };
}
