# ToonStudio 3D 경쟁 벤치마크와 기능·품질 감사

조사일: 2026-09-12. 기준 소스: `29aa82c1214fe9dbeba6712fcb9fc523528ef8f2`.

이 문서는 이번 개선 전의 기준 상태와 검증 기준을 기록한다. 이후 수정 내용·실행한 테스트·실제 브라우저 결과는 별도 구현/검증 기록에서 확인해야 한다. 아래에서 **공식 확인**은 해당 서비스의 공개 안내/사용 설명서를 열어 확인한 기능, **소스 확인**은 ToonStudio 구현을 읽어 확인한 사실, **미검증**은 동일 조건에서 직접 실행한 비교 자료가 없다는 뜻이다. 경쟁 서비스의 실제 앱을 설치해 시간·화질·작업 성공률을 측정한 보고서는 아니다.

현재 가장 큰 문제는 기능 개수가 아니다. 실제 장면에 연결되지 않은 조작, 원본 에셋에 따른 편집 편차, 결과물의 정확한 재현, 저장 후 재편집의 신뢰성이 전문 도구 수준을 결정한다. 소스에 기능명이나 계산 함수가 있다는 이유만으로 사용자 기능을 완료로 계산해서는 안 된다.

## 1. 비교 범위와 공식 근거

