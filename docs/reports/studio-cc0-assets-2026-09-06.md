# CC0 원본 에셋 1,097종 — 2026-09-06 검수 기록

## 실제 납품 범위

| 분류 | 중복을 제외한 원본 수 |
| --- | ---: |
| 가구·실내 소품 | 140 |
| 음식·식기 | 200 |
| 나무·꽃·바위 등 자연물 | 294 |
| 건축 부품·건물·주택·도로 | 239 |
| 야외·캠핑·선박 소품 | 126 |
| 투명 효과 마스크 | 96 |
| 표면 재질 | 2 |
| 합계 | 1,097 |

실제 파일은 `public/assets/studio/cc0-20260906/`에 있습니다. 999종은 로우폴리 스타일 GLB, 96종은 투명 효과 마스크, 2종은 2K 표면 재질입니다. 색상·파일 형식만 다른 35개 변형과 16개 저디테일 대체본은 신규 원본 수량에서 제외했습니다. 재질의 노멀·러프니스 등 동반 맵, 렌더 미리보기와 검수 시트는 별도 원본으로 세지 않습니다.

## 출처와 권리

Kenney 및 ambientCG가 CC0-1.0으로 공개한 원본을 공식 다운로드에서 확보했습니다. 파일 해시와 원본 다운로드 영수증, 공급처 페이지, 라이선스, 상업적 사용·재배포 확인을 매니페스트와 각 팩의 `SOURCE.json`에 보관합니다. 사용자 업로드·유료 마켓 자산·폰트 파일은 이 묶음에 포함하지 않았습니다.

- Kenney 공식 정책: https://kenney.nl/support
- ambientCG 공식 정책: https://docs.ambientcg.com/license/

## 스튜디오에서 사용하는 경로

에셋 메뉴의 **CC0 원본 에셋 라이브러리**를 펼치면 한국어 분류/영문 이름 검색, 종류 필터, 24개 단위 페이지 탐색과 실제 미리보기를 사용할 수 있습니다. 목록을 펼치기 전에는 대용량 파일을 내려받지 않습니다.

효과·표면 이미지의 삽입은 동일 출처 다운로드, 크기 제한, SHA-256, 실제 이미지 디코딩과 치수 확인을 거칩니다. 3D는 GLB를 받은 뒤 기존 3D 모델 가져오기 기능을 이용합니다. 3D 원클릭 장면 배치나 스튜디오 저장/복원 왕복 검증 완료를 주장하지 않습니다.

## 제외와 기존 작품 보호

단순 구도용 배경 8종은 완성 배경으로 오인하지 않도록 신규 선택 목록에서 제외했습니다. 원본 ID와 패키지 ID 조회는 유지하며, 저장된 작품의 참조와 사용자의 개인 라이브러리·업로드는 삭제하지 않았습니다. 다른 24종의 자체 SVG 스타터는 그대로 선택할 수 있습니다. 배지의 수량은 카탈로그에서 계산합니다.

기존 정적 파일의 디코딩 감사에서는 손상·빈 이미지가 발견되지 않았습니다. 따라서 확인하지 않은 자산을 손상 또는 저품질이라고 단정하여 일괄 삭제하지 않았습니다.

## 검증과 한계

- 999개 GLB를 실제 Chromium/Three.js에서 각각 3방향으로 로딩·렌더링했습니다. 빈 출력과 비정상 경계를 검사했고, 실패 모델은 0개였습니다. 관련 근거는 `browser-render-evidence.json`에 있습니다.
- 외부 텍스처 의존성을 제거하고, 유한 좌표·접근자 범위·파일 해시를 검사했습니다. 미리보기는 다른 모델의 대표 이미지가 아닌 해당 파일의 실제 렌더입니다.
- 카탈로그 경계, 안전 경로, 라이선스, 종류 검색, 기존 ID 조회, 기존 SVG 드래그를 포함한 4개 파일의 58개 테스트를 실행했습니다. 타입·린트 등 실행 결과는 `data/studio-assets/delivery-20260906/verification.json`을 확인합니다.

기술 검증 통과는 모든 에셋의 미술 품질을 사람이 확대 심사했다는 뜻이 아닙니다. 마스크는 원본 크기 이내 사용을 권장합니다. 이번 묶음은 **모든 에셋 종류의 개선 완료가 아닙니다**. 고정밀 인체·의상, 완성형 웹툰 배경, 말풍선·글자효과·브러시·포즈·템플릿의 전면 확장과 실서비스 전수 사용 검증은 이 결과에 포함하지 않습니다.

## 재현

잠금 파일에 맞는 Node/pnpm 의존성 및 Pillow 11.3.0, defusedxml 0.7.1을 준비한 뒤 다음을 실행합니다. 수집·검수 결과는 스테이징 디렉터리에 생성되며, 운영 데이터베이스나 사용자 파일을 변경하지 않습니다.

```sh
python3 scripts/studio_asset_delivery.py --output /tmp/studio-cc0-review
pnpm exec playwright install chromium
node scripts/render_studio_asset_delivery.mjs /tmp/studio-cc0-review "$PWD"
python3 scripts/finalize_studio_asset_delivery.py --stage /tmp/studio-cc0-review
pnpm exec vitest run src/domains/creator/studio-cc0-asset-delivery.test.ts src/domains/creator/studio-original-free-asset-packs.test.ts src/domains/creator/StudioOriginalAssetMarketplacePanel.test.tsx src/domains/creator/studio-shared-asset-drag.test.ts
```

추가 후보를 수집했을 때에는 라이선스, 역할에 맞는 원본 해상도, 중복, 실제 렌더, 스튜디오 적용 및 미술 검수를 다시 수행해야 합니다. 실패 파일을 숫자에 포함하거나 타입·빌드 실패를 성공으로 처리하지 않습니다.
