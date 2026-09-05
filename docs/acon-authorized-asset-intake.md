# ACON 허가 원본 일괄 수입

## 실제 완료 범위

이 변경은 **로컬에 확보한 허가 원본을 기존 업로더용 후보 목록으로 준비하는 도구**다. ACON 전체 상품을 다운로드·복제한 것이 아니며, 이 변경으로 확보하거나 운영 카탈로그에 추가한 실제 ACON 에셋은 **0개**다. 테스트의 이미지·삼각형·상품 번호는 합성 fixture이며 에셋으로 배포하지 않는다.

사용자가 별도 사용 허락을 받았다는 전제로 원본별 출처와 사용 조건을 기록한다. 허락을 다시 심사하는 서비스는 아니며 일반 구매를 CC0나 무제한 재배포 허락으로 바꾸지 않는다. 공개 저장소에 계약서 원문, 로그인 쿠키, 다운로드 토큰, 비공개 원본을 커밋하지 않는다.

## 실행

프로젝트 권장 Node 24 이상. 새 패키지·API 키가 필요 없고 네트워크에 접근하지 않는다.

```sh
# 파일을 수정하지 않고 사전 검사만 수행
node scripts/import-acon-assets.mjs \
  --source-dir /data/acon-originals \
  --inventory /data/acon-inventory.json

# 부모 폴더가 존재하는, 아직 없는 새 출력 폴더에 원본 바이트와 기록 보존
node scripts/import-acon-assets.mjs \
  --source-dir /data/acon-originals \
  --inventory /data/acon-inventory.json \
  --output-dir /data/acon-intake-001

# 기존 업로더에서 API 호출 없는 계획 확인
pnpm run studio:upload-assets -- \
  --manifest /data/acon-intake-001/candidate-manifest.json \
  --type auto --dry-run

# 합성 fixture 기반 회귀 테스트
node --test scripts/verify-acon-asset-intake.mjs
```

기존 `scripts/upload-toonstudio-3d-assets.mts`가 읽는 `name/path/category/subtype/seed` 필드와 상대 경로 규약을 유지한다. **필드 호환은 운영 업로드·에디터 실행 검증을 의미하지 않는다.** 이 명령은 실제 업로드, 공유 카탈로그 등록, 플랫폼 전체 공개를 실행하지 않는다. 실제 업로드 전에 디코딩, 에디터 삽입, 원본 대비 시각 검수 및 해당 공개 범위의 사용 조건을 확인해야 한다.

## 입력 목록

상품 목록 URL 대신 실제 확보한 파일마다 한 항목을 작성한다. 아래는 형식 설명용 가상 항목이다. 실제 상품·계약·파일 경로로 바꿔야 하며, 허락 문서는 식별 가능한 참조만 기록한다.

```json
{
  "version": 1,
  "provider": "acon",
  "authorizationReference": "내부에 보관한 별도 사용 허락의 참조",
  "assets": [
    {
      "id": "scene-original-001",
      "name": "원본 에셋의 실제 이름",
      "creator": "실제 제작자",
      "productUrl": "https://www.acon3d.com/ko/product/1000000001",
      "role": "original",
      "category": "background-3d",
      "file": "school/classroom.glb",
      "license": {
        "name": "해당 원본에 적용되는 실제 사용 조건",
        "reference": "원본별 허락 범위를 확인할 수 있는 참조"
      }
    }
  ]
}
```

`id`는 독립 원본의 고정 식별자다. 색상·포맷·해상도만 다른 파생형을 서로 다른 독립 원본으로 등록하지 않는다. 이름·카테고리·제작자·파일 경로·사용 조건이 비어 있으면 거부한다. `role: preview` 항목은 원본 후보로 받지 않는다. 단, 원본이라고 잘못 선언한 스크린샷이나 시각적 유사품을 이 도구가 판별하는 것은 아니다.

지원 분류: `background-2d`, `background-3d`, `character-2d`, `character-3d`, `prop-2d`, `prop-3d`, `effect-2d`, `material-2d`, `brush`, `audio`, `font`.

