import { describe,expect,it } from "vitest";
import { DEFAULT_STUDIO_WORLD_MANIFEST,type StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import { studioPrivateRoomWalkTarget } from "./studio-private-room-walk";

function world():StudioVirtualSpaceWorldManifest{return {...DEFAULT_STUDIO_WORLD_MANIFEST,width:300,height:200,colliders:[],props:[],
  acousticZones:[{id:"private-zone",roomId:"review",x:180,y:40,width:80,height:80,policy:"private",doorId:"door"}]};}
describe("private-room walking is navigation only",()=>{
  it("returns only the exact reachable authored zone center",()=>{
    expect(studioPrivateRoomWalkTarget(world(),"private-zone",{x:30,y:80})).toEqual({x:220,y:80});
  });
  it("never substitutes a nearby point when the center is blocked or behind a sealed wall",()=>{
    expect(studioPrivateRoomWalkTarget({...world(),colliders:[{x:205,y:65,width:30,height:30}]},"private-zone",{x:30,y:80})).toBeNull();
    expect(studioPrivateRoomWalkTarget({...world(),colliders:[{x:140,y:0,width:20,height:200}]},"private-zone",{x:30,y:80})).toBeNull();
  });
  it("rejects absent doors, overlapping ambiguous zones and an invalid starting point",()=>{
    expect(studioPrivateRoomWalkTarget(world(),"missing",{x:30,y:80})).toBeNull();
    expect(studioPrivateRoomWalkTarget({...world(),acousticZones:world().acousticZones!.map(({doorId:_door,...zone})=>zone)},"private-zone",{x:30,y:80})).toBeNull();
    expect(studioPrivateRoomWalkTarget({...world(),acousticZones:[...world().acousticZones!,{...world().acousticZones![0]!,id:"overlap"}]},"private-zone",{x:30,y:80})).toBeNull();
    expect(studioPrivateRoomWalkTarget(world(),"private-zone",{x:-30,y:80})).toBeNull();
  });
});
