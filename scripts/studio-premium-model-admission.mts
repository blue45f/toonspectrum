import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, validateStudioBg3dGlb } from '../apps/web/src/domains/creator/bg3d/studio-bg3d-glb-validation';

if (!process.argv[2]) throw new Error('Usage: studio-premium-model-admission.mts STAGE');
const stage = path.resolve(process.argv[2]);
const manifestPath = path.join(stage, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const results: Array<{ id: string; sha256: string; ok: boolean; code: string; metrics: unknown }> = [];
for (const asset of manifest.assets) {
  if (asset.kind !== 'model') continue;
  const file = path.resolve(stage, asset.path);
  assert(file.startsWith(stage + path.sep));
  const bytes = await readFile(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(bytes.length, asset.bytes);
  assert.equal(sha256, asset.sha256);
  const admission = await validateStudioBg3dGlb(new Uint8Array(bytes), {
    declared: { byteSize: bytes.length, sha256: `sha256:${sha256}` },
    cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 },
    profile: 'mobile', budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
    digest: async input => createHash('sha256').update(input).digest('hex'),
  });
  results.push({ id: asset.id, sha256, ok: admission.ok, code: admission.code, metrics: admission.ok ? admission.metrics : null });
  if (admission.ok) asset.technicalChecks.push('production-GLB-admission-mobile-profile');
  console.log(asset.id, admission.ok ? 'ADMITTED' : 'QUARANTINED', admission.code);
}
const rejected = new Set(results.filter(row => !row.ok).map(row => row.id));
// Keep failed originals outside the active candidate list, not falsely "verified".
manifest.assets = manifest.assets.filter((asset: { id: string; derivedFrom?: string }) => !rejected.has(asset.id) && !rejected.has(asset.derivedFrom ?? ''));
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(stage, 'mobile-admission-report.json'), JSON.stringify({
  profile: 'mobile', helper: 'validateStudioBg3dGlb', checked: results.length,
  passed: results.filter(row => row.ok).length, quarantined: results.filter(row => !row.ok).length,
  studioRoundTripVerified: false, artisticApproval: false, results,
}, null, 2) + '\n');
assert(results.some(row => row.ok), 'At least one actual model must pass the production import gate');
