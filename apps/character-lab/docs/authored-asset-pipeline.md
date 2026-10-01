# 제작(authored) 캐릭터 에셋 파이프라인 — character-lab 로드 계약

상태: **current** (2026-10-01 실행 결과 기준). 이 문서는 `apps/character-lab/public/assets/characters/`에 들어 있는
제작 캐릭터 패키지가 **어떤 명령으로, 어떤 버전에서, 어떤 라이선스의 원본으로** 만들어졌고, character-lab 로더가
무엇을 기대해도 되는지(메시 이름·shape key·본 이름·좌표계·스케일)를 적는다. 파이프라인 자체의 설계와 CI 게이트는
[`docs/studio/blender-character-pipeline.md`](../../../docs/studio/blender-character-pipeline.md)와
[`tools/blender/toonstudio_blender_kit/README.md`](../../../tools/blender/toonstudio_blender_kit/README.md)가 기준이다.

## 1. 결과물

| 경로(`public/assets/characters/` 기준) | 역할 | 크기 |
| --- | --- | --- |
| `index.json` | 캐릭터 목록·파일 SHA-256 | 2.7 KB |
| `avatar-orion-authored/avatar-orion-authored.glb` | **주 캐릭터**. 스켈레톤(67 joint)·의미 기반 얼굴 shape key 24개·툰 헤어 LOD 3단·텍스처 3장 임베드 | 4,045,664 B |
| `avatar-orion-authored/manifest.json` | 로드 계약(아래 4절), 품질 리포트, 출처·라이선스, VRM humanoid·표정 bind 표 | 약 79 KB |
| `avatar-orion-authored/slot-mapping.json` | 15슬롯 → shape key/본/노드 매핑과 없는 능력 | 약 38 KB |
| `avatar-orion-authored/contact-sheet.png` | 5 표정 × 4 뷰 렌더 합성(490×456) | 약 30 KB |
| `reference-character/*` | **베이스라인**. 스켈레톤·텍스처 없는 CC0 절차 생성 두상(얼굴 shape key 24개·헤어 LOD) | GLB 903,016 B |

총 5.2 MB(한도 15 MB). GLB는 Blender 파이프라인 출력(`batch_generated/blender-character/<id>/<id>.glb`)을
바이트 그대로 복사했고 SHA-256을 `manifest.json.files.glb`와 `index.json`에 적었다.

## 2. 실행 절차(재현)

전제: Blender 5.2.1 LTS(`.cache/blender-5.2.1-linux-x64/blender`, tarball SHA-256
`a31f524fa99a527d3d52b7f5aaa68c34e1a19d5a1c9473f79c5cc610fd5b10e9`, 공식 `blender-5.2.1.sha256`과 대조 OK),
pnpm 11.4.0, Node 22.22.0, Mesa EGL 소프트웨어 렌더. 아래 명령은 저장소 루트에서 실행한다.
CI(`.github/workflows/blender-character-pipeline.yml` 107~177행)와 같은 격리 방식으로 `HOME`과
`BLENDER_USER_RESOURCES`를 임시 디렉터리로 돌린다.

```sh
export HOME=/tmp/ts-blender-home BLENDER_USER_RESOURCES=/tmp/ts-blender-user LIBGL_ALWAYS_SOFTWARE=1
export BLENDER_PATH=$PWD/.cache/blender-5.2.1-linux-x64/blender
mkdir -p "$HOME" "$BLENDER_USER_RESOURCES"

# 1) 확장 설치·프로브(ToonStudio 확장 build/install + VRM Add-on 4.5.0 SHA-256 검증 다운로드)
pnpm exec tsx scripts/setup-toonstudio-blender-pipeline.mts -- --blender "$BLENDER_PATH" --cache-dir /tmp/ts-blender-cache --install-addons
pnpm exec tsx scripts/setup-toonstudio-blender-pipeline.mts -- --blender "$BLENDER_PATH" --cache-dir /tmp/ts-blender-cache --check

# 2) 파이프라인(4코어·15GB 컨테이너용으로 render.resolution=512, render.samples=16 으로 낮춘 config 사본 사용)
"$BLENDER_PATH" --background --threads 2 --python scripts/blender/toonstudio_character_pipeline.py -- \
  --config <사본>/reference-character.lowmem.json --project-root "$PWD"
"$BLENDER_PATH" --background --threads 2 --python scripts/blender/toonstudio_character_pipeline.py -- \
  --config <사본>/avatar-orion-production.lowmem.json --project-root "$PWD"
```

