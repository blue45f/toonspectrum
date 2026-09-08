import { mkdirSync, writeFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { BRUSH_PRESETS } from './studio-brush';
import { studioCoreBrushCatalogSelection } from './brush/studio-brush-selection';
import { normalizeStudioBrushDynamicsSettings, STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3 as V3, STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4 as V4 } from './brush/studio-brush-dynamics';
import { drawElement } from './live/studio-live-dynamic-brush-overlay.fixture';
import { planStudioDynamicBrushRender } from './studio-dynamic-brush-render-plan';
import { planStudioDynamicBrushCoverageMarks, renderStudioDynamicBrushCoverageMark, renderStudioDynamicBrushCoverage } from './studio-dynamic-brush-coverage-renderer';

const out='/tmp/toonspectrum-inkwash-parity316';
const rows: unknown[]=[];
let kit: any;
beforeAll(async()=>{ kit=await (await import('@toonspectrum/studio-engine-skia/node')).loadCanvasKitNode(); mkdirSync(out,{recursive:true}); });
afterAll(()=>writeFileSync(out+'/results.json',JSON.stringify(rows,null,2)));
const point=(t:number)=>({x:720*(.12+.5*t),y:807*(.2+.42*t-Math.sin(t*Math.PI)*.12)*720/1048});
const points:number[]=[];
for(let batch=0;batch<20;batch++){
 const a=point(batch/20),b=point((batch+1)/20);
 for(let i=0;i<60;i++){const t=i/60;points.push(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);}
}
const last=point(1);points.push(last.x,last.y);
const preset=BRUSH_PRESETS.find(p=>p.id==='inkwash-pen')!;
const selected=studioCoreBrushCatalogSelection(preset);
function plan(pipeline:string,count:number){
 const element=drawElement('inkwash-parity316',points.slice(0,count*2),{brush:selected.runtimeBrushId,brushCatalogId:selected.catalogId,stroke:'#4936e8',strokeWidth:8,opacity:1,brushDynamics:normalizeStudioBrushDynamicsSettings({...selected.brushDynamics,depositPipeline:pipeline}),pressures:Array(count).fill(.5),speeds:Array(count).fill(.02),tangentialPressures:Array(count).fill(0),tiltXs:Array(count).fill(0),tiltYs:Array(count).fill(0),twists:Array(count).fill(0)});
 const p=planStudioDynamicBrushRender(element,selected.runtimeBrushId,false);if(p.status!=='ready')throw Error(p.status);
 const marks=planStudioDynamicBrushCoverageMarks({dabVariations:p.plan.dabVariations,dynamics:p.plan.dynamics,materialIdentity:p.plan.materialIdentity,dynamicSeed:p.plan.seed,stroke:element.stroke,stampGrid:p.plan.renderBudget.stampGrid,markBudget:p.plan.markBudget,...(p.plan.paper?{paper:p.plan.paper}:{})});
 if(!marks.ok)throw Error(marks.reason);
 return {marks:marks.marks,plan:p.plan};
}
function raster(marks:any[],tiled:boolean,phase:number){
 const all:any[]=[];const create=(w:number,h:number)=>{const c=kit.MakeCanvas(w,h);all.push(c);return c;};
 const canvas=create(1100,820),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1100,820);ctx.setTransform(1048/720,0,0,1048/720,phase,phase);
 const result=tiled?renderStudioDynamicBrushCoverage(ctx,marks,{activeDraft:false,opacity:1,surfaceFactory:create}):marks.forEach(m=>renderStudioDynamicBrushCoverageMark(ctx,m,1,create));
 const bytes=new Uint8Array(ctx.getImageData(0,0,1100,820).data);for(const c of all)c.dispose();return {bytes,result};
}
function diff(a:Uint8Array,b:Uint8Array){let changed=0,max=0;for(let y=113;y<282;y++)for(let x=78;x<340;x++){const i=(y*1100+x)*4;const d=Math.max(...[0,1,2,3].map(c=>Math.abs(a[i+c]!-b[i+c]!)));max=Math.max(max,d);if(d>8)changed++;}return {changed,max,total:44278};}
for(const [label,pipeline] of [['V3',V3],['V4',V4]])it(label+' compares prefix marks and direct/tile pixels',()=>{
 const half=plan(pipeline!,601),full=plan(pipeline!,1201);
 const prefix=full.marks.filter(m=>m.x<220);
 const halfPrefix=half.marks.filter(m=>m.x<220);
 expect(prefix).toEqual(halfPrefix);
 for(const phase of [0,.25,.5]){
  const live=raster(half.marks as any[],false,phase),committed=raster(full.marks as any[],true,phase),direct=raster(full.marks as any[],false,phase);
  rows.push({label,phase,halfMarks:half.marks.length,fullMarks:full.marks.length,sharedPrefixMarks:prefix.length,prefixMarksExact:true,liveVsCommitted:diff(live.bytes,committed.bytes),liveVsDirect:diff(live.bytes,direct.bytes),directVsTiled:diff(direct.bytes,committed.bytes),result:committed.result});
 }
});