| 서비스 | 확인한 공식 기능과 비교 목적 | 확인하지 않은 것 |
|---|---|---|
| SHAPER | 얼굴·헤어·체형·의상·포즈 프리셋, 메시 위 드로잉, 이미지 프리셋 추천, 사진/카메라 포즈, 투명 배경, 항목별 PSD. 캐릭터 제작과 웹툰 후반 작업의 기준. [사용 가이드](https://shaper.webtoons.com/how-to/) | 실제 조작 지연, 모델 수, 모든 조합의 품질, PSD의 정확한 레이어 구조 |
| SHAPER 제공 형태 | 공식 홈페이지는 Windows/macOS 다운로드를 제공한다. 웹 주소를 열 수 있다는 사실이 브라우저 편집기라는 뜻은 아니다. [홈페이지](https://shaper.webtoons.com/) | 설치 앱의 런타임·내부 엔진·최신 빌드 번호 |
| CLIP STUDIO PAINT | 체형을 조절하는 3D 인형, 포즈·손 자세, 사진 포즈와 다양한 각도의 작화 참고. [캐릭터 포즈 안내](https://www.clipstudio.net/en/characterart/pose-reference/) | 모든 에디션의 동일 기능 제공 여부, 동일 파일의 처리 속도 |
| CLIP STUDIO PAINT EX | 3D 선·텍스처 선·톤을 분리하고 선 폭, 외곽선 강조, 벡터/래스터 출력을 조절한다. 최신 설명서는 부드러운 면/투명 부품에서 불필요한 선을 줄이는 모드도 구분한다. [LT 변환 설명서](https://help.clip-studio.com/en-us/manual_en/390_filters/Convert_to_lines_and_tones_%28EX_only%29.htm) | ToonStudio와 동일 장면의 선 품질 비교 |
| VRoid Studio | 부위별 프리셋과 파라미터, 3D/UV 텍스처 페인트, 필압·레이어, 스트로크로 만드는 헤어, 의상 편집, VRM 내보내기. 캐릭터 자산 제작의 기준. [공식 제품 페이지](https://vroid.com/en/studio) | ToonStudio와 동일 체형/의상 조합의 변형 품질 |
| JustSketchMe | 웹에서 관절·손 포즈, 소품 부착, 지면 배치, 빛·그림자·화각, 포즈와 장면 저장. 적은 조작으로 참고 장면을 만드는 기준. [공식 설명서](https://justsketch.me/docs/) | 실제 장면 저장 지연, 각 구독의 현재 제한 |
| SketchUp | 장면에 카메라·태그 가시성·단면·스타일·안개·그림자·환경을 저장한다. [장면](https://help.sketchup.com/en/sketchup/creating-scenes) / 선 두께·윤곽·원근에 따른 강조를 제어한다. [선 스타일](https://help.sketchup.com/en/sketchup/edge-styles) | 웹툰 전용 툰 셰이더와 캐릭터 편집기 동등성 |
| Blender | Grease Pencil과 Line Art의 모델링·선 제작 흐름을 참고한다. 공식 4.5 설명서에서 선/소재/수정자 계층을 확인했다. [Grease Pencil](https://docs.blender.org/manual/en/4.5/grease_pencil/index.html) | 이 조사에서 최신 영문 Line Art 상세 페이지 본문은 수집 실패. 내부 구현에 관한 추가 추정은 하지 않음 |

경쟁 도구들은 같은 일을 모두 수행하지 않는다. SHAPER·VRoid는 캐릭터 제작, JustSketchMe는 포즈 참고, SketchUp은 공간과 재사용 장면, CSP는 원고 완성에 강한 비교축이다. ToonStudio는 이를 한 컷 제작 흐름에서 연결할 때 가치가 있다. 엔진이나 메뉴를 더 추가하는 것은 그 자체로 개선 근거가 되지 않는다.

## 2. 비교 기능을 실제 작가 결과로 바꾸는 기준

| 비교축 | ToonStudio에서 입증해야 할 결과 | 기준 상태 판단 |
|---|---|---|
| 캐릭터 프리셋 | 카드에서 예상한 눈·코·머리·의상이 실제 선택 모델에 적용됨 | 슬롯·적용 계획 존재. 모델 능력에 따른 일부/불가 상태 존재 |
| 얼굴과 체형 | 정면뿐 아니라 측면·웃음·입 벌림·목 회전에서도 인상이 유지됨 | morph/적응형 변형 존재. 에셋별 시각 검증 필요 |
| 헤어·의상 | 체형 변경과 팔 들기·앉기에서 두피 노출·관통·실루엣 붕괴가 없음 | 절차형 자산과 fitting 존재. 고품질 원본 메시와 동등하다는 증거 없음 |
| 포즈와 손 | 프리셋 적용 후 손·발·접촉점을 조정하고 되돌릴 수 있음 | 포즈/손/IK 구현 있음. Pro Suite 일부는 장면에 연결되지 않음 |
| 이미지 참고 | 추천이 실제 사용할 수 있는 프리셋으로 이어짐 | 로컬 MediaPipe 임베딩과 공급자 검증 있음. 유사도 품질은 미측정 |
| 메시 드로잉 | 회전·표정·포즈·저장 후에도 선이 같은 표면을 따라감 | 텍스처 페인트와 삼각형 anchor 기반 Surface Ink 존재 |
| 배경 장면 | 인물·소품·공간·카메라·빛을 한 장면에서 편집·복원 | BG3D와 공유 장면 문서 존재. 경로별 완료도 별도 검사 필요 |
| 만화 선화 | 형상선과 무늬를 분리하고 검은 재질이 통째로 주선이 되지 않음 | 일반 선 추출과 Character PSD의 추출 방식이 다름 |
| 출력 | 투명 PNG/PSD의 크기·색·마스크가 편집 화면과 일치 | Character PSD 최대 변 2048, BG3D 배치 pass 구분 존재 |
| 컷 간 재사용 | 저장한 카메라와 빛으로 같은 장면을 재현 | 샷/배치 구조 존재. 같은 문서 재개방으로 입증해야 함 |
| 성능 | 대표 장면의 입력 지연과 프레임 시간 측정, 장면 왕복 시 자원 안정 | device quality/governor 있음. 옵션 존재가 측정 결과는 아님 |

## 3. 기존 기능 상세 감사

아래 경로는 모두 `apps/web/src/domains/creator/` 기준이다. `확인`은 소스가 존재한다는 뜻이며 브라우저 통과를 뜻하지 않는다.

### 3.1 캐릭터 제작

| 세부 기능 | 구현 근거 | 분석·다음 검증 |
|---|---|---|
| 얼굴형 | `character-shaper/character-shaper-catalog.ts`, `vrm/studio-vrm-avatar-forge.ts` | 얼굴 너비·높이·깊이·볼·턱 파라미터 조합. 서로 다른 원본에서 동일한 미적 결과를 보장하지 않음 |
| 눈 크기·간격·눈꼬리 | `character-shaper/character-shaper-capability.ts`, `vrm/studio-vrm-semantic-face-morph.ts` | shape key 또는 적응형 얼굴 provider를 점검. 눈꺼풀/눈동자/눈썹의 겹침을 3/4·측면에서 확인할 것 |
| 홍채 크기·색 | `character-shaper/character-shaper-iris-tint.ts` | 홍채를 식별할 수 있는 모델만 지원. 얼굴 통합 재질·비표준 이름 사례 필요 |
| 코·입·귀 | `character-shaper/character-shaper-catalog.ts` | 프리셋 형태가 glyph에 그려져도 실제 메시 결과는 provider에 좌우됨. 최소/최대 조절과 표정 조합 필요 |
| 체형·등신 | `vrm/studio-vrm-proportion-core.ts` | 골격 비율 변경 이후 손·발·의상 크기와 접지까지 함께 검증해야 함 |
| 헤어 | `vrm/studio-vrm-avatar-forge.ts` | 원본 헤어 보존/절차형 스타일 구분. 머리 뒤와 옆에서 가닥·두피·얼굴선 품질 확인 필요 |
| 상의·하의·신발 | `vrm/studio-vrm-wardrobe.ts` | 코드가 `standard-procedural`/`low-fidelity-procedural`을 명시. 기본/겉옷 여유와 스키닝·스커트 dynamics가 있으나 authored garment 품질과 별개 |
| 의상 자동 맞춤 | 같은 파일의 `fitProfile`, `fitMode`, `buildGarmentParts` | 포즈·body morph를 반영한 실제 관통 비율로 평가. 단순 정상 로딩은 불충분 |
| 액세서리 | `vrm/studio-vrm-props.ts`, `character-shaper/character-shaper-catalog.ts` | 다중 선택 지원. 부착점·회전·scale·저장 후 재부착을 확인할 것 |
| 표정 | `studio-pose-presets.ts`, `character-shaper/character-shaper-capability.ts` | VRM expression 이름과 지원 범위를 사용. 표정 합성 시 눈·입이 겹치거나 얼굴이 찢어지지 않아야 함 |
| 지원 가능성 안내 | `character-shaper/character-shaper-capability.ts`, `character-shaper/character-shaper-slot-support.ts` | unsupported를 조용히 대체하지 않는 설계는 유지. 기술 능력과 미적 품질 등급을 혼동하지 않을 것 |
| 프리셋 검색·즐겨찾기·정밀 조절 | `character-shaper/CharacterShaperShelf.tsx`, `character-shaper/character-shaper-favorites.ts`, `character-shaper/character-shaper-precision.ts` | 선택→조절→실행취소→재선택 후 수치와 썸네일 일관성이 핵심 |

### 3.2 포즈·표면 작업·참고 이미지

| 세부 기능 | 구현 근거 | 분석·다음 검증 |
|---|---|---|
| 전신 포즈 | `studio-pose-presets.ts`, `studio-character-ik-fk.ts` | 모든 포즈 수보다 체형별 앉기·팔 들기·손 짚기·달리기 성공률이 중요 |
| 손 프리셋·개별 조절 | `character-shaper/character-shaper-hand-glyph.ts`, `studio-hand-pose-scanner.ts` | 좌/우·양손 대응, 엄지축, 손목 비틀림과 누락 finger bone 사례 필요 |
| 전체 몸 IK | `vrm/studio-vrm-full-body-ik.ts`, `vrm/studio-vrm-ik-constraints.ts` | target 도달 오차와 관절 제한을 동시에 확인. 수학 결과와 렌더 bone 적용을 분리 검증 |
| 소품을 향한 IK | `vrm/studio-vrm-prop-ik.ts` | 살아 있는 모델/소켓 경로와 Pro Suite의 독립 UI를 혼동하지 않을 것 |
| 사진 포즈 | `vrm/studio-vrm-photo-pose-inference.ts`, `vrm/studio-vrm-photo-pose-apply.ts` | 실제 사진·측면·부분 가림·여러 사람·실패 입력, preview 후 적용/취소 흐름 필요 |
| 이미지 프리셋 추천 | `vrm/studio-vrm-avatar-reference-recommendation.ts` | MobileNet V3 Small 임베딩, 모델 hash·catalogue revision 검증, 최대 Top 5. 일반 이미지 임베딩 유사도는 작가가 원하는 얼굴/의상 유사도와 같지 않음 |
| 이미지 색 추출 | `character-shaper/character-shaper-palette-extract.ts`, `character-shaper/CharacterShaperReferenceDrawer.tsx` | 추천과 별개 로컬 이미지 팔레트 경로. 배경색을 피부/머리색으로 잘못 취하는 사진으로 평가 |
| 텍스처 페인트 | `vrm/studio-vrm-surface-paint-tool.ts`, `vrm/studio-vrm-texture-paint-project-library.ts` | UV seam·해상도·alpha·필압·저장·export를 한 묶음으로 확인 |
| Surface Ink | `character-platform/surface-ink/character-surface-ink-pointer.ts`, `character-platform/surface-ink/character-surface-ink-three-mesh.ts` | raycast hit를 삼각형/barycentric anchor로 보존. 표정·포즈 추종, topology 변경 감지와 저장 복원이 핵심 |
| 회복 | `character-platform/surface-ink/character-surface-ink-storage.ts`, `character-shaper/useCharacterShaperHistory.ts` | 예외/재진입/모델 전환 중 데이터 누락과 잘못된 모델에 복원되는 문제를 확인 |

### 3.3 배경·렌더·원고 전달

| 세부 기능 | 구현 근거 | 분석·다음 검증 |
|---|---|---|
| 공유 3D 장면 | `studio-shared-3d-stage-document.ts`, `studio-shared-3d-insert-contract.ts` | 여러 편집 화면이 동일 문서를 사용하는지 저장·재개방으로 검증 |
| 방·공간·템플릿 | `studio-background-3d-scene-templates.ts`, `scene-3d/studio-3d-room-builder-v2.ts` | 실제 단위·벽 두께·문/창·카메라 충돌·그림자와 원고 구도 점검 |
| 카메라·렌즈·샷 | `studio-3d-camera-path.ts`, `scene-3d/studio-3d-camera-perspective-lens.ts`, `bg3d/studio-bg3d-production-multipass.ts` | 계산 utility와 실제 카메라 mutation 구분. 화면비 변경 후 같은 구도 유지 필요 |
| 조명·그림자·재질 | `scene-3d/studio-3d-material-system.ts`, `scene-3d/studio-3d-toon-pass-pipeline.ts` | 피부 중간톤, 얼굴 그림자, 발밑 접지, 검은 재질과 투명 머리카락으로 검사 |
| 일반 선 추출 | `scene-3d/studio-3d-line-art-extractor.ts` | Sobel/Canny/DoG/normal-depth/hybrid와 벡터 결과 구조 존재. 실제 pass 제공 여부 및 화면 노이즈 검증 필요 |
| Character PSD | `character-shaper/character-shaper-semantic-psd.ts` | beauty/flat 차분으로 shadow·highlight, Sobel+near-black으로 line 생성. 분리 가능한 mesh/material에 따라 semantic mask 범위가 달라짐 |
| PSD 재현 한계 | 같은 파일 | capture 형식이 WebGL renderer이며 최대 변 2048. 임의 GLB/PBR와 WebGPU까지 지원한다고 일반화하지 말 것. Multiply/Screen 합성은 단순 차분만으로 beauty를 정확히 복원한다는 보장이 없음 |
| BG3D 제작 배치 | `bg3d/studio-bg3d-production-multipass.ts` | production은 beauty, LT composite, color, tone, texture-line, main-line, depth. 최대 64 shots, contact sheet 12 shots/page |
| 아직 production이 아닌 pass | 같은 파일의 `STUDIO_BG3D_DEFERRED_ARTIFACT_PASSES` | normal/object-ID/material-ID/shadow/AO/emission/velocity는 capture 계약과 별개로 production 승격 보류를 명시. UI에서 출력 가능하다고 약속하면 안 됨 |
| 문서 전달·재편집 | `studio-linked-3d-pass-cloud-sync.ts`, `studio-linked-3d-pass-project-archive.ts` | 캔버스 이미지 삽입뿐 아니라 원래 3D 문서·assets·camera를 다시 여는 것까지 검사 |
| 성능 자동 조절 | `bg3d/studio-bg3d-device-quality.ts`, `bg3d/studio-bg3d-frame-quality-governor.ts` | 움직일 때 품질과 정지/내보내기 품질을 분리하되 장치·backend·memory가 기록되어야 함 |
| 자산 품질 기준 | `studio-3d-asset-quality.ts`, `studio-3d-asset-supply.ts` | 예산·stress pose·render QA·출처 구조는 존재. 실제 자산이 그 증거를 충족했는지 개별 확인 필요 |

### 3.4 Pro Suite 20개 노출 항목: 표시·구현·검증 분리

다음 표의 행 번호는 문서 상단 **기준 SHA**에 고정된 소스의 행 번호다. 파일 재구성 후 행이 이동할 수 있으므로 현재 작업 파일과 혼동하지 않는다. `P`는 `bg3d/StudioBg3dProSuitePanelContent.tsx`, 하위 패널 이름은 `bg3d/` 안의 파일이다. 제품 진입은 `StudioBg3dViewPanelContent.tsx:613`이다. 이 표의 **브라우저 검증**은 모두 이번 조사에서 미실시이며, 표의 결함은 직접 소스를 추적해 확인한 것이다.

| 화면이 제공하는 항목 | 기준 소스의 실제 구현·연결 상태 | 행 근거 | 브라우저 검증 |
|---|---|---|---|
| 소품 그립 | 그립·소켓·악력 state만 변경. 장면 mutation 없음 | `P:86`, `P:258`, `P:289`, `P:314` | 미실시 |
| 셰이퍼 3D | 별도 패널에서 체형/표면 잉크 토글/감정/컷을 local state로 관리. 실제 Character Shaper 편집 경로와 별개 | `P:322`, `StudioBg3dShaperTooningStudioPanel.tsx:8`, `:20`, `:21`, `:29` | 미실시 |
| 지면 착지락 | 실제 선택한 캐릭터 대신 고정 bone 좌표 계산→상태 문구 표시 | `P:389`, `P:411` | 미실시 |
| 캐릭터/표정 | 하위 패널에 proportions/expression callback은 있으나 Pro Suite 호출이 둘 다 전달하지 않음 | `P:633`, `StudioBg3dCharacterAnimatorPanel.tsx:15`, `:39`, `:44` | 미실시 |
| 헤어 가닥 | 단면/끝단을 local state에만 저장 | `P:106`, `P:733`, `P:758` | 미실시 |
| 만화 렌즈 | 선택 lens·원근 과장·소점 state만 변경 | `P:97`, `P:576`, `P:601`, `P:614` | 미실시 |
| 컷 디렉터 | wrapper가 production runtime context에서 camera/shot/bookmark 명령을 받아 content에 전달. 이 항목은 이미 장면 연결이 있음 | `P:630`, `StudioBg3dCinematicDirectorPanel.tsx:125`, `:147`, `:262` | 미실시 |
| 투닝 연출 | component-local bubble engine에 항목 추가. 장면 render/문서/선택 캐릭터에 전달하지 않음. 감정 기호는 state만 변경 | `P:122`, `P:501`, `P:539` | 미실시 |
| 배경 컬링 | 벽·천장 자동 숨김과 시간대 state만 변경 | `P:102`, `P:672`, `P:700` | 미실시 |
| 웹툰 필터 | filter preset의 숫자/설명만 표시. renderer에 config 전달 없음 | `P:111`, `P:433` | 미실시 |
| 2.5D 집중선 | 하위 패널의 speedline/SFX callback을 전달하지 않음 | `P:467`, `StudioBg3dSpatialFxPanel.tsx:11`, `:62`, `:77` | 미실시 |
| 3D 효과음 | text spec를 계산하는 callback이 있으나 전달하지 않음 | `P:642`, `StudioBg3dTextExtruderPanel.tsx:12`, `:44` | 미실시 |
| 3D 파티클 | preset 선택 callback이 있으나 전달하지 않음. 강도·바람은 하위 local state | `P:639`, `StudioBg3dParticleVfxPanel.tsx:9`, `:19`, `:38` | 미실시 |
| 맷캡 재질 | shader preset callback을 전달하지 않음 | `P:645`, `StudioBg3dMatCapStudioPanel.tsx:9`, `:29` | 미실시 |
| 3D 망점/톤 | screentone config callback을 전달하지 않음 | `P:648`, `StudioBg3dHalftoneScreentonePanel.tsx:11`, `:43` | 미실시 |
| 인터랙션 | 문/서랍 등 component transform callback을 전달하지 않음 | `P:555`, `StudioBg3dDynamicComponentsPanel.tsx:13`, `:29` | 미실시 |
| 3D 클로너 | 복제 결과 callback을 전달하지 않음 | `P:636`, `StudioBg3dClonerPanel.tsx:12`, `:76` | 미실시 |
| 디포머 | mesh deformation config callback을 전달하지 않음 | `P:651`, `StudioBg3dDeformersPanel.tsx:9`, `:29` | 미실시 |
| 렌즈 PostFX | postprocess config callback을 전달하지 않음 | `P:654`, `StudioBg3dPostProcessVfxPanel.tsx:11`, `:23` | 미실시 |
| 멀티패스 | wrapper가 production batch context를 사용하고 pass readiness를 평가·필터링한 뒤 실제 출력 panel을 연결. 독립 planner와 구분 | `P:657`, `StudioBg3dMultiPassExporterPanel.tsx:24`, `:29`, `:53` | 미실시 |

20개 중 컷 디렉터와 멀티패스는 wrapper의 context 연결까지 추적했으며, props가 없다는 이유만으로 미연결이라고 판정하지 않았다. 다른 18개의 local 상태/미전달 callback 문제와 구분한다. 이 표는 다른 화면에서 같은 모듈을 정상 연결해 사용하는 경로까지 고장났다는 뜻이 아니다. 실제 연결된 production 카메라·샷·배치 출력 경로와 readiness 검사를 보존하고, 이 Pro Suite 진입점의 약속을 실제 동작과 일치시키는 것이 개선 대상이다.

### 주요 근거를 다시 찾는 위치

| 판정 | 기준 SHA의 소스 위치 |
|---|---|
| Character Shaper 15개 슬롯 | `character-shaper/character-shaper-catalog.ts:48` |
| 추천이 사용하는 이미지 임베딩 모델 | `vrm/studio-vrm-avatar-reference-recommendation.ts:10` |
| Surface Ink가 삼각형과 topology에 붙는 구조 | `character-platform/surface-ink/character-surface-ink-pointer.ts:76` |
| Character 출력 크기가 viewport canvas에서 유도됨 | `character-shaper/CharacterShaperOutputDock.tsx:184`, `:231` |
| Character PSD 최대 변 2048 | `character-shaper/character-shaper-semantic-psd.ts:119` |
| shadow/highlight 차분 생성 | `character-shaper/character-shaper-semantic-psd.ts:641` |
| Sobel 기반 Character 주선 | `character-shaper/character-shaper-semantic-psd.ts:646` |
| BG3D production 보류 pass 목록 | `bg3d/studio-bg3d-production-multipass.ts:65` |
| asset runtime 예산 | `studio-3d-asset-quality.ts:77` |

## 4. 우선 해결해야 할 구체적 결함

### P0 — 표시되는 전문 도구와 실제 장면 편집 사이의 단절

`bg3d/StudioBg3dViewPanelContent.tsx`의 Pro Suite 탭은 `StudioBg3dProSuitePanel`을 렌더링한다. 기준 소스의 `StudioBg3dProSuitePanelContent.tsx`는 `disabled`만 props로 받는다. 아래 컨트롤은 local `useState`를 갱신하고, 선택한 장면/모델/camera를 수정하는 연결이 없다.

- 그립 종류, 소켓, 악력: 선택 UI 값만 변경한다.
- 만화 렌즈, 원근 과장, 소점: local 설정 값만 변경한다.
- 자동 벽/천장 숨김과 시간대: local 값만 변경한다.
- 헤어 가닥 형태/끝단: local 값만 변경한다.
- 웹툰 필터: 프리셋 설명과 숫자만 바뀐다.

더 명확한 사례는 같은 파일의 `양발 바닥 착지 락 & 골반 높이 적용`이다. 버튼은 선택 캐릭터의 실제 뼈 대신 코드에 고정된 hip/knee/ankle/toe 좌표를 solver에 전달하고, 반환된 설명을 `setFootStatusMessage`로 표시한다. 골반/발 bone을 변경하지 않는다. `footAutoPelvis`와 `footPreventSlip` 조작도 solver 설정으로 전달되지 않는다. 성공으로 오해할 수 있는 UI이며, 테스트가 status 문구만 확인하면 이 결함을 놓친다.

**완료 기준:** 사용 가능한 실제 편집 기능으로 연결하거나, 명확한 개발용 실험으로 분리한다. 제품에서 제공하는 컨트롤은 선택 장면에 변화를 만들고, 실행취소·저장·재개방까지 같은 값이 유지돼야 한다. 다른 하위 패널은 각자의 연결 상태를 별도로 감사해야 하며 위 결과를 자동으로 일반화하지 않는다.

### P1 — 캐릭터 자산과 편집 파라미터의 결과 품질

프리셋 이름을 늘리는 것으로 authored head/hair/garment를 대체할 수 없다. 특히 샷에 크게 나오는 얼굴과 손, 팔을 들었을 때의 겨드랑이·어깨, 앉았을 때의 치마·허벅지는 모델과 corrective deformation 품질에 좌우된다. 소스의 quality passport는 평가 구조이지 자산이 고품질이라는 영수증이 아니다.

**완료 기준:** production 기본 자산에 얼굴 24 views, 최소 32 stress poses, 동시 body morph/표정/의상 조합 기록과 명시적 holdback 결정을 남긴다. 실제 원고에 사용할 수 없는 모델은 기본 추천에서 빼고 필요한 고품질 원본을 제작·선별한다.

### P1 — 출력물을 다시 합성했을 때의 정확성

기준 출력 dock은 PNG와 PSD 크기를 viewport canvas에서 유도한다(`CharacterShaperOutputDock.tsx:184`, `:231`). 창 크기나 DPR에 따라 원고 출력 크기가 달라지는 구조다. 출력 크기를 명시적으로 선택하고 예상 크기를 표시해야 한다. 캡처 중 중복 클릭·모델 변경·포즈 변경과 같은 동시 조작도 같은 장면의 스냅샷을 깨뜨리지 않아야 한다.

검은 머리나 검은 옷의 면 전체를 주선으로 분류하는 오류, 그림자 경계를 선으로 복제하는 오류, 투명 가장자리의 halo, semantic mask 중첩, PSD 합성에서의 색 변화는 후반 작업 시간을 직접 늘린다. Character PSD와 BG3D의 다른 출력 경로에 각각 실제 픽셀 기반 검증이 필요하다.

**완료 기준:** opaque/transparent·밝은/검은 재질·얼굴·의상 패턴을 포함한 기준 장면으로 PSD 레이어를 합성하고 beauty와 비교한다. 빠진 pass는 이유를 표시하며 실제 제공하지 않는 의미의 레이어명을 사용하지 않는다.

### P1 — 문서·장면·메시 드로잉의 재편집

동일 캐릭터를 다시 열었을 때 표정, 포즈, 카메라, 선이 달라지면 연재용 도구가 될 수 없다. 기기 안에서의 캐시와 프로젝트에 영구 저장한 데이터는 별도로 확인해야 한다.

**완료 기준:** 3D 편집→컷 삽입→저장→브라우저 재개방→3D 수정→동일 컷 갱신 흐름을 수행한다. Surface Ink·옷·소품·선화 pass·shot state가 복원되어야 한다.

### P2 — 추천과 포즈 인식의 실제 유용성

추천 모델 hash와 구조 검사는 좋은 기반이지만 결과가 작가에게 유용한지는 별개다. 체형·인상·헤어·옷으로 평가하는 샘플 세트를 만들고 Top 3 중 사용할 수 있는 선택지가 있는지 측정해야 한다. 사진 포즈는 정면 사진만 통과해서는 부족하다.

## 5. 객관적으로 반복할 수 있는 완료 기준

아래 숫자는 **제안하는 ToonStudio 내부 목표**이며 경쟁 서비스를 측정한 수치가 아니다. 첫 실행에서 장치와 baseline을 기록하고 필요하면 목표를 조정하되, 목표 변경 이유를 함께 남긴다.

| 항목 | 대표 시나리오 | 제안 통과 조건 | 증거 |
|---|---|---|---|
| 실제 편집 연결 | 모든 노출 컨트롤에서 최소 한 가지 값 변경 | 실제 문서/장면 변화, undo/redo, 저장 후 복원. 미지원은 정확히 안내 | mutation/문서 diff와 전후 이미지 |
| 캐릭터 형태 | production model × 정면/측면/후면/3/4 × 체형 극값 × 주요 표정 | 얼굴 부품 노출·심각한 붕괴 0; 기본 추천 자산 모두 판정 | contact sheet와 자산별 holdback |
| 의상 변형 | 팔 120도 들기, 만세, 팔짱, 의자 앉기, 쪼그리기, 달리기 | 주인공 샷에서 보이는 심한 관통 0; 경미한 관통도 위치·범위 기록 | stress-pose 캡처와 원인 |
| 접촉 | 컵/전화/펜/칼을 쥔 손, 평지/단차에서 발 | 월드 scale이 m인 fixture에서 목표 접촉 오차 ≤5mm; 관절 제한 유지 | 좌표 오차+실제 화면 |
| Surface Ink | UV seam, 모프 극값, 어깨/무릎 skinning, 저장·재개방 | 선 이탈·반대편 누출·의도치 않은 모델간 복원 0 | stroke 문서와 전후 이미지 |
| 사진 포즈 | 정면/측면/가림/다중 인물/비인물 | 실패를 명확히 반환, preview 취소는 문서 불변, 적용 후 undo 가능 | 입력 분류별 성공/실패/수정시간 |
| PSD | 2048 표준, 투명 실루엣, 검은 의상, patterned cloth | 파일 파싱·레이어 비어 있지 않음; intended composite와 beauty 차이를 수치화. 목표 opaque 영역 MAE ≤2/255, 경계 오차 별도 | PSD, composite PNG, pixel diff |
| 카메라와 컷 | wide/portrait/extreme aspect + 여러 shots | 저장 camera로 다시 렌더한 주요 landmark 위치 ≤1px(동일 backend/크기) | shot data와 이미지 diff |
| 렌더 호환 | WebGPU와 명시적으로 선택한 WebGL2 | backend 식별, shader/texture 오류 0, alpha·색·선 폭의 승인 범위 | renderer 정보, console, 이미지 |
| 상호작용 성능 | 대표 캐릭터 2명+의상+실내 소품, 1920×1080 | 데스크톱 p95 frame ≤33.3ms와 p95 input-to-present ≤50ms를 초기 목표로 측정 | 장치·DPR·backend·cold/warm 기록 |
| 모바일 | 같은 작업을 mobile tier에서 축소 렌더 | 최소 30fps 목표; 패널이 핵심 조작을 막지 않음; focus/터치 가능 | 실제 mobile 또는 지정 device 결과 |
| 자원 수명 | 장면 load/unload 20회, 모드 전환, export 반복 | 지속 증가하는 GPU resource/context/JS heap 추세 없음 | 회차별 counts와 안정화 후 memory |
| 신뢰성 | 입력 실패/모델 404/캡처 중 취소/브라우저 재시작 | 원래 문서와 renderer state 복원, 데이터 손실 0 | recovery 결과 |

내부 asset quality 파일의 현행 `r2_standard` 예산은 80k triangles, 14 draw calls, 96MiB textures, 2048 최대 texture이며, 32 stress poses와 24 render views를 요구한다. `r3_hero`는 별도 상위 예산·40 poses를 둔다. 숫자를 코드에 선언했다고 모든 bundled asset이 통과한 것은 아니다. QA receipt가 없는 자산은 미검증으로 남긴다.

## 6. 재개발 여부를 결정하는 원칙

지금은 먼저 사용자 조작과 실제 장면을 연결하고 현재 구현의 출력·저장·리소스 결함을 고치는 것이 타당하다. 현재 `package.json`은 Three `0.184.0`, R3F `9.6.1`, `@pixiv/three-vrm` `^3.5.3`을 사용한다. 엔진을 교체해도 품질 낮은 메시, 미연결 UI, 불완전한 PSD 합성은 자동으로 해결되지 않는다.

한 화면의 흐름은 `캐릭터/배경 추가 → 외형 → 포즈·접촉 → 카메라·빛 → 선·톤 → 컷 삽입/PSD → 재편집`으로 정리한다. 작가가 엔진·solver·kernel 이름을 이해해야만 기본 작업을 끝낼 필요가 없다. 고급 설정은 실제 결과를 수정하는 경우에만 노출한다.

영구 장면/캐릭터 문서, 이미지/3D 자산, 렌더러의 실행 상태를 분리하고 장면 mutation을 한 경로에 모으면 노출 컨트롤의 성공 여부를 검증하기 쉽다. UI만 존재하는 전문 도구는 이 경로에 연결하는 것이 먼저다. 반복된 연결 실패가 구조에서 비롯됐다는 증거가 생기면 해당 경계를 재구성한다.

## 7. 이번 조사로 말할 수 있는 것과 남은 것

공식 경쟁 기능과 현재 코드의 대응 관계를 확인했고, Pro Suite의 장면 미연결 조작을 실제 소스로 발견했다. Character 편집·포즈·표면 드로잉·배치 출력은 이미 넓은 구현 기반이 있다. 동시에 procedural 자산 품질, PSD 합성, 보류된 pass, 실제 조작과 utility의 차이를 해결해야 한다.

**현재 근거로는 SHAPER 동등/초과 또는 더 고도화할 것이 없다는 주장을 할 수 없다.** 그 판정에는 동일한 제작 과제·자산 난이도·원고 크기를 정한 경쟁 앱 실측, 작가의 결과물 블라인드 평가, ToonStudio 저장/출력/성능 증거가 필요하다. 코드 수정과 main 머지가 끝나도 경쟁 품질 검증의 미실시 항목은 별도로 남긴다.
