/** Verify SHA-bound human/assistant visual decisions; never infer artistic approval from a render pass. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStudioBg3dGlb, DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES } from '../../apps/web/src/domains/creator/bg3d/studio-bg3d-glb-validation.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const stage = path.join(root, 'artifacts/studio-quality-assets-20260913');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const selection = await readJson(new URL('./selection.json', import.meta.url));
const manifestBytes = await readFile(path.join(stage, 'manifest.json'));
assert.equal(hash(manifestBytes), selection.sourceManifestSha256, 'Reviewed candidate manifest changed');
const manifest = JSON.parse(manifestBytes.toString('utf8'));
assert.equal(selection.schema, 'toonspectrum.quality-selection.v1');
assert.equal(selection.assets.length, manifest.assets.length);
assert.equal(new Set(selection.assets.map(row => row[0])).size, selection.assets.length);
const { validateBytes, version } = createRequire(import.meta.url)('gltf-validator');
const results = [], decisions = [];
const evidence = 'artifacts/studio-quality-assets-20260913/visual-review.md';
for (const [id, sha256, name, decision] of selection.assets) {
  assert(['admit', 'component', 'exclude'].includes(decision));
  const asset = manifest.assets.find(item => item.id === id);
  assert(asset, `Missing reviewed source: ${id}`);
  assert.equal(asset.sha256, sha256, `${id}: review is tied to different bytes`);
  assert.equal(asset.license.id, 'CC0-1.0');
  assert.equal(asset.license.redistributionAllowed, true);
  const file = path.resolve(stage, asset.path);
  assert(file.startsWith(`${stage}${path.sep}`));
  const bytes = await readFile(file);
  assert.equal(hash(bytes), sha256);
  assert.equal(bytes.length, asset.bytes);
  for (const map of asset.pbrMaps ?? []) {
    const mapFile = path.resolve(stage, map.path);
    assert(mapFile.startsWith(`${stage}${path.sep}`));
    const mapBytes = await readFile(mapFile);
    assert.equal(hash(mapBytes), map.sha256);
    assert.equal(mapBytes.length, map.bytes);
  }
  let admission = null, validation = null;
  if (asset.kind === 'model') {
    assert.equal(asset.browserRenderVerified, true);
    await readFile(path.join(stage, asset.previewPath));
    admission = await validateStudioBg3dGlb(new Uint8Array(bytes), {
      declared: { byteSize: bytes.length, sha256: `sha256:${sha256}` },
      cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 },
      profile: 'mobile', budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
      digest: async input => hash(input),
    });
    if (decision === 'exclude') {
      assert.equal(admission.ok, false, `${id}: exclusion evidence no longer matches`);
      assert.equal(admission.code, 'texture-byte-budget-exceeded');
    } else {
      assert.equal(admission.ok, true, `${id}: ${admission.code}`);
      const result = await validateBytes(new Uint8Array(bytes), { uri: asset.path, maxIssues: 100 });
      validation = { validator: version(), issues: result.issues };
      assert.equal(result.issues.numErrors, 0, `${id}: glTF validation errors`);
    }
  } else {
    assert.equal(asset.kind, 'surface-texture');
    assert(Math.max(asset.width, asset.height) >= 2048 && Math.min(asset.width, asset.height) >= 1024);
  }
  results.push({ id, sha256, decision, admission: admission && { ok: admission.ok, code: admission.code, metrics: admission.metrics }, validation });
  decisions.push({
    id, sha256, name, decision: decision === 'exclude' ? 'exclude' : 'admit', evidence,
    role: decision === 'component' ? 'assembly-component' : 'finished-asset',
    reason: decision === 'exclude' ? 'Excluded: unchanged mobile decoded-texture memory budget exceeded.'
      : decision === 'component' ? 'Visually triaged as an assembly component, not a ready-made finished prop.'
      : asset.kind === 'model' ? 'Self-rendered preview inspected for shape and material readability; native 2K source and mobile GLB admission passed.'
      : 'Native 2K color surface inspected; source integrity and companion-map dimensions preserved.',
  });
  console.log(id, decision, admission?.code ?? 'native-2K-texture');
}
assert.equal(decisions.filter(item => item.decision === 'admit').length, 52);
assert.equal(results.filter(item => item.admission?.ok).length, 33);
await mkdir(stage, { recursive: true });
await writeFile(path.join(stage, 'visual-review.md'), `# Studio quality asset review — 2026-09-13\n\n${selection.review}\n\nSource run: ${selection.sourceRun}. Artifact: ${selection.sourceArtifact}. Candidate manifest SHA-256: ${selection.sourceManifestSha256}.\n\n2D authored collection: eight distinct architectural vector scenes and sixteen transparent props. All 24 rasterized and inspected; not photorealistic assets.\n\n${decisions.map(item => `- ${item.id}: ${item.decision}; ${item.role}; ${item.sha256}; ${item.reason}`).join('\n')}\n`);
await writeFile(path.join(stage, 'decisions.json'), JSON.stringify({ schema: 'toonspectrum.asset-visual-decisions.v1', assets: decisions }, null, 2) + '\n');
await writeFile(path.join(stage, 'admission-report.json'), JSON.stringify({ sourceRun: selection.sourceRun, sourceManifestSha256: selection.sourceManifestSha256, results }, null, 2) + '\n');