config 사본은 `config/blender/*.json`에서 `render.resolution`·`render.samples`만 바꾼 것이다(원본 SHA-256과 사본
SHA-256, 실행 시 `configDigest`를 `manifest.json.pipelineConfig`에 기록). 지오메트리·shape key·export·quality
옵션은 원본과 같으므로 GLB 내용은 render 옵션의 영향을 받지 않는다. **바이트 수준 재현성은 보장되지 않는다**:
같은 설정으로 실행한 `reference-character.glb` 두 건(이전 세션 `a57f25e4…`, 이번 세션 `17b879a7…`)을 비교하면
JSON 청크 29,100바이트는 동일하고 BIN 청크 873,888바이트 중 11,512바이트(UV sphere 눈 메시의 index 버퍼부터)가
다르다. 노드·메시·morph target·본 이름과 삼각형 수는 같으므로 로드 계약은 유지되고, SHA-256은 해당 빌드의
무결성 영수증으로만 쓴다.

2026-10-01 실제 실행 결과:

| 항목 | reference-character | avatar-orion-authored |
| --- | --- | --- |
| 실행 시간(2 threads) | 98 s | 247 s |
| 품질 점수 / 통과 | 100 / passed (최소 90) | 100 / passed (최소 86) |
| issues | 없음 | `face.expression.preserved`(info, 표정 키 22개 보존) |
| 가시 LOD0 삼각형(파이프라인 집계) | 14,428 | 15,608 |
| GLB 삼각형 합계 / LOD0만 | 13,364 / 10,476 | 14,604 / 11,856 |
| 헤어 LOD0/1/2 삼각형 | 3,952 / 1,928 / 960 (soft-bob) | 3,752 / 1,788 / 960 (short-layered) |
| 의미 기반 얼굴 shape key | 24 (TS_ReferenceHead, 신뢰도 1.0) | 24 (Avatar_Orion_Body, 신뢰도 0.8) |
| humanoid 본 그룹 | 0/17 (스켈레톤 없음) | 17/17, VRM humanoid 53개 |
| 텍스처 | 없음 | 1024² PNG 3장(Base_Color·Emissive·Metallic) |
| non-manifold edge | 0 | 11,996(감사된 소스 허용치, 예상 외 0) |
| 렌더 | neutral × 4 뷰 | neutral·happy·angry·surprised·blink × 4 뷰 |

파이프라인 출력(`batch_generated/`, git 무시 대상)에는 GLB 외에 `.blend`, Orion의 `.vrm`(VRMC_vrm 1.0, 3,977,140 B),
`character-package.json`, `quality-report.json`, `previews/*.png`, `<id>.toonchar.zip`이 남는다. character-lab
패키지는 이 중 GLB와 리포트만 가져오고, 미리보기 PNG는 ImageMagick `montage`로 한 장(최대 변 512px 이하)에 합쳤다.

## 3. 라이선스·출처 판정

| 캐릭터 | 원본 | 라이선스 | 근거 |
| --- | --- | --- | --- |
| avatar-orion-authored | `apps/web/public/vrm/Avatar_Orion.vrm` (SHA-256 `32712a4a…fbb7`, git blob `b244cf74…2210`) ← 불변 원본 `scripts/blender/source_assets/Avatar_Orion_vrm0_source.vrm` (SHA-256 `efa262d1…74f5`) | **CC0** (상업 이용·재배포·수정 허용) | VRM0 embedded meta `licenseName=CC0`, `allowedUserName=Everyone`, `commercialUssageName=Allow`, author `Polygonal Mind`; 복구본 VRM1 meta `allowRedistribution=true`, `commercialUsage=corporation`, `modification=allowModificationRedistribution`. 외부 라이선스 URL은 존재하지 않으며 embedded metadata가 유일한 직접 근거다(`scripts/blender/source_assets/README.md`). |
| reference-character | 없음(`tools/blender/toonstudio_blender_kit`가 절차 생성) | **CC0-1.0** | `config/blender/reference-character.json` `provenance.license` |

둘 다 상업 이용과 재배포가 가능하다고 판정했다. 다만 Orion은 저장소 밖 배포 페이지가 없어 "embedded metadata 외
추가 증거 없음"을 `manifest.json.sourceProvenance.licenseEvidence`에 그대로 적었다.

## 4. 로드 계약(character-lab 로더가 기대해도 되는 것)

- **좌표계·스케일**: glTF 2.0 표준. +Y up, **+Z = 얼굴 방향**, 오른손 좌표계, 미터 단위, 루트 스케일 1.0, 레스트
  포즈 T-pose. Orion 키 ≈ 1.68 m(바디 바운드 y 0 ~ 1.684). Babylon.js는 왼손 좌표계로 변환하며 glTF 로더가
  루트 노드 `__root__`에 처리한다.
- **씬 루트**: Orion은 `Armature` 하나(아마추어 루트). 메시 노드는 모두 그 아래에 있다. reference는 메시 노드 8개가
  루트에 직접 놓인다.
