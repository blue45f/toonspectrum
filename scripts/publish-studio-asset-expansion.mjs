#!/usr/bin/env node
/** Publish explicitly reviewed originals, never infer visual approval from a render. */
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'apps/web/public/assets/studio/cc0-20260906');
const candidateRoot = path.resolve(process.argv[2] ?? '');
const decisionsPath = path.resolve(process.argv[3] ?? '');
if (!process.argv[2] || !process.argv[3]) {
  throw new Error('Usage: publish-studio-asset-expansion.mjs CANDIDATE_DIRECTORY VISUAL_DECISIONS_JSON');
}
if (!candidateRoot.startsWith(path.join(root, 'artifacts') + path.sep)) {
  throw new Error('Candidates must be staged under repository artifacts, outside public assets');
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const safeRelative = relative => {
  if (typeof relative !== 'string' || !/^(?:assets|previews)\/[A-Za-z0-9_./-]+$/u.test(relative)
      || relative.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Unsafe asset-relative path');
  }
  return relative;
};
const originalBytes = await readFile(path.join(publicRoot, 'manifest.json'));
const original = JSON.parse(originalBytes.toString('utf8'));
const candidates = await readJson(path.join(candidateRoot, 'manifest.json'));
const decisions = await readJson(decisionsPath);
if (original.schema !== 'toonspectrum.asset-delivery.v1' || candidates.schema !== original.schema
    || decisions.schema !== 'toonspectrum.asset-visual-decisions.v1' || !Array.isArray(decisions.assets)) {
  throw new Error('Unsupported acquisition or visual-review schema');
}
const decisionById = new Map(decisions.assets.map(row => [row.id, row]));
if (decisionById.size !== decisions.assets.length || decisionById.size !== candidates.assets.length) {
  throw new Error('Every candidate needs exactly one explicit visual decision');
}
const existingIds = new Set(original.assets.map(asset => asset.id));
const existingHashes = new Set(original.assets.map(asset => asset.sha256));
const additions = [];
const rejected = [];
const copyPlan = new Map();
for (const asset of candidates.assets) {
  const decision = decisionById.get(asset.id);
  if (!decision || typeof decision.reason !== 'string' || !decision.reason.trim()) {
    throw new Error('Missing explicit review reason: ' + asset.id);
  }
  if (decision.decision === 'exclude') {
    rejected.push({ id: asset.id, reason: decision.reason });
    continue;
  }
  if (decision.decision !== 'admit' || decision.sha256 !== asset.sha256
      || typeof decision.evidence !== 'string' || !decision.evidence.startsWith('artifacts/')) {
    throw new Error('Unbound or unsupported visual decision: ' + asset.id);
  }
  const evidence = path.resolve(root, decision.evidence);
  if (!evidence.startsWith(path.join(root, 'artifacts') + path.sep)) throw new Error('Unsafe review evidence');
  await access(evidence);
  if (existingIds.has(asset.id) || existingHashes.has(asset.sha256)) throw new Error('Duplicate original: ' + asset.id);
  existingIds.add(asset.id);
  existingHashes.add(asset.sha256);
  if (asset.license?.id !== 'CC0-1.0' || asset.license.commercialUse !== true
      || asset.license.redistributionAllowed !== true) throw new Error('Unsupported rights: ' + asset.id);
  const source = new URL(asset.license.sourceUrl);
  if (source.protocol !== 'https:' || !['polyhaven.com', 'quaternius.com', 'kenney.nl'].includes(source.hostname)
      || source.username || source.password || source.port) throw new Error('Unreviewed provider');
  const raw = await readFile(path.join(candidateRoot, safeRelative(asset.path)));
  if (raw.length !== asset.bytes || hash(raw) !== asset.sha256) throw new Error('Candidate integrity mismatch: ' + asset.id);
  if (asset.kind === 'model') {
    const measured = asset.sourceBounds;
    const extents = Array.isArray(measured) ? measured
      : measured?.min?.length === 3 && measured?.max?.length === 3
        ? measured.max.map((value, index) => value - measured.min[index]) : null;
    if (asset.browserRenderVerified !== true || !asset.previewPath || extents?.length !== 3
        || !extents.every(value => Number.isFinite(value) && value >= 0) || !extents.some(value => value > 0)) {
      throw new Error('Missing actual model render evidence: ' + asset.id);
    }
    if (!Array.isArray(measured)) asset.sourceBoundsAabb = measured;
    asset.sourceBounds = extents;
    const preview = safeRelative(asset.previewPath);
    await access(path.join(candidateRoot, preview));
    copyPlan.set(preview, path.join(candidateRoot, preview));
  }
  const folder = path.dirname(safeRelative(asset.path));
  for (const entry of await readdir(path.join(candidateRoot, folder), { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:glb|webp|png|jpg|jpeg|json|txt)$/iu.test(entry.name)) {
      throw new Error('Unexpected candidate companion: ' + entry.name);
    }
    const relative = safeRelative(folder + '/' + entry.name);
    // Keep superseded source GLBs in staging, not in the downloadable library.
    if (/\.glb$/iu.test(entry.name) && relative !== asset.path) continue;
    copyPlan.set(relative, path.join(candidateRoot, relative));
  }
  additions.push({ ...asset,
    ...(typeof decision.name === 'string' ? { name: decision.name, originalName: asset.name } : {}),
    ...(typeof decision.category === 'string' ? { category: decision.category } : {}),
    role: decision.role === 'assembly-component' ? 'assembly-component' : 'finished-asset',
    visualReviewed: true,
    visualReviewLevel: 'contact-sheet-visual-triage',
    visualReviewSource: decision.evidence,
    curationStatus: 'selected-after-visual-triage',
    allAnglesArtisticallyApproved: false,
    studioRuntimeVerified: asset.studioRuntimeVerified === true,
  });
}
if (!additions.length || original.assets.length + additions.length > 2400) throw new Error('Invalid expansion size');
for (const relative of copyPlan.keys()) {
  try {
    await access(path.join(publicRoot, relative));
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  throw new Error('Will not replace an existing public asset: ' + relative);
}
// Put the new reviewed batch first without changing any previous ID or URL.
const next = { ...original, assets: [...additions, ...original.assets] };
const manifestText = JSON.stringify(next, null, 2) + '\n';
if (Buffer.byteLength(manifestText) > 4 * 1024 * 1024) throw new Error('Catalog exceeds runtime manifest budget');
await writeFile(path.join(candidateRoot, 'catalog-before-expansion.json'), originalBytes, { flag: 'wx' });
for (const [relative, source] of copyPlan) {
  const destination = path.join(publicRoot, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination, 1);
}
if (hash(await readFile(path.join(publicRoot, 'manifest.json'))) !== hash(originalBytes)) {
  throw new Error('Catalog changed during publication; new files remain inactive for reconciliation');
}
const temporaryManifest = path.join(publicRoot, 'manifest.expansion-pending.json');
await writeFile(temporaryManifest, manifestText, { flag: 'wx' });
await rename(temporaryManifest, path.join(publicRoot, 'manifest.json'));
const report = {
  schema: 'toonspectrum.asset-expansion-publication.v1',
  previousCatalogCount: original.assets.length,
  addedOriginals: additions.length,
  catalogCount: next.assets.length,
  byKind: Object.fromEntries([...new Set(additions.map(asset => asset.kind))]
    .map(kind => [kind, additions.filter(asset => asset.kind === kind).length])),
  addedIds: additions.map(asset => asset.id),
  rejected,
  preservedAllPreviousIdsAndUrls: true,
  reviewLevel: 'contact-sheet-visual-triage',
  allAnglesArtisticallyApproved: false,
  productionPublished: false,
  beforeManifestSha256: hash(originalBytes),
  afterManifestSha256: hash(manifestText),
};
await writeFile(path.join(candidateRoot, 'publication-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