## 출력과 집계

| 결과 | 의미 |
| --- | --- |
| `originals/<sha256>.<ext>` | 사전 검사 후 다시 해시를 확인한 원본 바이트의 로컬 스냅샷 |
| `candidate-manifest.json` | 기존 업로더용 기술 후보 목록. 품질 승인·공개 완료 목록이 아님 |
| `provenance.json` | 모든 입력 항목의 상품·제작자·라이선스·해시·검사 상태와 제외 이유 |
| `.incomplete` | 도중 실패·중단한 출력. 이 파일이 남아 있으면 업로드 대상으로 사용하지 않음 |

상태는 `candidate`, `duplicate`, `conversion-required`, `rejected`로 구분한다. 후보의 `reviewStatus`는 항상 `pending`, 보고서의 `published`는 항상 `0`이다. 입력 목록 수, 후보 독립 원본 수, 후보 상품 수를 따로 집계한다. 동일 바이트는 이름이나 상품 번호가 달라도 한 번만 후보에 넣고 출처는 보고서에 모두 남긴다. 해시가 다른 파생형의 실질적 중복은 별도 시각 검수 대상이다.

혼합 배치에서는 유효한 후보만 출력하고 나머지는 기록한다. 종료 코드는 전체 후보 성공 `0`, 후보가 있지만 거부/변환 대기 항목 존재 `2`, 후보 없음 `3`, 명령·목록·쓰기 실패 `1`이다. 빈 목록은 성공으로 처리하지 않는다. 자동화는 종료 코드와 보고서를 함께 확인해야 한다.

## 기술 범위와 한계

PNG/JPEG/WebP는 파일 컨테이너·기본 크기·필수 구간을 검사한다. GLB 2/VRM은 헤더·청크·JSON·버퍼 범위·내장 리소스를 검사하며 VRM 확장으로 서브타입을 결정한다. 완전한 이미지 디코더, 전체 glTF 스키마 검증기, VRM 인체 검증기, 시각 품질 평가기는 아니다. CRC/압축 스트림·재질 표현·메시 품질·리깅 등은 후속 검사 대상이다. 고해상도라는 이유만으로 고품질이라고 표시하지 않는다.

SKP/FBX/OBJ/glTF/BLEND, PSD/CLIP, SUT/ABR, 오디오·폰트 및 ZIP/7Z/RAR는 변환 또는 전용 가져오기 대기로 기록한다. 원본 저작 도구에서 지원 형식으로 내보내야 하며 확장자만 바꾸지 않는다. 압축파일을 자동 해제하거나 스크립트·플러그인을 실행하지 않는다. GLB의 외부 텍스처·버퍼는 자동 다운로드하지 않고, 리소스를 포함한 모델로 다시 내보내도록 안내한다.

명시된 파일만 읽는다. 경로 이탈·드라이브 경로·심볼릭 링크를 거부하고, 파일당 128 MiB/배치 8 GiB/목록 50,000항목/이미지 64메가픽셀로 자원 사용을 제한한다. 더 큰 원본은 사라지는 것이 아니라 별도 최적화·분할 대상이다. 출력은 입력 폴더 밖의 새 폴더만 허용하며 기존 폴더를 덮어쓰지 않는다. 입력 폴더는 작업 중 다른 프로세스가 바꾸지 않는 신뢰된 로컬 폴더여야 한다.

## 확인한 공식 자료

- ACON 분류: https://www.acon3d.com/ko
- ACON 일반 EULA: https://www.acon3d.com/ko/policy/eula (별도 허락이 있는 경우 해당 계약을 원본별로 기록)
- ACON 구매 후 다운로드 안내: https://www.acon3d.com/brochure
- GLB 2 구조: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html

2026-09-06 공개 페이지 조사에서 전체 허가 원본의 일괄 다운로드 경로는 확보하지 못했다. 실제 전체 추가를 완료하려면 허락된 원본 묶음 또는 접근 가능한 공식 원본 전달 경로가 필요하다. 이 문서는 전 상품 확보나 검수 완료의 증빙이 아니다.