- **스켈레톤(Orion)**: skin `Armature`, joint 67개. Mixamo 명명(`mixamorig:Hips`, `mixamorig:Spine`,
  `mixamorig:Spine2`(=VRM chest), `mixamorig:Neck`, `mixamorig:Head`, 사지·손가락 4관절 체인) + 눈 본
  `TS_OrionEye.L`/`TS_OrionEye.R`. VRM humanoid 53개 매핑은 `manifest.json.humanoidBones[]`(`vrm`→`node`)에 있고
  전부 GLB 노드에 존재한다. GLB 자체에는 VRM 확장이 없다.
- **메시 노드와 부위 규약**(`manifest.json.partMeshes[]`):
  - `TS_AuthoredHair_<style>_LOD0|1|2` — 제작 툰 헤어. 비스킨, 부모 = `mixamorig:Head`(로컬 TRS 보유). 속성
    POSITION/NORMAL/TEXCOORD_0/**COLOR_0**(shade·highlight 존)/COLOR_1. `extras.toonstudio_lod`로 LOD 식별.
    glTF는 가시성이 없어 세 LOD가 모두 로드되므로 **LOD1/2는 로더가 숨긴다**.
  - `Avatar_Orion_Body` — 스킨 바디(의상 포함, 단일 메시, 2 primitive: `mat_orion_body`, `mat_orion_wireframe`),
    morph target 40개(원본 viseme/blink 16 + 의미 기반 24). **Babylon.js 9.19 로더는 이 메시를
    `Avatar_Orion_Body_primitive0`(2,604 tri)·`Avatar_Orion_Body_primitive1`(3,596 tri) 두 서브메시로 나누고
    `Avatar_Orion_Body`를 부모 TransformNode로 둔다**(NullEngine 실측). 각 서브메시가 자기 MorphTargetManager(40개)를
    가지므로 shape key 값은 둘 다에 걸어야 한다(`manifest.json.partMeshes[].babylonLoad`).
  - `TS_Orion_Brow_L/R`(눈썹, morph 5), `TS_Orion_EyePanel_L/R`(눈 패널, morph 3: Blink/Wide/Squint),
    `TS_Orion_Pupil_L/R`(눈동자) — 모두 스킨 메시.
  - `hair / top / bottom / shoes / accessory` 규약: 헤어만 실제 메시가 있다. 상의·하의·신발 메시는 없고(의상이 바디에
    구워짐) 액세서리는 본 노드(`mixamorig:Head`, 양손, `mixamorig:Spine2`, `mixamorig:Hips`)에 런타임 부착한다.
- **shape key(morph target) 이름과 의미**(`manifest.json.shapeKeys[]`): 의미 기반 키는 `face<축><방향>` 쌍 12축 —
  `eyeSize`(Big/Small)·`eyeSpacing`(Wide/Narrow)·`eyeTilt`(Up/Down)·`noseHeight`(High/Low)·`noseWidth`(Wide/Narrow)·
  `noseDepth`(High/Low)·`mouthWidth`(Wide/Narrow)·`lipFullness`(High/Low)·`jawWidth`(Wide/Narrow)·
  `chinLength`(Long/Short)·`cheekVolume`(High/Low)·`earSize`(Big/Small). 값 범위 0..1, 쌍 중 한쪽만 0보다 크게 쓴다
  (`manifest.json.semanticAxes[]`에 increase/decrease 이름과 target index). 표정은 원본 키
  (`blendShapeN.vrc_v_*` viseme, `vrc_blink`, `HappyBrow`…)와 **VRM preset bind 표**
  (`manifest.json.expressions.vrmPresets[]`: 예 `happy`=5 bind, `aa`=1 bind)로 재현한다. 의미 기반 키는 표정
  프리셋에 섞지 않는다.
- **재질·텍스처**: 바디는 임베드 PNG 텍스처(baseColor + emissive + metallic 계열 3장). 헤어·눈썹·눈 패널·눈동자는
  팔레트 색 `baseColorFactor` + `KHR_materials_clearcoat`/`KHR_materials_specular`. MToon/툰 셰이딩은 GLB에 없으니
  런타임 셰이더가 담당하고, 헤어는 `baseColor × COLOR_0`로 음영 존을 복원한다. 팔레트(base/shadow/highlight/outline)는
  `config/blender/avatar-orion-production.json`의 `hair.palette`에 있다.
- **15슬롯 매핑**(`slot-mapping.json`, 슬롯 ID와 `status` 어휘 `available | partial | unavailable`은 character-lab
  계약 `src/contracts/slots.ts`의 `CHARACTER_SLOT_KINDS`·`SlotCapabilityStatus`와 같고 `capabilities`는
  `SlotCapabilityMap` 모양이다): Orion 기준 available = face-shape·eyes·nose·mouth·expression·pose·hand-pose,
  partial = irises·ears·hair·body·accessory, unavailable = top·bottom·shoes. reference는 face-shape·eyes·nose만
  available이고 스켈레톤·표정이 없어 pose·hand-pose·expression·body·irises·accessory는 unavailable이다. partial·
  unavailable 항목에는 카드에 그대로 보여 줄 `reasonKo`와 `missing[]`을 적었다.
- **character-lab morph 규약과의 대응**: 의미 기반 키는 `src/contracts/morph-names.ts`의
  `BLENDER_SHAPE_KEY_ALIASES`(예 `faceEyeSizeBig` → `param:eyeSize:+`)와 1:1이며 `manifest.json.shapeKeys[].contractMorphName`에
  같은 이름을 적었다. 표정 키에는 FACS 16유닛 근사 힌트(`facsHint`, `approximate` 표시)만 붙였고 viseme 대부분은
  대응 유닛이 없다. 체형 파라미터(`param:height:+` 등)는 패키지에 없다.

로드 검증: `@babylonjs/core`/`@babylonjs/loaders` 9.19.0 NullEngine으로 두 GLB를 실제 로드해 메시 이름·삼각형 수·
morph target 이름/순서·부모 노드·humanoid 본 존재를 `manifest.json`과 대조했다(결과는 7절).

## 5. 생성 스크립트

Blender 실행 없이 파이프라인 출력에서 패키지를 다시 조립하는 Node 스크립트는 세션 scratchpad에 있고 저장소에는
넣지 않았다(`cl-build/build-package.mjs`: GLB/VRM JSON 청크만 읽어 manifest 생성, `cl-build/build-slot-mapping.mjs`:
15슬롯 표, `cl-build/build-all.sh`: contact sheet + 조립 + index). 저장소에 두려면 `scripts/`의 정책(읽기/쓰기 분리,
`--check`)에 맞춰 통합 담당이 옮긴다.

## 6. 남은 격차(요약, 상세는 `manifest.json.gaps[]`)

1. 헤어 outline 셸이 GLB에 없다 — kit가 outline 객체에 `hide_select=True`를 걸고 export가 `select_set` 기반이라 빠진다.
2. GLB에 MToon/VRM 확장이 없어 툰 셰이딩·외곽선은 런타임 몫이다. 헤어 COLOR_0는 attribute로만 존재한다.
3. 의미 기반 얼굴 키가 단일 바디 메시에 생성됐고(신뢰도 0.8, 변위 한계 0.022) 로봇 형상이라 nose/lip/ear 축의 시각
   변화가 작다.
4. 상의·하의·신발·액세서리 메시, 체형 shape key, `irisSize` 키가 없다.
5. 헤어 스타일은 config로 구운 1종이며 런타임 전환은 파이프라인 재실행이 필요하다.
6. VRM 파일은 character-lab에 넣지 않았다(필요하면 `batch_generated/`에서 재생성).
7. `scripts/setup-toonstudio-blender-pipeline.mts`의 `--check` 프로브는 `hasattr(bpy.ops.X, "y")`를 쓰는데 Blender는
   미등록 연산자에도 True를 돌려준다. 확장이 전혀 없는 새 `HOME`에서도 `--check`가 통과하는 것을 확인했고,
   `bpy.ops.import_scene.vrm.get_rna_type()`은 설치 전 실패·설치 후 성공으로 실제 상태를 구분했다. 루트 스크립트는 이
   작업에서 수정하지 않았으므로 별도 수정이 필요하다.
8. 렌더 해상도·샘플을 낮춘 config 사본으로 실행해 `configDigest`가 CI와 다르다. GLB는 실행 간 바이트 동일성이
   없으므로(2절) CI 산출물과도 SHA-256이 다를 수 있다. 재생성 시 `index.json`·`manifest.json`의 SHA-256을 함께 갱신한다.

## 7. 검증 기록(2026-10-01)

- Blender `--version` = 5.2.1 LTS(hash 9e2066aef7ef), tarball SHA-256 일치.
- `setup … --install-addons` exit 0(ToonStudio 확장 `toonstudio-character-pipeline-1.0.0.zip`, VRM Add-on
  `VRM_Addon_for_Blender-Extension-4_5_0.zip` SHA-256 `e5e0f923…a35a` 일치), `--check` exit 0.
- 파이프라인 두 건 모두 `TOONSTUDIO_CHARACTER_PIPELINE_COMPLETE … "passed": true, "score": 100`.
- Babylon NullEngine 로드 대조와 저장소 검사(`pnpm harness:verify` 등) 결과는 작업 보고에 기록했다.
