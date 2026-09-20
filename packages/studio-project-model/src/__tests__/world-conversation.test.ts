import { describe, expect, it } from "vitest";

import { studioConversationChangeSchema, studioConversationInvalidationSchema, studioConversationProposeSchema } from "../graph/world-conversation";

const epoch=(number:number)=>`00000000-0000-4000-8000-${String(number).padStart(12,"0")}`;
const proposal={conversationId:epoch(10),selfSessionEpoch:epoch(1),memberSessionEpochs:[epoch(1),epoch(2)]};
describe("explicit symmetric conversation contracts",()=>{
  it("binds optional selected client identities to the exact epoch set without adding authority fields",()=>{
    const expectedMembers=[{sessionEpoch:epoch(1),clientInstanceId:"client-a"},{sessionEpoch:epoch(2),clientInstanceId:"client-b"}];
    expect(studioConversationProposeSchema.safeParse({...proposal,expectedMembers}).success).toBe(true);
    for(const members of [[expectedMembers[0]], [expectedMembers[0],expectedMembers[0]], [expectedMembers[0],{...expectedMembers[1],clientInstanceId:"client-a"}],
      [expectedMembers[0],{...expectedMembers[1],sessionEpoch:epoch(3)}], [expectedMembers[0],{...expectedMembers[1],actor:"victim"}]]){
      expect(studioConversationProposeSchema.safeParse({...proposal,expectedMembers:members}).success).toBe(false);
    }
  });
  it("requires 2–4 unique epochs including self and accepts no client-supplied actor, version or accepted flags",()=>{
    expect(studioConversationProposeSchema.safeParse(proposal).success).toBe(true);
    for(const patch of [{memberSessionEpochs:[epoch(1)]},{memberSessionEpochs:[epoch(1),epoch(1)]},{memberSessionEpochs:[1,2,3,4,5].map(epoch)},{selfSessionEpoch:epoch(3)},{actor:"victim"},{sessionVersion:1},{accepted:true}])expect(studioConversationProposeSchema.safeParse({...proposal,...patch}).success).toBe(false);
  });
  it("requires an exact revision for every decision and binds block to one other epoch",()=>{
    const change={conversationId:proposal.conversationId,selfSessionEpoch:proposal.selfSessionEpoch,expectedRevisionId:"revision",action:"accept"};
    expect(studioConversationChangeSchema.safeParse(change).success).toBe(true);
    expect(studioConversationChangeSchema.safeParse({...change,targetSessionEpoch:epoch(2)}).success).toBe(false);
    expect(studioConversationChangeSchema.safeParse({...change,action:"block",targetSessionEpoch:epoch(2)}).success).toBe(true);
    expect(studioConversationChangeSchema.safeParse({...change,action:"block",targetSessionEpoch:epoch(1)}).success).toBe(false);
  });
  it("invalidations contain only the recipient's fixed conversation/epoch and never grant permissions",()=>{
    const event={version:1,workId:"work",conversationId:proposal.conversationId,selfSessionEpoch:proposal.selfSessionEpoch};
    expect(studioConversationInvalidationSchema.safeParse(event).success).toBe(true);
    for(const patch of [{members:[]},{allowedUserIds:[]},{grant:true},{actor:"private"}])expect(studioConversationInvalidationSchema.safeParse({...event,...patch}).success).toBe(false);
  });
});
