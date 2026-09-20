import { describe,expect,it } from "vitest";
import { parseStudioPrivateConversation,parseStudioPrivateLease,studioPrivateDoorSchema } from "./studio-private-room-client";

const world={worldId:"world",revisionId:"rev",contentHash:"a".repeat(64)},epoch="00000000-0000-4000-8000-000000000001";
const binding={connectionId:"socket",clientInstanceId:"client",joinedAt:new Date().toISOString()};
const lease={kind:"acoustic-session-lease-only",world,zoneId:"zone",doorId:"door",doorEpoch:epoch,sessionEpoch:epoch,leaseRevision:"1",expiresAt:new Date().toISOString(),binding};
const members=[{sessionEpoch:epoch,binding,accepted:true},{sessionEpoch:"00000000-0000-4000-8000-000000000002",binding:{...binding,connectionId:"other",clientInstanceId:"other"},accepted:true}];
const conversation={kind:"acoustic-conversation-consent",world,zoneId:"zone",doorId:"door",doorEpoch:epoch,conversationId:epoch,revisionId:"consent",status:"active",reason:null,leaseRevision:"1",expiresAt:new Date().toISOString(),members};
describe("strict private-room HTTP parsing",()=>{
  it("accepts the exact lease and rejects a ticket or extra caller authority",()=>{
    expect(parseStudioPrivateLease(lease)).toEqual(lease);
    expect(()=>parseStudioPrivateLease({...lease,actorId:"trusted"})).toThrow();
    expect(()=>parseStudioPrivateLease({token:"room-ticket"})).toThrow();
  });
  it("rejects duplicate bindings, partial consent and invalid terminal shape",()=>{
    const parse=(value:unknown)=>parseStudioPrivateConversation({conversation:value,replayed:false});
    expect(parse(conversation)).toEqual(conversation);
    for(const bad of [{...conversation,members:[members[0],members[0]]},{...conversation,members:[members[0],{...members[1],accepted:false}]},
      {...conversation,leaseRevision:null},{...conversation,status:"revoked",reason:null},{...conversation,members:[...members,{...members[1],sessionEpoch:"00000000-0000-4000-8000-000000000003"}]}])expect(()=>parse(bad)).toThrow();
  });
  it("does not interpret a door or admitted lease as conversation consent",()=>{
    const door={world,zoneId:"zone",doorId:"door",epoch,open:true,permitted:true};
    expect(studioPrivateDoorSchema.parse(door)).toEqual(door);
    expect(()=>parseStudioPrivateConversation({conversation:lease,replayed:false})).toThrow();
    expect(()=>parseStudioPrivateConversation({conversation:door,replayed:false})).toThrow();
  });
});
