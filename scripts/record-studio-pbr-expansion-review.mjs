#!/usr/bin/env node
/** Record the explicitly viewed September 8 contact sheets, not automatic art scoring. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relative = 'artifacts/studio-asset-expansion/pbr-20260908';
const directory = path.join(root, relative);
const readJson = async name => JSON.parse(await readFile(path.join(directory, name), 'utf8'));
const manifest = await readJson('manifest.json');
assert.equal(manifest.assets.length, 71, 'This review is bound to the 71 acquired originals');
const variants = [
  ...(await readJson('clock-alpha-restoration-manifest.json')).assets,
  ...(await readJson('mobile-ready-manifest.json')).assets,
];
assert.equal(variants.length, 6);
const variantById = new Map(variants.map(asset => [asset.id, asset]));
const originalById = new Map(manifest.assets.map(asset => [asset.id, asset]));
for (const asset of variants) {
  assert.ok(originalById.has(asset.id));
  assert.equal(asset.browserRenderVerified, true);
  assert.notEqual(asset.sha256, originalById.get(asset.id).sha256);
}
manifest.assets = manifest.assets.map(asset => variantById.get(asset.id) ?? asset);

const labels = {
  'plastic-monobloc-chair-01': ['플라스틱 야외 의자', 'furniture'],
  'mid-century-lounge-chair': ['미드센추리 라운지 의자', 'furniture'],
  'wooden-stool-02': ['소박한 원목 스툴', 'furniture'],
  'wooden-stool-01': ['빈티지 원형 스툴', 'furniture'],
  'round-wooden-table-01': ['클래식 원목 원탁', 'furniture'],
  'cassette-player': ['휴대용 카세트 플레이어', 'pbr-detailed-prop'],
  'chinese-sofa': ['중국풍 목제 소파', 'furniture'],
  'painted-wooden-sofa': ['빈티지 페인트 소파', 'furniture'],
  'painted-wooden-bench': ['등받이 목제 벤치', 'furniture'],
  'vintage-cabinet-01': ['클래식 장식 수납장', 'furniture'],
  'painted-wooden-cabinet': ['낡은 페인트 수납장', 'furniture'],
  'vintage-day-bed': ['쿠션이 놓인 데이베드', 'furniture'],
  'old-bed-frame': ['빈티지 철제 침대 프레임', 'furniture'],
  'desk-lamp-arm-01': ['관절형 작업등', 'pbr-detailed-prop'],
  'street-lamp-02': ['클래식 벽부등', 'architecture'],
  'ornate-mirror-01': ['장식 프레임 거울', 'pbr-detailed-prop'],
  'alarm-clock-01': ['민트색 아날로그 알람시계', 'pbr-detailed-prop'],
  'vintage-grandfather-clock-01': ['클래식 괘종시계', 'pbr-detailed-prop'],
  'steel-frame-shelves-01': ['철제 프레임 선반', 'furniture'],
  'antique-ceramic-vase-01': ['푸른 꽃무늬 도자기 화병', 'pbr-detailed-prop'],
  'ceramic-vase-02': ['넓은 입구 도자기 화병', 'pbr-detailed-prop'],
  'brass-vase-03': ['조각 장식 황동 화병', 'pbr-detailed-prop'],
  'ceramic-vase-01': ['가느다란 백자 화병', 'pbr-detailed-prop'],
  'fancy-picture-frame-01': ['풍경화와 클래식 액자', 'pbr-detailed-prop'],
  'fancy-picture-frame-02': ['도시 풍경과 장식 액자', 'pbr-detailed-prop'],
  'potted-plant-01': ['테라코타 화분과 관엽식물', 'nature'],
  'vintage-suitcase': ['빈티지 여행가방 세트', 'pbr-detailed-prop'],
  'vintage-telephone-wall-clock': ['전화기 모양 빈티지 벽시계', 'pbr-detailed-prop'],
  'security-camera-01': ['벽걸이 CCTV 카메라', 'pbr-detailed-prop'],
  'boombox': ['안테나가 있는 붐박스 라디오', 'pbr-detailed-prop'],
  'television-02': ['빈티지 브라운관 TV', 'pbr-detailed-prop'],
  'carved-wooden-plate': ['조각 무늬 나무 접시', 'food'],
  'brass-goblets': ['황동 와인잔 식기 세트', 'food'],
  'russian-food-cans-01': ['통조림과 식료품 세트', 'food'],
  'vintage-electric-kettle': ['클래식 전기 주전자', 'food'],
  'food-apple-01': ['붉은 사과', 'food'],
  'hamburger-buns': ['햄버거 번 빵 세트', 'food'],
  'korean-fire-extinguisher-01': ['받침대가 있는 한국형 소화기', 'pbr-detailed-prop'],
  'fire-hydrant': ['거리 소화전 세트', 'outdoor-prop'],
  'modern-wooden-cabinet': ['모던 목제 거실 수납장', 'furniture'],
  'drawer-cabinet': ['선반과 서랍 수납장', 'furniture'],
  'signal-flashlight': ['빈티지 신호용 손전등', 'outdoor-prop'],
  'treasure-chest': ['금속 장식 보물상자', 'pbr-detailed-prop'],
  'cardboard-box-01': ['사용감 있는 골판지 상자', 'pbr-detailed-prop'],
  'rock-moss-set-02': ['회색 이끼 바위 세트', 'nature'],
  'rock-moss-set-01': ['황갈색 이끼 바위 세트', 'nature'],
  'street-rat': ['거리의 쥐 동물 모델', 'nature'],
  'dead-tree-trunk-02': ['쓰러진 고목 줄기', 'nature'],
  'fern-02': ['고사리 식물 세트', 'nature'],
  'large-iron-gate': ['양쪽으로 여는 철제 대문', 'architecture'],
  'gate-latch-01': ['금속 걸쇠 조립 부품', 'architecture'],
  'floor-tiles-02': ['밝은 석재 바닥 타일', 'surface-material'],
  'floor-tiles-04': ['따뜻한 색감의 바닥 타일', 'surface-material'],
  'oak-veneer-01': ['오크 무늬목 재질', 'surface-material'],
  'wood-table-worn': ['사용감 있는 목재 상판', 'surface-material'],
  'weathered-brown-planks': ['풍화된 갈색 나무 널판', 'surface-material'],
  'brown-planks-05': ['밝은 페인트 나무 널판', 'surface-material'],
  'cracked-concrete-wall': ['갈라진 콘크리트 벽', 'surface-material'],
  'grey-plaster': ['회색 회벽', 'surface-material'],
  'fabric-leather-02': ['황갈색 가죽 재질', 'surface-material'],
  'rusty-metal-02': ['옅은 녹이 슨 철판', 'surface-material'],
  'rusty-metal-04': ['진한 녹이 슨 철판', 'surface-material'],
  'brick-4': ['붉은 줄눈 벽돌', 'surface-material'],
  'castle-brick-02-red': ['거친 적벽돌 벽', 'surface-material'],
  'grass-path-2': ['흙이 섞인 잔디 길', 'surface-material'],
  'forest-ground-04': ['낙엽이 쌓인 숲 바닥', 'surface-material'],
  'forest-leaves-02': ['초록 낙엽과 이끼 숲 바닥', 'surface-material'],
  'aerial-beach-01': ['잔물결이 있는 모래 표면', 'surface-material'],
  'sandstone-cracks': ['갈라진 사암 표면', 'surface-material'],
};
const exclusions = {
  'polyhaven-dandelion-01': 'Five small plants are spread over 4.214 metres; default framing produces less than 0.2% foreground. Keep as an unadmitted source until split and re-reviewed.',
  'polyhaven-leafy-grass': 'At the reviewed contact-sheet scale, saturated fine speckling is less coherent than the accepted grass and forest alternatives. Artistic selection exclusion, not a claim of file corruption.',
};
const clockIds = new Set(variants.slice(0, 3).map(asset => asset.id));
const mobileIds = new Set(variants.slice(3).map(asset => asset.id));
const modelIds = manifest.assets.filter(asset => asset.kind === 'model' && asset.browserRenderVerified).map(asset => asset.id);
const decisions = manifest.assets.map(asset => {
  if (exclusions[asset.id]) return { id: asset.id, sha256: asset.sha256, decision: 'exclude', reason: exclusions[asset.id] };
  const label = labels[asset.id.replace('polyhaven-', '')];
  assert.ok(label, 'An individually named visual decision is required: ' + asset.id);
  const index = modelIds.indexOf(asset.id);
  let evidence = relative + '/surface-review.png';
  let reason = 'Actual decoded 2K surface preview inspected; material identity is readable with no blank or missing image at the reviewed scale.';
  if (asset.kind === 'model') {
    assert.ok(index >= 0);
    evidence = relative + '/browser-verification/models-contact-' + (Math.floor(index / 6) + 1) + '.png';
    reason = 'Actual front, three-quarter and back GPU renders inspected; complete intended silhouette and authored material identity are readable at the reviewed resolution. This does not certify arbitrary close-ups or every viewing angle.';
  }
  if (clockIds.has(asset.id)) {
    evidence = relative + '/clock-alpha-restoration-verification/models-contact-1.png';
    reason = 'Original official opacity mask restored to the glass alpha channel; clock face and hands are now visible in the reviewed GPU views. Geometry, UVs and authored PBR parameters preserved.';
  }
  if (mobileIds.has(asset.id)) {
    evidence = relative + '/mobile-ready-verification/models-contact-1.png';
    reason = 'Mobile-ready derivative inspected in three GPU views. Duplicate textures removed or ORM maps reduced; original 2K base color and normal retained, with readable silhouette and surface detail.';
  }
  return { id: asset.id, sha256: asset.sha256, decision: 'admit',
    name: label[0] + ' · ' + asset.name, category: label[1],
    role: asset.id === 'polyhaven-gate-latch-01' ? 'assembly-component' : 'finished-asset', reason, evidence };
});
assert.equal(decisions.filter(row => row.decision === 'admit').length, 69);
await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(directory, 'visual-decisions.json'), JSON.stringify({
  schema: 'toonspectrum.asset-visual-decisions.v1', reviewedOn: '2026-09-08',
  reviewLevel: 'contact-sheet-visual-triage', allAnglesArtisticallyApproved: false,
  modelSetCounting: 'One source file or set counts as one original, not one per displayed variation.',
  assets: decisions,
}, null, 2) + '\n');
console.log(JSON.stringify({ admitted: 69, excluded: 2, repairedOrOptimizedModels: 6 }));
