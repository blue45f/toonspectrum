import { describe, expect, it } from "vitest";

import { studioAcousticDoorChangeSchema, studioAcousticSessionOpenSchema, studioAcousticSessionRenewSchema } from "../graph/world-acoustic";

const world={worldId:"world",revisionId:"revision",contentHash:"a".repeat(64)};
const epoch="6bfc41ca-4d93-4cd8-b2b6-d4dfbd8eaa95";
describe("door and lease-only acoustic contracts",()=>{
  it("requires explicit door CAS and keeps allowlist separate from consent",()=>{
    const door={world,zoneId:"zone",expectedDoorEpoch:null,open:true,allowedUserIds:["actor"]};
    expect(studioAcousticDoorChangeSchema.parse(door)).toEqual(door);
    expect(studioAcousticDoorChangeSchema.safeParse({...door,mediaConsent:true}).success).toBe(false);
    expect(studioAcousticDoorChangeSchema.safeParse({...door,allowedUserIds:["actor","actor"]}).success).toBe(false);
    expect(studioAcousticDoorChangeSchema.safeParse({...door,expectedDoorEpoch:undefined}).success).toBe(false);
  });
  it("does not accept client joinedAt, principal or membership as session proof",()=>{
    const input={world,zoneId:"zone",doorEpoch:epoch,connectionId:"socket",clientInstanceId:"browser",expectedSessionEpoch:null};
    expect(studioAcousticSessionOpenSchema.parse(input)).toEqual(input);
    for(const extra of [{joinedAt:"2026-09-20T00:00:00Z"},{actorUserId:"other"},{grant:true},{members:["other"]}])expect(studioAcousticSessionOpenSchema.safeParse({...input,...extra}).success).toBe(false);
    expect(studioAcousticSessionRenewSchema.safeParse({sessionEpoch:epoch}).success).toBe(false);
    expect(studioAcousticSessionRenewSchema.parse({sessionEpoch:epoch,expectedLeaseRevision:"12"})).toEqual({sessionEpoch:epoch,expectedLeaseRevision:"12"});
  });
});
