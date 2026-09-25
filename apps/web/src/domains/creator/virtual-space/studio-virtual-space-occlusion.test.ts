import { describe, expect, it } from "vitest";
import { studioWorldOcclusionPolygonValid } from "./studio-virtual-space-occlusion";
import { DEFAULT_STUDIO_WORLD_MANIFEST, validateStudioWorldManifest } from "./studio-virtual-space-world-manifest";
import { studioWorldManifestFromTiled } from "./studio-virtual-space-tiled-adapter";

describe("Virtual Studio foreground geometry", () => {
  it("allows bounded concave furniture silhouettes but rejects crossing, repeated and zero-area edges", () => {
    expect(studioWorldOcclusionPolygonValid([{x:1,y:1},{x:9,y:1},{x:5,y:5},{x:9,y:9},{x:1,y:9}],10,10)).toBe(true);
    for (const polygon of [
      [{x:1,y:1},{x:9,y:9},{x:1,y:9},{x:9,y:1}],
      [{x:1,y:1},{x:1,y:1},{x:9,y:9}],
      [{x:1,y:1},{x:5,y:5},{x:9,y:9}],
      [{x:-1,y:1},{x:9,y:1},{x:9,y:9}],
      [{x:NaN,y:1},{x:9,y:1},{x:9,y:9}],
    ]) expect(studioWorldOcclusionPolygonValid(polygon,10,10)).toBe(false);
  });
  it("ships bounded roof foregrounds so actors pass behind architecture", () => {
    const layers = DEFAULT_STUDIO_WORLD_MANIFEST.occlusionLayers ?? [];
    expect(layers).toHaveLength(8);
    expect(validateStudioWorldManifest(DEFAULT_STUDIO_WORLD_MANIFEST)).toEqual([]);
    expect(layers.every((layer) => studioWorldOcclusionPolygonValid(
      layer.polygon, DEFAULT_STUDIO_WORLD_MANIFEST.width, DEFAULT_STUDIO_WORLD_MANIFEST.height,
    ))).toBe(true);
  });
  it("bounds optional authored foreground layer count, vertex count and depth", () => {
    const layer={id:"review-table-front",depth:1710,polygon:[{x:100,y:680},{x:230,y:680},{x:230,y:700},{x:100,y:700}]};
    const world={...DEFAULT_STUDIO_WORLD_MANIFEST,occlusionLayers:[layer]};
    expect(validateStudioWorldManifest(world)).toEqual([]);
    expect(layer.depth).toBeGreaterThan(690+1001);
    expect(layer.depth).toBeLessThan(737+1001);
    expect(validateStudioWorldManifest({...world,occlusionLayers:Array.from({length:9},(_,i)=>({...layer,id:`layer-${i}`}))})).toContain("occlusion layer budget exceeded");
    expect(validateStudioWorldManifest({...world,occlusionLayers:[{...layer,depth:Infinity}]})).toContain("occlusion layer is invalid: review-table-front");
    expect(studioWorldOcclusionPolygonValid(Array.from({length:33},(_,i)=>({x:i,y:i%3})),100,100)).toBe(false);
  });
  it("applies Tiled group offsets to polygons and never inherits absent/hidden foreground from another map", () => {
    const base=DEFAULT_STUDIO_WORLD_MANIFEST;
    const map={width:base.width,height:base.height,tilewidth:1,tileheight:1};
    expect(studioWorldManifestFromTiled(map,base).occlusionLayers).toEqual([]);
    const object={name:"desk",x:10,y:20,polygon:[{x:0,y:0},{x:20,y:0},{x:20,y:10}],properties:[{name:"depth",value:1050}]};
    const restored=studioWorldManifestFromTiled({...map,layers:[{name:"group",type:"group",offsetx:3,offsety:4,layers:[{name:"occlusion-layers",type:"objectgroup",objects:[object]}]}]},base);
    expect(restored.occlusionLayers![0]!.polygon).toEqual([{x:13,y:24},{x:33,y:24},{x:33,y:34}]);
    expect(studioWorldManifestFromTiled({...map,layers:[{name:"occlusion-layers",type:"objectgroup",visible:false,objects:[object]}]},base).occlusionLayers).toEqual([]);
  });
});
