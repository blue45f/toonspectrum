import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as after from './fixtures/coverage-after315';
import * as before from './fixtures/coverage-before315';
import { resolveExperimentOutput } from './output';

import type { StudioDynamicBrushCoverageMarkPlanInput } from '@/domains/creator/studio-dynamic-brush-coverage-renderer';

import { normalizeStudioBrushDynamicsSettings, STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V2 as V2, STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V3 as V3, STUDIO_DYNAMIC_BRUSH_DEPOSIT_PIPELINE_CAUSAL_V4 as V4 } from '@/domains/creator/brush/studio-brush-dynamics';
import { hydrateStudioBrushR8GrainAsset, resetStudioBrushR8GrainRegistry } from '@/domains/creator/brush/studio-brush-r8-grain-runtime';
import { studioCoreBrushCatalogSelection } from '@/domains/creator/brush/studio-brush-selection';
import { DEFAULT_STUDIO_PAPER_SURFACE } from '@/domains/creator/brush/studio-paper-granulation-runtime';
import { drawElement } from '@/domains/creator/live/studio-live-dynamic-brush-overlay.fixture';
import { BRUSH_PRESETS } from '@/domains/creator/studio-brush';
import { planStudioDynamicBrushRender } from '@/domains/creator/studio-dynamic-brush-render-plan';
import { sha256HexPortable } from '@/domains/creator/studio-sha256';

const out = resolveExperimentOutput('painttube-ab');
const rows: unknown[] = [];
let skia: { MakeCanvas(w:number,h:number): {getContext(k:'2d'):CanvasRenderingContext2D; dispose():void} };
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
beforeAll(async () => {
  const specifier = '@toonspectrum/studio-engine-skia/node';
  skia = await (await import(/* @vite-ignore */specifier)).loadCanvasKitNode();
  mkdirSync(out, { recursive:true });
});
afterAll(() => writeFileSync(`${out}/results.json`, JSON.stringify({before:'e3cbfa7f4eaa3feee905fee43278a848661df267',after:'f901d93e9202e2c7c4658b1f76d5fa9db2b06064',width:256,height:192,tolerance:0,backend:'CanvasKit CPU Skia, no browser or GPU',rows},null,2)));

const paper = { response:{granulation:.7,staining:.04,scale:1.5}, surface:DEFAULT_STUDIO_PAPER_SURFACE };
const bytes = new Uint8Array([0,64,128,255,255,128,64,0,32,96,160,224,224,160,96,32]);
const r8 = {kind:'r8-texture-v1',asset:{assetId:'paper.ab315.v1',encodedSha256:`sha256:${'e'.repeat(64)}`,decodedSha256:`sha256:${sha256HexPortable(bytes)}`,byteLength:137,mediaType:'image/png',width:4,height:4,channel:'luminance',encoding:'r8-unorm'}} as const;
const modes = ['crossing-off','crossing-on','threshold-below','threshold-exact','threshold-above','r8-off','r8-on','r8-unavailable'] as const;
describe('immutable original vs incoming paint-tube rendering', () => {
  for (const [version, pipeline] of [['V2',V2],['V3',V3],['V4',V4]] as const) {
    it.each(modes)(`${version} %s keeps complete marks and every Skia byte`, (mode) => {
      resetStudioBrushR8GrainRegistry();
      const preset = BRUSH_PRESETS.find(x=>x.id==='paint-tube')!;
      const selected = studioCoreBrushCatalogSelection(preset);
      const isR8 = mode.startsWith('r8');
      const dynamics = normalizeStudioBrushDynamicsSettings({ ...selected.brushDynamics, depositPipeline:pipeline, ...(isR8 ? { grain:{...selected.brushDynamics!.grain,amount:.7,source:r8} } : {}) });
      expect(dynamics.depositPipeline).toBe(pipeline);
      if(isR8 && mode!=='r8-unavailable') expect(hydrateStudioBrushR8GrainAsset(r8,bytes).status).toBe('ready');
      const element=drawElement('immutable-painttube-ab315',[24,28,90,90,160,35,90,28,30,100,160,100,90,28,24,28], {brush:selected.runtimeBrushId,brushCatalogId:selected.catalogId,brushDynamics:dynamics,strokeWidth:18});
      const plan = planStudioDynamicBrushRender(element,selected.runtimeBrushId,false);
      if(plan.status!=='ready') throw new Error(`plan ${plan.status}`);
      const threshold = mode.startsWith('threshold');
      const sourceVariation = plan.plan.dabVariations[0]!;
      const firstVariation = 'segments' in sourceVariation ? sourceVariation.segments.flat() : sourceVariation;
      const thresholdOffset = mode === 'threshold-below' ? -.01 : mode === 'threshold-above' ? .01 : 0;
      const dabs = threshold ? [firstVariation.slice(0,10).map(d=>({...d,roundness:.7,size:(12+thresholdOffset)/.7}))] : isR8 ? [firstVariation.slice(0,10)] : plan.plan.dabVariations;
      const input:StudioDynamicBrushCoverageMarkPlanInput = {dabVariations:dabs,dynamics:plan.plan.dynamics,materialIdentity:plan.plan.materialIdentity,dynamicSeed:plan.plan.seed,stroke:element.stroke,stampGrid:plan.plan.renderBudget.stampGrid,markBudget:plan.plan.markBudget,...(mode==='crossing-on'||threshold||mode==='r8-on'?{paper}:{})};
      expect(input.dynamics.depositPipeline).toBe(pipeline);
      if(isR8){expect(input.dynamics.grain.amount).toBeGreaterThan(0); expect(input.dynamics.grain.source).toEqual(r8);}
      const a=before.planStudioDynamicBrushCoverageMarks(input);
      const b=after.planStudioDynamicBrushCoverageMarks(input);
      if(!a.ok||!b.ok){
        rows.push({version,mode,before:a,after:b});
        expect(mode).toBe('r8-unavailable');
        expect(a).toEqual(b);
        expect(a.ok).toBe(false);
        return;
      }
      expect(mode).not.toBe('r8-unavailable');
      const raster=(renderer:typeof before,marks:typeof a.marks)=>{
        const canvas=skia.MakeCanvas(256,192);
        try{ const ctx=canvas.getContext('2d'); for(const mark of marks) renderer.renderStudioDynamicBrushCoverageMark(ctx,mark); return new Uint8Array(ctx.getImageData(0,0,256,192).data); }finally{canvas.dispose();}
      };
      const ap=raster(before,a.marks),bp=raster(after,b.marks);
      let delta=0,maximum=0,nonempty=0;
      for(let i=0;i<ap.length;i++){if(ap[i]!==bp[i])delta++; maximum=Math.max(maximum,Math.abs(ap[i]!-bp[i]!)); if(i%4===3&&ap[i]!>0)nonempty++;}
      rows.push({version,mode,beforeMarks:a.marks.length,afterMarks:b.marks.length,nonempty,mismatchedChannels:delta,maxDelta:maximum,beforeSha256:hash(ap),afterSha256:hash(bp),marksEqual:JSON.stringify(a.marks)===JSON.stringify(b.marks)});
      expect(nonempty).toBeGreaterThan(0);
      expect(delta, `${version}/${mode}, maxDelta=${maximum}`).toBe(0);
      expect(b).toEqual(a);
    });
  }
});
