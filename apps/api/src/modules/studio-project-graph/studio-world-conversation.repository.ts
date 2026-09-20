import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { canonicalJson, STUDIO_ACOUSTIC_INVITATION_MS, STUDIO_ACOUSTIC_MAX_CONVERSATIONS, STUDIO_ACOUSTIC_RESOURCE_PREFIX,
  STUDIO_WORLD_ARTIFACT_PREFIX, studioConversationSnapshotSchema, studioConversationProposeSchema, type StudioConversationSnapshot, type StudioConversationReason,
  type StudioConversationPropose, type StudioConversationRead, type StudioConversationChange, type StudioConversationRenew } from "@toonspectrum/studio-project-model";
import type { PoolClient } from "pg";
import type { VerifiedSessionToken } from "../../server/session";
import { StudioProjectForbiddenError, StudioProjectNotFoundError, StudioIdempotencyConflictError, studioRequestHash as hash } from "./studio-project-graph.repository";
import { StudioAcousticAuthorityError, studioAcousticTransaction, lockStudioAcousticWork, assertStudioAcousticAccess, nextStudioAcousticClock,
  loadStudioAcousticParticipant, type StudioAcousticParticipant } from "./studio-world-acoustic.repository";

const COMMAND="studio.world.acoustic-conversation", DEVICE="studio-acoustic-conversation-v1";
const PREFIX=STUDIO_ACOUSTIC_RESOURCE_PREFIX+"conversation:";
const same=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b);
const artifactFor=(workId:string)=>STUDIO_WORLD_ARTIFACT_PREFIX+hash(workId);
const privateMemberSchema=studioConversationSnapshotSchema.shape.members.element.extend({actor:z.string(),sessionVersion:z.number().int().positive(),authorityFence:z.string()}).strict();
const stateSchema=studioConversationSnapshotSchema.omit({leaseRevision:true}).extend({contract:z.literal("studio-acoustic-conversation-v1"),workId:z.string(),
  members:z.array(privateMemberSchema).min(2).max(4),sequence:z.number().int().positive(),parentRevisionId:z.string(),changedBy:z.string(),changedAt:z.string().datetime(),
  invitationExpiresAt:z.string().datetime(),blockedPair:z.tuple([z.uuid(),z.uuid()]).nullable(),input:z.record(z.string(),z.unknown())}).strict();
