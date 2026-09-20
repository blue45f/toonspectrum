import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import { resolveStudioAcousticZone } from "../studio-virtual-space-acoustics";
import { findStudioWorldPath,studioWorldCanOccupy } from "../studio-virtual-space-world-pathfinding";

/** A navigation target only. No session/open is performed and no nearest-zone fallback is allowed. */
export function studioPrivateRoomWalkTarget(manifest:StudioVirtualSpaceWorldManifest,zoneId:string,start:StudioVirtualSpacePoint){
  const zone=manifest.acousticZones?.find(item=>item.id===zoneId);
  if(!zone?.doorId||!studioWorldCanOccupy(manifest,start))return null;
  const target={x:zone.x+zone.width/2,y:zone.y+zone.height/2};
  if(resolveStudioAcousticZone(manifest.acousticZones??[],target)?.id!==zoneId||!studioWorldCanOccupy(manifest,target))return null;
  const route=findStudioWorldPath(manifest,start,target),last=route.at(-1);
  return last&&Math.hypot(last.x-target.x,last.y-target.y)<1 ? target : null;
}
