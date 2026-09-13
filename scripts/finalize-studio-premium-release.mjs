#!/usr/bin/env node
/** Finalize this reviewed release only after publication has completed. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, 'artifacts/studio-premium-20260913');
const destination = path.join(root, 'apps/web/public/assets/studio/cc0-20260906');
const load = async file => JSON.parse(await readFile(file, 'utf8'));
const current = await load(path.join(destination, 'manifest.json'));
const before = await load(path.join(stage, 'catalog-before-expansion.json'));
const decisions = await load(path.join(root, 'data/studio-assets/premium-20260913-decisions.json'));
await load(path.join(stage, 'publication-report.json'));
const selected = decisions.assets.filter(row => row.decision === 'admit');
const beforeIds = new Set(before.assets.map(asset => asset.id));
const currentById = new Map(current.assets.map(asset => [asset.id, asset]));
for (const asset of before.assets) assert.deepEqual(currentById.get(asset.id), asset, `Existing asset changed: ${asset.id}`);
assert.equal(current.assets.length - before.assets.length, selected.length);
const additions = selected.map(decision => {
  assert(!beforeIds.has(decision.id));
  const asset = currentById.get(decision.id);
  assert(asset, `Missing published asset ${decision.id}`);
  assert.equal(asset.sha256, decision.sha256);
  assert.equal(asset.visualReviewed, true);
  return asset;
});
for (const asset of additions) {
  const bytes = await readFile(path.join(destination, asset.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  assert.equal(bytes.length, asset.bytes);
  assert(asset.visualReviewSource.startsWith('artifacts/studio-premium-20260913/review/'));
  await readFile(path.join(root, asset.visualReviewSource));
}
const byKind = Object.fromEntries([...new Set(additions.map(asset => asset.kind))].map(kind => [kind, additions.filter(asset => asset.kind === kind).length]));
const report = {
  schema: 'toonspectrum.premium-release.v1',
  previousCatalogEntries: before.assets.length, currentCatalogEntries: current.assets.length,
  addedEntries: additions.length,
  independentOriginals: additions.filter(asset => !asset.derivedFrom).length,
  renderedDerivatives: additions.filter(asset => asset.derivedFrom).length,
  byKind, originalPayloadBytes: additions.reduce((total, asset) => total + asset.bytes, 0),
  visualReview: 'contact-sheet-visual-triage', allAnglesArtisticallyApproved: false,
  fullStudioProjectRoundTripVerified: false,
  preservedExistingEntries: before.assets.length,
  decisions: 'data/studio-assets/premium-20260913-decisions.json',
};
await writeFile(path.join(stage, 'release-summary.json'), JSON.stringify(report, null, 2) + '\n');
const documents = path.join(root, 'docs/reports');
await mkdir(documents, { recursive: true });
const doc = `# 스튜디오 고해상도 CC0 에셋 확장 — 2026-09-13

## 실제 배포 파일

| 구분 | 추가 수량 | 제공 형태 |
| --- | ---: | --- |
| 텍스처 포함 3D 소품 | ${byKind.model ?? 0} | 자체 호스팅 GLB, 원본 형상과 2K 텍스처 |
| 2D 배경 | ${byKind.background ?? 0} | 2048×1152 WebP, 실사 레퍼런스 |
| 표면 재질 | ${byKind['surface-texture'] ?? 0} | 2K 색상 이미지와 공급자가 제공한 PBR 보조 맵 |
| 투명 2D 소품 | ${byKind['prop-image'] ?? 0} | 1536×1536 WebP, 위 3D 원본에서 직접 렌더 |

**독립 원본 ${report.independentOriginals}종 + 렌더 파생 소재 ${report.renderedDerivatives}종 = 추가 선택 항목 ${report.addedEntries}종.** 같은 모델의 2D 렌더를 새로운 3D 원본으로 계산하지 않는다. 기존 ${report.previousCatalogEntries}개 항목의 메타데이터와 URL은 바꾸지 않았고, 최종 카탈로그는 ${report.currentCatalogEntries}개 항목이다.

## 사용 경로

스튜디오 에셋 메뉴에서 **CC0 에셋 라이브러리**를 펼친다. **2D 배경**, **2D 투명 소품**, **3D 소품**, **표면 재질** 필터와 한국어·영어 이름 검색을 제공한다. 2D 이미지는 **캔버스에 삽입**하고, 3D 모델은 **GLB 받기** 후 기존 배경 3D 모델 가져오기를 이용한다. 이번 변경이 3D 원클릭 배치를 추가하는 것은 아니다.

목록은 최대 384px 경량 미리보기를 이용하며, 확대와 삽입에는 고해상도 원본을 사용한다. 소품 이미지에는 투명 알파를 유지한다. 사진 배경은 공급자의 정식 톤매핑 파노라마 원본을 직선 투시로 변환한 것으로, 손그림이나 생성형 AI 일러스트가 아니다. 네이티브 시야각 해상도가 부족한 원본은 확대하지 않고 제외한다.

## 품질·출처

Poly Haven의 CC0 원본을 공식 API와 다운로드 도메인에서 수집했다. 원본 공급처, 공식 파일 체크섬, SHA-256, 실제 크기, 라이선스와 변환 정보를 각 에셋의 SOURCE.json에 보관한다. 웹사이트 썸네일을 고품질 원본으로 재포장하지 않는다. 모든 신규 모델은 실제 브라우저 렌더 및 운영 코드의 모바일 GLB 무결성·메모리 제한 검사를 통과한 후보 중에서 선정했다.

검수는 저장된 컨택트 시트에 대한 시각 선별이다. 구도, 빈 렌더, 과도한 어두움, 산재한 식물, 사용성이 낮은 표면 후보를 제외했다. 인물·상표·건물과 관련된 별도 권리가 모든 사용 상황에서 해결된다는 보장은 하지 않는다. 전체 각도 확대 검수와 스튜디오 작품 저장·재열기 왕복을 완료했다고 표기하지 않는다.

## 재현 가능한 검사

- scripts/studio-premium-catalog.test.mts: 새 이미지 종류, 한국어 검색, 기존 형식, 라이선스, 경로, 크기, 검수 제한.
- scripts/tests/test_studio_premium_assets.py: 투시 변환 방향, 해상도, 입력 제한, 중복 소스 제외.
- scripts/verify-studio-premium-release.mjs: 배포 파일 해시, PBR 맵, 원본·파생 연결, 실제 이미지 삽입·PNG 출력, 라이브러리 컴포넌트 필터·검색·미리보기·삽입.
- .github/workflows/studio-premium-assets-quality.yml: 읽기 전용 신규 및 기존 CC0 회귀 검사. 실제 통과 상태는 해당 PR의 Actions 결과로 확인한다.

선별 판정은 data/studio-assets/premium-20260913-decisions.json, 수집·렌더·메모리 검사와 컨택트 시트는 artifacts/studio-premium-20260913에 있다. 배포 후 중복 스테이징 바이너리와 임시 쓰기 워크플로는 최종 변경에서 제거한다.
`;
await writeFile(path.join(documents, 'studio-premium-assets-20260913.md'), doc);
// These paths belong exclusively to this task. Published originals and review evidence remain.
await rm(path.join(stage, 'assets'), { recursive: true, force: true });
await rm(path.join(stage, 'previews'), { recursive: true, force: true });
await rm(path.join(root, '.github/workflows/studio-premium-assets-prepare.yml'));
console.log(JSON.stringify(report, null, 2));