type State=z.infer<typeof stateSchema>;
export type StudioConversationContext={state:State;snapshot:StudioConversationSnapshot;participants:StudioAcousticParticipant[];replayed?:boolean;mutated?:boolean};
type MutationInput=Record<string,unknown>;
const fail=(reason:ConstructorParameters<typeof StudioAcousticAuthorityError>[0]):never=>{throw new StudioAcousticAuthorityError(reason);};
type Observation={revision:string;expiresAt:Date};
function snapshot(state:State,observation?:Observation):StudioConversationSnapshot {
  return studioConversationSnapshotSchema.parse({kind:state.kind,conversationId:state.conversationId,revisionId:state.revisionId,world:state.world,
    zoneId:state.zoneId,doorId:state.doorId,doorEpoch:state.doorEpoch,status:state.status,expiresAt:observation?.expiresAt.toISOString()??state.expiresAt,reason:state.reason,leaseRevision:observation?.revision??null,
    members:state.members.map(({sessionEpoch,binding,accepted})=>({sessionEpoch,binding,accepted}))});
}
async function load(client:PoolClient,workId:string,conversationId:string):Promise<State|null> {
  const result=await client.query<{state:unknown;response:unknown;requestHash:string;actor:string;device:string;sequence:string;revisionId:string;parent:string;payload:unknown;payloadHash:string;receiptActor:string;receiptRevision:string;rootHash:string;kind:string;revisionActor:string;revisionDevice:string;first:string;last:string;parents:string[];scope:unknown;projectId:string;createdAt:Date}>(
    `SELECT operation.operation->'state' AS state,operation.operation->'payload' AS payload,operation."payloadHash",operation."actorUserId" AS actor,operation."deviceId" AS device,
      operation.sequence::text,operation."resultRevisionId" AS "revisionId",operation."baseRevisionId" AS parent,operation.scope,artifact."projectId",
      receipt.response,receipt."requestHash",receipt."actorUserId" AS "receiptActor",receipt."resultRevisionId" AS "receiptRevision",revision."rootGraphHash" AS "rootHash",revision.kind,
      revision."createdBy" AS "revisionActor",revision."deviceId" AS "revisionDevice",revision."operationFirst"::text AS first,revision."operationLast"::text AS last,revision."createdAt",
      ARRAY(SELECT "parentRevisionId" FROM studio_revision_parent WHERE "revisionId"=revision.id ORDER BY ordinal) AS parents
     FROM studio_operation operation JOIN studio_artifact artifact ON artifact.id=operation."artifactId"
     JOIN studio_revision revision ON revision.id=operation."resultRevisionId" AND revision."artifactId"=artifact.id
     LEFT JOIN studio_mutation_receipt receipt ON receipt."artifactId"=artifact.id AND receipt."actorUserId"=operation."actorUserId" AND receipt."idempotencyKeyHash"=operation.operation->>'receiptKey'
     WHERE artifact.id=$1 AND operation."commandType"=$2 AND operation.operation->'state'->>'conversationId'=$3 ORDER BY operation.sequence DESC LIMIT 1`,[artifactFor(workId),COMMAND,conversationId]);
  const row=result.rows[0];if(!row)return null;
  const parsed=stateSchema.safeParse(row.state);if(!parsed.success)return fail("proof");const state=parsed.data;
  if(state.workId!==workId||state.conversationId!==conversationId||state.revisionId!==row.revisionId||state.parentRevisionId!==row.parent||row.parents.length!==1||row.parents[0]!==row.parent
    ||state.changedBy!==row.actor||row.receiptActor!==row.actor||row.revisionActor!==row.actor||row.receiptRevision!==row.revisionId||row.kind!=="checkpoint"||row.device!==DEVICE||row.revisionDevice!==DEVICE
    ||state.sequence!==Number(row.sequence)||row.first!==row.sequence||row.last!==row.sequence||state.changedAt!==row.createdAt.toISOString()||row.rootHash!==hash(state)
    ||!same(row.response,state)||!same(row.payload,state.input)||row.payloadHash!==hash(state.input)||row.requestHash!==hash({workId,input:state.input})||!same(row.scope,{projectId:row.projectId}))return fail("proof");
  return state;
}
async function append(client:PoolClient,workId:string,actor:string,base:Omit<State,"revisionId"|"sequence"|"changedBy"|"changedAt"|"input">,input:MutationInput,key:string):Promise<State>{
  const artifactId=artifactFor(workId),receiptKey=hash({phase:"acoustic-conversation",key});
  const artifact=await client.query<{projectId:string}>('SELECT "projectId" FROM studio_artifact WHERE id=$1 FOR UPDATE',[artifactId]);
  if(!artifact.rows[0])throw new StudioProjectNotFoundError("artifact");
  const sequence=Number((await client.query<{next:string}>('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM studio_operation WHERE "artifactId"=$1',[artifactId])).rows[0]!.next);
  const now=(await client.query<{now:Date}>('SELECT statement_timestamp() AS now')).rows[0]!.now.toISOString();
  const state:State={...base,revisionId:`acoustic-conversation-${randomUUID()}`,sequence,changedBy:actor,changedAt:now,input};
  await client.query(`INSERT INTO studio_revision (id,"artifactId",kind,"rootGraphHash","operationFirst","operationLast","createdBy","deviceId","createdAt") VALUES ($1,$2,'checkpoint',$3,$4,$4,$5,$6,$7)`,[state.revisionId,artifactId,hash(state),sequence,actor,DEVICE,now]);
  await client.query('INSERT INTO studio_revision_parent ("revisionId","parentRevisionId",ordinal) VALUES ($1,$2,0)',[state.revisionId,state.parentRevisionId]);
  await client.query(`INSERT INTO studio_operation ("artifactId",sequence,"commandId","baseRevisionId","resultRevisionId","actorUserId","deviceId","commandType",scope,"payloadHash",operation,"issuedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12)`,[artifactId,sequence,randomUUID(),state.parentRevisionId,state.revisionId,actor,DEVICE,COMMAND,JSON.stringify({projectId:artifact.rows[0]!.projectId}),hash(input),JSON.stringify({payload:input,state,receiptKey}),now]);
  await client.query(`INSERT INTO studio_mutation_receipt ("artifactId","actorUserId","idempotencyKeyHash","requestHash","resultRevisionId",response) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,[artifactId,actor,receiptKey,hash({workId,input}),state.revisionId,JSON.stringify(state)]);
  await client.query('DELETE FROM creator_work_live_lock WHERE "workId"=$1 AND "resourceId"=$2',[workId,PREFIX+state.conversationId]);
  if(state.status!=="revoked") await client.query(`INSERT INTO creator_work_live_lock ("workId","resourceId","leaseId","acquisitionId","ownerConnectionId","ownerName",revision,"expiresAt") VALUES ($1,$2,$3,$4,$5,'Acoustic conversation',$6,$7)`,[workId,PREFIX+state.conversationId,state.conversationId,receiptKey,state.members[0]!.binding.connectionId,await nextStudioAcousticClock(client,workId),state.expiresAt]);
  else await nextStudioAcousticClock(client,workId);
  return state;
}
async function retry(client:PoolClient,actor:string,workId:string,input:MutationInput,key:string):Promise<boolean>{
  const row=(await client.query<{requestHash:string}>('SELECT "requestHash" FROM studio_mutation_receipt WHERE "artifactId"=$1 AND "actorUserId"=$2 AND "idempotencyKeyHash"=$3',[artifactFor(workId),actor,hash({phase:"acoustic-conversation",key})])).rows[0];
  if(!row)return false;if(row.requestHash!==hash({workId,input}))throw new StudioIdempotencyConflictError();return true;
}
function self(state:State,principal:VerifiedSessionToken,selfEpoch:string){
  const member=state.members.find(item=>item.sessionEpoch===selfEpoch);
  if(!member||member.actor!==principal.userId||member.sessionVersion!==principal.sessionVersion)throw new StudioProjectForbiddenError("view");return member;
}
async function blocked(client:PoolClient,workId:string,members:ReadonlyArray<{sessionEpoch:string;actor:string}>):Promise<boolean>{
  const epochs=members.map(member=>member.sessionEpoch);
  const rows=await client.query<{id:string}>(`SELECT DISTINCT operation->'state'->>'conversationId' AS id FROM studio_operation WHERE "artifactId"=$1 AND "commandType"=$2 AND operation->'state'->>'reason'='blocked' AND operation->'state'->'blockedPair'->>0=ANY($3::text[])`,[artifactFor(workId),COMMAND,epochs]);
  for(const row of rows.rows){
    const state=await load(client,workId,row.id);if(!state||state.reason!=="blocked"||!state.blockedPair)return fail("proof");
    // The blocker owns the visit epoch; the blocked actor comes only from the
    // original verified roster, so their reconnect/other tab cannot clear it.
    const target=state.members.find(member=>member.sessionEpoch===state.blockedPair![1]);if(!target)return fail("proof");
    if(epochs.includes(state.blockedPair[0])&&members.some(member=>member.actor===target.actor))return true;
  }return false;
}
async function terminal(client:PoolClient,actor:string,state:State,reason:StudioConversationReason):Promise<State>{
  if(state.status==="revoked")return state;
  return append(client,state.workId,actor,{...state,parentRevisionId:state.revisionId,status:"revoked",reason,expiresAt:state.expiresAt},
    {action:"invalidate",conversationId:state.conversationId,previousRevisionId:state.revisionId,reason,world:state.world,zoneId:state.zoneId},`invalidate:${state.conversationId}:${state.revisionId}:${reason}`);
}
async function observe(client:PoolClient,state:State){
  return (await client.query<Observation&{live:boolean;acquisitionId:string}>(`SELECT "expiresAt">statement_timestamp() AS live,"expiresAt",revision::text,"acquisitionId" FROM creator_work_live_lock WHERE "workId"=$1 AND "resourceId"=$2 AND "leaseId"=$3 AND "ownerConnectionId"=$4`,[state.workId,PREFIX+state.conversationId,state.conversationId,state.members[0]!.binding.connectionId])).rows[0];
}
async function valid(client:PoolClient,actor:string,state:State):Promise<{state:State;participants:StudioAcousticParticipant[];observation?:Observation}>{
  if(state.status==="revoked")return {state,participants:[]};
  const row=await observe(client,state);
  if(!row?.live)return {state:await terminal(client,actor,state,"expired"),participants:[]};
  const proof=await client.query('SELECT 1 FROM studio_mutation_receipt WHERE "artifactId"=$1 AND "actorUserId"=$2 AND "idempotencyKeyHash"=$3 AND "resultRevisionId"=$4',[artifactFor(state.workId),state.changedBy,row.acquisitionId,state.revisionId]);
  if(!proof.rowCount)return fail("proof");
  const participants:StudioAcousticParticipant[]=[];
  try{
    for(const member of state.members){const current=await loadStudioAcousticParticipant(client,state.workId,member.sessionEpoch);
      if(current.actor!==member.actor||current.sessionVersion!==member.sessionVersion||current.authorityFence!==member.authorityFence||!same(current.binding,member.binding)||!same(current.world,state.world)||current.zoneId!==state.zoneId||current.doorEpoch!==state.doorEpoch)throw new StudioAcousticAuthorityError("stale");
      participants.push(current);
    }
    if(await blocked(client,state.workId,state.members))return {state:await terminal(client,actor,state,"blocked"),participants:[]};
  }catch(error){if(error instanceof StudioAcousticAuthorityError&&error.reason==="proof")throw error;
    if(!(error instanceof StudioAcousticAuthorityError)&&!(error instanceof StudioProjectForbiddenError)&&!(error instanceof StudioProjectNotFoundError))throw error;
    return {state:await terminal(client,actor,state,"authority_lost"),participants:[]};}
  if(state.status==="pending"&&row.expiresAt.toISOString()!==state.invitationExpiresAt)return fail("proof");
  // A participant's own renewed cookie may shorten their lease. Never advertise a
  // cached conversation lifetime beyond any current verified participant lease.
  const expiresAt=state.status==="active"?new Date(Math.min(row.expiresAt.getTime(),...participants.map(member=>Date.parse(member.expiresAt)))):row.expiresAt;
  return {state,participants,observation:{...row,expiresAt}};
}
const result=(state:State,participants:StudioAcousticParticipant[],replayed=false,observation?:Observation):StudioConversationContext=>({state,snapshot:snapshot(state,observation),participants,replayed});

@Injectable()
export class StudioWorldConversationRepository {
  async prepare(principal:VerifiedSessionToken,workId:string,input:StudioConversationPropose):Promise<StudioAcousticParticipant[]>{
    const parsed=studioConversationProposeSchema.parse(input);
    return studioAcousticTransaction(async client=>{await lockStudioAcousticWork(client,workId);await assertStudioAcousticAccess(client,principal,workId,"view");return this.participants(client,principal,workId,parsed);});
  }
  private async participants(client:PoolClient,principal:VerifiedSessionToken,workId:string,input:StudioConversationPropose){
    const participants:StudioAcousticParticipant[]=[];for(const epoch of input.memberSessionEpochs)participants.push(await loadStudioAcousticParticipant(client,workId,epoch));
    const own=participants.find(member=>member.sessionEpoch===input.selfSessionEpoch);if(!own||own.actor!==principal.userId||own.sessionVersion!==principal.sessionVersion)throw new StudioProjectForbiddenError("view");
    const first=participants[0]!;if(new Set(participants.map(member=>member.actor)).size!==participants.length)return fail("binding");
    if(input.expectedMembers&&participants.some(member=>!input.expectedMembers!.some(expected=>expected.sessionEpoch===member.sessionEpoch&&expected.clientInstanceId===member.binding.clientInstanceId)))return fail("binding");
    if(participants.some(member=>!same(member.world,first.world)||member.zoneId!==first.zoneId||member.doorEpoch!==first.doorEpoch))return fail("closed");
    if(await blocked(client,workId,participants))return fail("closed");return participants;
  }
  async propose(principal:VerifiedSessionToken,workId:string,raw:StudioConversationPropose,key:string):Promise<StudioConversationContext>{
    const parsed=studioConversationProposeSchema.parse(raw);
    const input={action:"propose",...parsed,memberSessionEpochs:[...parsed.memberSessionEpochs].sort(),
      ...(parsed.expectedMembers?{expectedMembers:[...parsed.expectedMembers].sort((a,b)=>a.sessionEpoch.localeCompare(b.sessionEpoch))}:{})};
    return studioAcousticTransaction(async client=>{await lockStudioAcousticWork(client,workId);await assertStudioAcousticAccess(client,principal,workId,"view");
      if(await retry(client,principal.userId,workId,input,key)){const state=await load(client,workId,input.conversationId);if(!state)return fail("proof");self(state,principal,input.selfSessionEpoch);const current=await valid(client,principal.userId,state);return result(current.state,current.participants,true,current.observation);}
      if(await load(client,workId,input.conversationId))return fail("stale");
      const participants=await this.participants(client,principal,workId,input),first=participants[0]!;
      const count=await client.query<{count:number}>(`SELECT count(*)::int AS count FROM creator_work_live_lock WHERE "workId"=$1 AND "resourceId" LIKE $2 AND "expiresAt">statement_timestamp()`,[workId,PREFIX+"%"]);
      if(count.rows[0]!.count>=STUDIO_ACOUSTIC_MAX_CONVERSATIONS)return fail("limit");
      const expiresAt=(await client.query<{expires:Date}>(`SELECT statement_timestamp()+($1*interval '1 millisecond') AS expires`,[STUDIO_ACOUSTIC_INVITATION_MS])).rows[0]!.expires.toISOString();
      const state=await append(client,workId,principal.userId,{kind:"acoustic-conversation-consent",contract:"studio-acoustic-conversation-v1",workId,conversationId:input.conversationId,
        world:first.world,zoneId:first.zoneId,doorId:first.doorId,doorEpoch:first.doorEpoch,status:"pending",reason:null,blockedPair:null,
        parentRevisionId:first.world.revisionId,expiresAt,invitationExpiresAt:expiresAt,members:participants.map(member=>({actor:member.actor,sessionVersion:member.sessionVersion,authorityFence:member.authorityFence,sessionEpoch:member.sessionEpoch,binding:member.binding,accepted:member.sessionEpoch===input.selfSessionEpoch}))},input,key);
      return result(state,participants,false,await observe(client,state));
    });
  }
  async current(principal:VerifiedSessionToken,workId:string,input:StudioConversationRead):Promise<StudioConversationContext>{
    return studioAcousticTransaction(async client=>{await lockStudioAcousticWork(client,workId);await assertStudioAcousticAccess(client,principal,workId,"view");
      const state=await load(client,workId,input.conversationId);if(!state)throw new StudioProjectNotFoundError("binding");self(state,principal,input.selfSessionEpoch);
      const current=await valid(client,principal.userId,state);return {...result(current.state,current.participants,false,current.observation),mutated:current.state.revisionId!==state.revisionId};
    });
  }
  async change(principal:VerifiedSessionToken,workId:string,input:StudioConversationChange,key:string):Promise<StudioConversationContext>{
    return studioAcousticTransaction(async client=>{await lockStudioAcousticWork(client,workId);
      const stored=await load(client,workId,input.conversationId);if(!stored)throw new StudioProjectNotFoundError("binding");self(stored,principal,input.selfSessionEpoch);
      const replay=await retry(client,principal.userId,workId,input,key);
      const current=await valid(client,principal.userId,stored),state=current.state;
      if(replay)return result(state,current.participants,true,current.observation);
      if(state.status==="revoked")return result(state,[]);
      if(state.revisionId!==input.expectedRevisionId)return fail("stale");
      const closing=["decline","cancel","leave","block"].includes(input.action);
      if(!closing)await assertStudioAcousticAccess(client,principal,workId,"view");
      let members=state.members,reason=state.reason,blockedPair=state.blockedPair;let status:State["status"]=state.status;
      if(input.action==="accept"){
        if(status!=="pending"||members.find(member=>member.sessionEpoch===input.selfSessionEpoch)?.accepted)return fail("stale");members=members.map(member=>member.sessionEpoch===input.selfSessionEpoch?{...member,accepted:true}:member);
        if(members.every(member=>member.accepted))status="active";
      }else{
        if(input.action==="block"){
          if(!members.some(member=>member.sessionEpoch===input.targetSessionEpoch))return fail("binding");
          blockedPair=[input.selfSessionEpoch,input.targetSessionEpoch!];reason="blocked";
        }else reason=input.action==="decline"?"declined":input.action==="cancel"?"cancelled":"left";
        status="revoked";
      }
      if(status==="active"){
        const active=await client.query<{id:string}>(`SELECT receipt.response->>'conversationId' AS id FROM creator_work_live_lock lease JOIN studio_mutation_receipt receipt ON receipt."artifactId"=$2 AND receipt."idempotencyKeyHash"=lease."acquisitionId" AND receipt.response->>'workId'=lease."workId" AND receipt.response->>'conversationId'=lease."leaseId" WHERE lease."workId"=$1 AND lease."resourceId" LIKE $3 AND lease."expiresAt">statement_timestamp() AND receipt.response->>'status'='active'`,[workId,artifactFor(workId),PREFIX+"%"]);
        for(const entry of active.rows){if(entry.id===state.conversationId)continue;const other=await load(client,workId,entry.id);if(!other)return fail("proof");
          if(other.members.some(member=>members.some(own=>own.sessionEpoch===member.sessionEpoch))&&(await valid(client,principal.userId,other)).state.status==="active")return fail("limit");}
      }
      const expiresAt=status==="active"?new Date(Math.min(...current.participants.map(member=>Date.parse(member.expiresAt)))).toISOString():state.expiresAt;
      const next=await append(client,workId,principal.userId,{...state,parentRevisionId:state.revisionId,status,reason,blockedPair,members,expiresAt},input,key);
      return result(next,status==="revoked"?[]:current.participants,false,status==="revoked"?undefined:await observe(client,next));
    });
  }
  async renew(principal:VerifiedSessionToken,workId:string,input:StudioConversationRenew):Promise<StudioConversationContext>{
    return studioAcousticTransaction(async client=>{await lockStudioAcousticWork(client,workId);await assertStudioAcousticAccess(client,principal,workId,"view");
      const stored=await load(client,workId,input.conversationId);if(!stored)throw new StudioProjectNotFoundError("binding");self(stored,principal,input.selfSessionEpoch);
      const current=await valid(client,principal.userId,stored);if(current.state.status==="revoked")return {...result(current.state,[]),mutated:stored.revisionId!==current.state.revisionId};
      if(current.state.status!=="active"||current.state.revisionId!==input.expectedRevisionId||current.observation?.revision!==input.expectedLeaseRevision)return fail("stale");
      // Only this conversation's ephemeral observation changes. No participant lease or consent does.
      const expiry=new Date(Math.min(...current.participants.map(member=>Date.parse(member.expiresAt))));
      await client.query('UPDATE creator_work_live_lock SET revision=$3,"expiresAt"=$4,"updatedAt"=statement_timestamp() WHERE "workId"=$1 AND "resourceId"=$2',[workId,PREFIX+stored.conversationId,await nextStudioAcousticClock(client,workId),expiry]);
      return result(current.state,current.participants,false,await observe(client,current.state));
    });
  }
  async invalidate(principal:VerifiedSessionToken,workId:string,input:StudioConversationRead,reason:StudioConversationReason):Promise<StudioConversationContext>{
    return studioAcousticTransaction(async client=>{await lockStudioAcousticWork(client,workId);const state=await load(client,workId,input.conversationId);
      if(!state)throw new StudioProjectNotFoundError("binding");self(state,principal,input.selfSessionEpoch);
      return result(await terminal(client,principal.userId,state,reason),[]);
    });
  }
}
