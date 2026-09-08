#!/usr/bin/env node
/** Generate an offline, evidence-aware gallery after final publication/preview signals. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'artifacts/studio-asset-expansion');
const publicDir = path.join(root, 'apps/web/public');
const pbrDir = path.join(outputDir, 'pbr-20260908');
const activeModular = process.argv.includes('--active-modular');
const activeFantasy = process.argv.includes('--active-fantasy');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const stringValue = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      const translated = value.ko ?? value.en ?? value.url ?? value.path;
      if (typeof translated === 'string' && translated.trim()) return translated.trim();
    }
  }
  return '';
};
function entries(document, label) {
  if (Array.isArray(document)) return document;
  for (const key of ['assets', 'avatars', 'characters', 'models', 'entries', 'items']) {
    if (Array.isArray(document?.[key])) return document[key];
  }
  throw new Error(`${label}: an explicit asset array is required; refusing to infer counts from files.`);
}
function relativeUrl(file) {
  return path.relative(outputDir, file).split(path.sep).map(encodeURIComponent).join('/');
}
function localCandidates(value, directory) {
  if (!value || /^https?:\/\//i.test(value)) return [];
  if (value.startsWith('/assets/') || value.startsWith('/vrm/')) return [path.join(publicDir, value)];
  if (path.isAbsolute(value)) return [value];
  return [path.resolve(directory, value), path.resolve(root, value), path.resolve(publicDir, value)];
}
function existingLocalFile(values, directory) {
  for (const raw of values) {
    const value = stringValue(raw);
    for (const candidate of localCandidates(value, directory)) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
  }
  return null;
}
function safeExternal(value) {
  try {
    const url = new URL(stringValue(value));
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}
function imageFor(asset, directory, family) {
  const id = stringValue(asset.id, asset.assetId, asset.slug);
  const slug = stringValue(asset.slug, asset.sourceId, asset.polyHavenId, id.replace(/^polyhaven-/, '').replaceAll('-', '_'));
  const fallbacks = family === 'fantasy' || family === 'modular'
    ? [`/assets/3d/characters/thumbnails/quaternius-${family}-v1/${id}.png`]
    : family === 'environment' ? [] : [
      `previews/${id}.png`, `previews/${slug}.png`, `renders/${id}.png`, `renders/${slug}.png`,
      `thumbnails/${id}.png`, `thumbnails/${slug}.png`, `review/${id}.png`, `${id}.png`,
      `assets/polyhaven-${slug.replaceAll('_', '-')}/${slug}.png`,
    ];
  return existingLocalFile([
    asset.reviewImage, asset.reviewImagePath, asset.previewPath, asset.renderPath, asset.thumbnailPath,
    asset.thumbnailUrl, asset.thumbnail, asset.previewUrl, asset.preview, asset.imagePath,
    asset.kind === 'surface-texture' ? asset.path : null,
    ...fallbacks,
  ], directory);
}
function categoryFor(asset, family) {
  if (family === 'fantasy' || family === 'modular') return 'character';
  if (family === 'environment') return 'environment';
  const kind = stringValue(asset.type, asset.kind, asset.assetType, asset.category).toLowerCase();
  return /material|texture|image/.test(kind) ? 'material' : 'prop';
}
const categoryLabels = { character: '캐릭터', environment: '배경·건축', prop: '소품·가구', material: 'PBR 재질' };
const fantasyNames = {
  'quaternius-female-peasant': '여성 마을 주민',
  'quaternius-male-peasant': '남성 마을 주민',
  'quaternius-female-ranger': '여성 레인저',
  'quaternius-male-ranger': '남성 레인저',
};
const roleNames = { adventurer: '모험가', beach: '해변 휴양객', casual: '캐주얼', casual2: '캐주얼 2', farmer: '농부', king: '왕', queen: '여왕', punk: '펑크', spacesuit: '우주복', suit: '정장', swat: '특수기동대', worker: '작업복', scifi: 'SF', soldier: '군인', witch: '마녀' };
function normalize(asset, { family, directory, active, evidence }) {
  const id = stringValue(asset.id, asset.assetId, asset.slug);
  if (!id) throw new Error(`Missing stable asset id in ${family}`);
  const imageFile = imageFor(asset, directory, family);
  const category = categoryFor(asset, family);
  const sourceUrl = safeExternal(asset.sourceUrl ?? asset.source?.url ?? asset.license?.sourceUrl ?? asset.provenance?.sourceUrl);
  const provider = stringValue(asset.provider, asset.sourceProvider, asset.license?.provider, asset.provenance?.provider, family === 'pbr' ? 'Poly Haven' : family === 'environment' ? 'ToonSpectrum + Poly Haven' : 'Quaternius + ToonSpectrum');
  const licenseUrl = safeExternal(asset.licenseUrl ?? asset.license?.url ?? asset.provenance?.licenseUrl) || 'https://creativecommons.org/publicdomain/zero/1.0/';
  const license = stringValue(asset.license?.id, asset.license?.name, typeof asset.license === 'string' ? asset.license : '', asset.provenance?.license, 'CC0-1.0');
  const sourceLinks = sourceUrl ? [{ url: sourceUrl, label: '원본 출처' }] : [];
  if (family === 'fantasy') sourceLinks.push(
    { url: 'https://quaternius.com/packs/universalbasecharacters.html', label: '기본 인체' },
    { url: 'https://quaternius.com/packs/modularcharacteroutfitsfantasy.html', label: '의상 팩' },
  );
  if (family === 'modular' && !sourceUrl) sourceLinks.push({
    url: /female|woman|women/i.test(id)
      ? 'https://quaternius.com/packs/ultimatemodularwomen.html'
      : 'https://quaternius.com/packs/ultimatemodularcharacters.html',
    label: '원본 캐릭터 팩',
  });
  if (family === 'environment') sourceLinks.push(
    { url: relativeUrl(path.join(root, 'scripts/blender/generate_studio_environment_expansion_v1.py')), label: '원본 생성기' },
    { url: relativeUrl(path.join(directory, 'LICENSES.md')), label: '재사용 원본 출처' },
  );
  const file = existingLocalFile([asset.url, asset.modelUrl, asset.vrmUrl, asset.localPath, asset.path, asset.file, asset.fileName], directory);
  const activated = Boolean(active && imageFile && file);
  const state = activated ? 'active' : imageFile ? 'preview' : 'candidate';
  const stateLabel = { active: '활성 연결 · 미리보기 있음', preview: '미리보기 준비 · 연결 대기', candidate: '확보 후보 · 미리보기 대기' }[state];
  const modularName = family === 'modular' && asset.sourceName
    ? `${asset.gender === 'female' ? '여성' : '남성'} ${roleNames[asset.sourceName.toLowerCase()] ?? asset.sourceName}`
    : '';
  return {
    id, family, category, categoryLabel: categoryLabels[category],
    title: stringValue(asset.nameKo, asset.name_ko, asset.name, asset.title, fantasyNames[id], modularName, id.replaceAll('_', ' ').replaceAll('-', ' ')),
    description: stringValue(asset.description, asset.summary),
    sourceUrl, sourceLinks, provider, license, licenseUrl,
    image: imageFile ? relativeUrl(imageFile) : '', file: file ? relativeUrl(file) : '',
    state, stateLabel, activationEvidence: active ? evidence : '',
    modelKey: stringValue(asset.baseModelId, asset.sourceModelId, asset.variantOf, file, `${family}:${id}`),
    byteSize: Number(asset.byteSize ?? asset.bytes ?? (file ? fs.statSync(file).size : 0)),
    reviewNote: family === 'environment'
      ? '단일 사선 미리보기 검수. 브라우저 기술 검증과 전각도 시각 판정은 별도 증거를 확인하세요.'
      : family === 'fantasy' || family === 'modular'
        ? `실제 VRM 1종당 한 타일입니다. 색상·헤어 순열을 신규 모델 수에 더하지 않습니다.${asset.style === 'stylized-low-poly' ? ' 스타일라이즈드 로우폴리 원본입니다.' : ''}${asset.expressions === false ? ' VRM 표정 프리셋은 없습니다.' : ''}`
        : '발행 보고서의 추가 ID를 기준으로 연결 상태를 표시합니다. 출처와 라이선스는 각 타일에서 확인할 수 있습니다.',
  };
}

const publication = readJson(path.join(pbrDir, 'publication-report.json'));
if (!Array.isArray(publication.addedIds)) throw new Error('Publication addedIds must be explicit.');
const addedIds = new Set(publication.addedIds.map((value) => stringValue(value?.id, value)));
const pbr = entries(readJson(path.join(pbrDir, 'manifest.json')), 'PBR manifest');
const environmentDir = path.join(publicDir, 'assets/3d/environments/expansion-v1');
const fantasyDir = path.join(publicDir, 'vrm/quaternius-fantasy-v1');
const modularDir = path.join(publicDir, 'vrm/quaternius-modular-v1');
const data = [
  ...entries(readJson(path.join(fantasyDir, 'manifest.json')), 'Fantasy VRM manifest').map((asset) => normalize(asset, { family: 'fantasy', directory: fantasyDir, active: activeFantasy, evidence: '최종 캐릭터 카탈로그 연결 완료 신호' })),
  ...entries(readJson(path.join(modularDir, 'manifest.json')), 'Modular VRM manifest').map((asset) => normalize(asset, { family: 'modular', directory: modularDir, active: activeModular, evidence: '최종 캐릭터 카탈로그 연결 완료 신호' })),
  ...entries(readJson(path.join(environmentDir, 'manifest.json')), 'Environment manifest').map((asset) => normalize(asset, { family: 'environment', directory: environmentDir, active: true, evidence: '환경 카탈로그 expansion-v1 연결 및 실제 모바일 GLB admission 통과' })),
  ...pbr.filter((asset) => addedIds.has(stringValue(asset.id, asset.assetId, asset.slug))).map((asset) => normalize(asset, { family: 'pbr', directory: pbrDir, active: true, evidence: 'publication-report.json addedIds' })),
];
const models = [...new Map(data.map((asset) => [asset.modelKey, asset])).values()];
const duplicateEntries = data.length - models.length;
const counts = {
  total: models.length,
  active: models.filter(({ state }) => state === 'active').length,
  pending: models.filter(({ state }) => state !== 'active').length,
  categories: Object.fromEntries(Object.keys(categoryLabels).map((key) => [key, models.filter(({ category }) => category === key).length])),
};
const proofCandidates = [
  ['../studio-3d-quality-review/index.html', '기존 28개 개선 전후 갤러리'],
  ['pbr-20260908/publication-report.json', '신규 PBR 발행 보고서'],
  ['../studio-environment-expansion-v1/visual-review.json', '신규 배경 미리보기 검수 기록'],
  ['../studio-environment-expansion-v1/browser-verification/report.json', '신규 배경 브라우저 기술 검증'],
  ['fantasy-runtime-validation.json', '판타지 캐릭터 런타임 검증'],
  ['modular-runtime-validation.json', '남녀 21종 캐릭터 런타임 검증'],
  ['MODULAR-RUNTIME-REVIEW.md', '남녀 21종 캐릭터 시각 검수'],
];
const proofLinks = proofCandidates.filter(([file]) => fs.existsSync(path.resolve(outputDir, file))).map(([file, label]) => `<a href="${escapeHtml(file)}">${escapeHtml(label)} <span aria-hidden="true">↗</span></a>`).join('');
function card(asset, index) {
  const image = asset.image
    ? `<img src="${escapeHtml(asset.image)}" alt="${escapeHtml(asset.title)} 미리보기" loading="${index < 8 ? 'eager' : 'lazy'}" decoding="async">`
    : '<div class="no-preview"><span>PREVIEW PENDING</span><p>사진 없는 항목을<br>완료 수에 넣지 않습니다.</p></div>';
  const links = [asset.file ? `<a href="${escapeHtml(asset.file)}">${asset.category === 'character' ? 'VRM 파일' : asset.category === 'material' ? '재질 이미지' : 'GLB 파일'}</a>` : '', ...asset.sourceLinks.map(({url,label}) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`), `<a href="${escapeHtml(asset.licenseUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(asset.license)}</a>`].filter(Boolean).join('');
  return `<article class="asset-card" data-category="${asset.category}" data-state="${asset.state}" data-search="${escapeHtml([asset.title, asset.id, asset.provider, asset.categoryLabel].join(' ').toLowerCase())}" style="--order:${index % 12}"><div class="asset-image ${asset.category}">${image}<span class="kind">${asset.categoryLabel}</span></div><div class="asset-body"><p class="provider">${escapeHtml(asset.provider)}</p><h2>${escapeHtml(asset.title)}</h2><p class="asset-id">${escapeHtml(asset.id)}</p><p class="state ${asset.state}"><i aria-hidden="true"></i>${asset.stateLabel}</p>${asset.description ? `<p class="description">${escapeHtml(asset.description)}</p>` : ''}<p class="review-note">${escapeHtml(asset.reviewNote)}</p><div class="asset-links">${links}</div></div></article>`;
}
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>ToonStudio | 신규 에셋 리뷰</title><style>
:root{--paper:#f4f0e6;--card:#fffcf5;--ink:#153d3a;--muted:#64746c;--line:#cfd6c8;--sage:#dce4d6;--accent:#bb6540;--gold:#ded0ad;--shadow:0 12px 32px #173c3210}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:var(--ink);background:radial-gradient(ellipse at 80% 0,#dfe7d7 0,transparent 45%),repeating-linear-gradient(0deg,transparent 0,transparent 47px,#23473c05 48px),var(--paper);font-family:"Trebuchet MS","Apple SD Gothic Neo","Malgun Gothic",sans-serif}a{color:inherit;text-underline-offset:4px}button,input,select{font:inherit}button,a,input,select{-webkit-tap-highlight-color:transparent}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid var(--accent);outline-offset:4px}.wrap{width:min(1440px,calc(100% - 80px));margin:auto}.masthead{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:26px 0;border-bottom:1px solid var(--line)}.brand{text-transform:uppercase;font-size:12px;letter-spacing:.18em;font-weight:bold}.edition{font-size:11px;letter-spacing:.08em;color:var(--muted)}.hero{display:grid;grid-template-columns:1.1fr 1fr;gap:7%;align-items:end;padding:62px 0 40px}.eyebrow{margin:0 0 18px;color:var(--accent);font-size:11px;letter-spacing:.22em;font-weight:bold}.hero h1{font:normal clamp(48px,6.1vw,88px)/.97 Georgia,"Times New Roman",serif;letter-spacing:-.055em;margin:0}.hero h1 em{font-weight:normal;color:#497065}.intro{max-width:520px;margin:24px 0 0;font-size:15px;line-height:1.9}.intro strong{font-weight:700}.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;border-top:1px solid var(--ink);padding-top:23px}.stat strong{display:block;font:normal 49px/1 Georgia,serif;letter-spacing:-.04em}.stat span{display:block;font-size:12px;margin-top:11px}.status-note{font-size:12px;line-height:1.85;color:var(--muted);margin:20px 0 0}.ledger{display:flex;gap:12px;align-items:baseline;padding:18px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);font-size:12px}.ledger b{letter-spacing:.05em}.ledger span{color:var(--muted);line-height:1.7}.toolbar{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center;margin:30px 0 12px}.filters{display:flex;gap:8px;flex-wrap:wrap}.filter{border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:24px;padding:10px 15px;font-size:12px;cursor:pointer}.filter[aria-pressed=true]{background:var(--ink);border-color:var(--ink);color:var(--paper)}.filter .count{font-size:10px;opacity:.68;margin-left:5px}.searches{display:flex;gap:9px}input[type=search],select{min-width:0;background:#fffcf580;border:1px solid var(--line);border-radius:5px;color:var(--ink);padding:11px 12px;font-size:12px}input[type=search]{width:205px}select{max-width:190px}.results{font-size:11px;color:var(--muted);margin:18px 0}.gallery{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:23px 20px;padding-bottom:52px}.asset-card{min-width:0;background:var(--card);border:1px solid #d6dccf;border-radius:7px;overflow:hidden;box-shadow:var(--shadow);display:flex;flex-direction:column;animation:reveal .45s ease both;animation-delay:calc(var(--order)*22ms)}.asset-card[hidden]{display:none}.asset-image{aspect-ratio:4/3;background:radial-gradient(ellipse at 50% 48%,#edf0e8,#dce3d7);position:relative;overflow:hidden;border-bottom:1px solid var(--line)}.asset-image.character{background:linear-gradient(135deg,#e5e9df,#d5e1dd)}.asset-image.material{background:#ddd7c8}.asset-image img{width:100%;height:100%;object-fit:contain;display:block}.asset-image.material img{object-fit:cover}.kind{position:absolute;top:12px;left:12px;background:#fffdf4ed;border:1px solid #d4dccf;border-radius:3px;padding:5px 7px;font-size:10px;letter-spacing:.04em}.asset-body{padding:17px;display:flex;flex-direction:column;flex:1;min-width:0}.provider{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin:0 0 7px}.asset-body h2{font-size:16px;line-height:1.45;margin:0;font-weight:600;overflow-wrap:anywhere}.asset-id{margin:7px 0 12px;font:10px/1.5 ui-monospace,monospace;color:#7b877d;overflow-wrap:anywhere}.state{display:flex;align-items:center;gap:6px;margin:0 0 12px;font-size:10px;font-weight:600;line-height:1.5}.state i{width:5px;height:5px;flex-shrink:0;background:#416c4b;border-radius:50%}.state.preview i,.state.candidate i{background:var(--accent)}.state.preview,.state.candidate{color:#965c32}.description{font-size:11px;line-height:1.75;color:#576c62;margin:0 0 11px}.review-note{font-size:10px;line-height:1.75;color:#7b8479;margin:0 0 18px}.asset-links{display:flex;flex-wrap:wrap;gap:7px 11px;border-top:1px solid #e4e8dc;padding-top:12px;margin-top:auto;font-size:10px;line-height:1.6}.no-preview{height:100%;display:grid;align-content:center;justify-content:center;text-align:center;background:repeating-linear-gradient(135deg,#e8e8dc 0,#e8e8dc 10px,#e2e4d8 10px,#e2e4d8 11px)}.no-preview span{font-size:9px;letter-spacing:.15em;color:#7d897c}.no-preview p{font-size:13px;line-height:1.7;color:#6d796d}.empty{display:none;text-align:center;padding:60px 20px;border:1px dashed var(--line);border-radius:8px;color:var(--muted)}.evidence{border-top:1px solid var(--ink);padding:28px 0 45px;display:grid;grid-template-columns:1fr 2fr;gap:30px}.evidence h2{font:normal 31px/1.1 Georgia,serif;margin:0}.evidence p{font-size:12px;line-height:1.8;color:var(--muted)}.evidence-links{display:flex;flex-wrap:wrap;gap:12px 22px;align-content:start;font-size:12px;line-height:1.8}.evidence-links a span{color:var(--accent)}footer{border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:20px;padding:20px 0 30px;font-size:10px;line-height:1.8;color:var(--muted)}@keyframes reveal{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:translateY(0)}}@media(min-width:1600px){.gallery{grid-template-columns:repeat(5,minmax(0,1fr))}}@media(max-width:1100px){.wrap{width:calc(100% - 48px)}.gallery{grid-template-columns:repeat(3,minmax(0,1fr))}.toolbar{grid-template-columns:1fr}.searches{justify-content:flex-end}}@media(max-width:740px){.wrap{width:calc(100% - 32px)}.masthead{padding:20px 0}.edition{font-size:9px;max-width:110px;text-align:right}.hero{grid-template-columns:1fr;gap:32px;padding:38px 0 25px}.hero h1{font-size:58px}.intro{font-size:13px;line-height:1.85}.stats{gap:16px}.stat strong{font-size:42px}.stat span{font-size:11px}.ledger{display:block}.ledger b{display:block;margin-bottom:7px}.ledger span{font-size:11px}.filters{gap:6px}.filter{padding:9px 11px;font-size:11px}.searches{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}input[type=search],select{width:100%;max-width:none}.gallery{grid-template-columns:repeat(2,minmax(0,1fr));gap:13px 11px}.asset-body{padding:13px 11px}.asset-body h2{font-size:13px}.provider{font-size:9px}.state,.review-note,.asset-links{font-size:9px}.kind{top:8px;left:8px;font-size:9px;padding:4px 5px}.asset-id{font-size:9px}.evidence{grid-template-columns:1fr;gap:15px}.evidence-links{font-size:11px}footer{display:block}footer span{display:block;margin-top:7px}}@media(max-width:370px){.gallery{grid-template-columns:1fr}.hero h1{font-size:51px}.searches{grid-template-columns:1fr}.asset-image{aspect-ratio:4/3}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.asset-card{animation:none}}
</style></head><body><div class="wrap"><header class="masthead"><a class="brand" href="#top">TOONSTUDIO / ASSET REVIEW</a><span class="edition">EXPANSION EDITION<br>신규 확보·연결 결과</span></header><main id="top"><section class="hero"><div><p class="eyebrow">MORE STORIES, DISTINCT PLACES</p><h1>New worlds.<br><em>New cast.</em></h1><p class="intro">새 인물과 장소, 장면을 채우는 소품을 살펴보세요.<br><strong>서로 다른 모델은 한 번씩만</strong> 담았습니다. 색상 변형으로 개수를 부풀리거나, 미리보기가 없는 후보를 완료로 표시하지 않습니다.</p></div><div><div class="stats"><div class="stat"><strong>${counts.total}</strong><span>중복을 제외한 항목</span></div><div class="stat"><strong>${counts.active}</strong><span>활성 연결·사진 있음</span></div><div class="stat"><strong>${counts.pending}</strong><span>후보 또는 연결 대기</span></div></div><p class="status-note">활성 연결은 로컬 카탈로그·발행 결과를 뜻합니다. 운영 사이트 배포 완료나 모든 기기에서의 무결점을 뜻하지 않습니다. 프리뷰·기술 검증·전각도 시각 판정은 서로 구분합니다.</p></div></section><div class="ledger"><b>QUALITY, WITH EVIDENCE</b><span>캐릭터 ${counts.categories.character} · 배경 ${counts.categories.environment} · 소품 ${counts.categories.prop} · 재질 ${counts.categories.material}${duplicateEntries ? ` · 중복/동일 모델 변형 ${duplicateEntries}개 제외` : ''} / PBR은 발행 보고서의 승인된 추가 ID만 수록</span></div><section aria-label="에셋 탐색"><div class="toolbar"><div class="filters" role="group" aria-label="카테고리 필터"><button class="filter" type="button" data-filter="all" aria-pressed="true">전체 <span class="count">${counts.total}</span></button>${Object.entries(categoryLabels).map(([key,label])=>`<button class="filter" type="button" data-filter="${key}" aria-pressed="false">${label} <span class="count">${counts.categories[key]}</span></button>`).join('')}</div><div class="searches"><input id="search" type="search" placeholder="이름 · ID · 출처 검색" aria-label="에셋 검색"><select id="status" aria-label="연결 상태"><option value="all">모든 연결 상태</option><option value="active">활성 연결만</option><option value="pending">후보·대기만</option></select></div></div><p class="results" id="results" role="status" aria-live="polite">${counts.total}개 항목 표시</p><div class="gallery" id="gallery">${models.map(card).join('')}</div><div class="empty" id="empty">조건에 맞는 항목이 없습니다. 검색어나 필터를 바꿔 주세요.</div></section><section class="evidence" aria-labelledby="evidence-title"><div><h2 id="evidence-title">The evidence.</h2><p>기존 모델 개선 결과와 이번 신규 확보의 발행·검증 근거를 함께 확인할 수 있습니다.</p></div><div class="evidence-links">${proofLinks}</div></section></main><footer><span>ToonSpectrum · 로컬 리뷰 산출물<br>각 타일의 원본 출처와 라이선스가 실제 사용 판단의 기준입니다.</span><span>생성: ${escapeHtml(new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(new Date()))} KST<br>단일 모델·중복 제외 기준 적용</span></footer></div><script>
(()=>{const cards=[...document.querySelectorAll('.asset-card')];const search=document.querySelector('#search');const status=document.querySelector('#status');const result=document.querySelector('#results');const empty=document.querySelector('#empty');let category='all';function filter(){const query=search.value.trim().toLowerCase();let count=0;for(const card of cards){const categoryMatch=category==='all'||card.dataset.category===category;const stateMatch=status.value==='all'||(status.value==='active'?card.dataset.state==='active':card.dataset.state!=='active');const match=categoryMatch&&stateMatch&&(!query||card.dataset.search.includes(query));card.hidden=!match;if(match)count++;}result.textContent=count+'개 항목 표시 / 전체 '+cards.length+'개';empty.style.display=count?'none':'block';}for(const button of document.querySelectorAll('[data-filter]'))button.addEventListener('click',()=>{category=button.dataset.filter;for(const item of document.querySelectorAll('[data-filter]'))item.setAttribute('aria-pressed',String(item===button));filter();});search.addEventListener('input',filter);status.addEventListener('change',filter);})();
</script></body></html>`;
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'index.html'), html);
console.log(JSON.stringify({ output: path.join(outputDir, 'index.html'), ...counts, duplicateEntries, publicationAddedIds: addedIds.size, matchedPublishedPbr: data.filter(({ family }) => family === 'pbr').length, missingPreviews: models.filter(({ image }) => !image).map(({ id }) => id), awaitingActivation: models.filter(({ state }) => state !== 'active').map(({ id }) => id) }, null, 2));
