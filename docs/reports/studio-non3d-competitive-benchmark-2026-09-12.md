# ToonStudio 비3D 경쟁사 벤치마크 — 2026-09-12

## 범위와 판정 기준

- 대상: `/studio`의 드로잉·색상·선택·레이어·식자·컷·페이지·출력·이력·복구·협업·AI 제작 보조. 3D 기능은 제외한다.
- Clip Studio Paint, Krita, Procreate, Photoshop의 공식 문서를 2026-09-12에 확인하고 현재 제품 소스와 대조했다. 점수나 기능 수로 우열을 선언하지 않는다.
- **기존 구현**은 코드 경로가 존재한다는 뜻이며, 실제 기기 성능·외부 제공자 성공·배포 완료까지 검증했다는 뜻은 아니다.
- **이번 개선**은 이 작업 브랜치의 변경과 검증 상태다. PR 필수 검사, main 병합, 운영 배포 상태는 최종 실행 기록에서 별도로 확인한다.
- 브러시 엔진 자체는 별도로 진행 중인 활성 작업과 조정한다. 이번 변경에서 stroke/pressure/GPU 코어를 중복 수정하지 않는다.
- 아래 코드 경로는 `apps/web/src/domains/creator/` 기준이다.

## 기능별 비교

| 영역 | 경쟁사 공식 기능 | 기존 구현과 소스 | 이번 개선·확인 상태 | 남은 범위 |
| --- | --- | --- | --- | --- |
| 브러시·입력 | Procreate의 브러시별 필압 그래프·기울기·회전·hover, Krita의 반응 미리보기 [S1][S13] | `studio-pressure-curve-graph.ts`: 지수 곡선·핸들·실측 교정. 물성 브러시, 안료, 입력 진단 경로 존재 | 별도 활성 브러시 작업과 조정 | 다중 제어점 필압의 문서/재생 호환성, 실제 펜의 지연·팜 리젝션·live/commit 일치 검증 |
| 색상·팔레트 | Procreate 조화 배색·저장, CSP 혼합 팔레트와 스포이트 [S2][S3] | `StudioColorHarmoniesPanel.tsx`, `studio-color-harmony-engine.ts`, `StudioPaletteLibraryPanel.tsx`, `studio-palette-interchange.ts`, `color/studio-color-history.ts` | 기준색 고정/갱신, 키보드 탐색·포커스·실제 기준색 표시, 중복 shade/recent radio 단일 선택, 비동기 저장 실패를 성공으로 표시하던 문제 수정; 3개 파일 21개 집중 테스트 통과 | 이름 있는 개별 색의 의미·교환 보존, 실물 혼합 결과와 물성 일치의 별도 검증 |
| 선택·변형 | Krita의 결합 모드·grow/shrink/feather/smooth/border, Photoshop 색·톤 범위 [S4][S5] | `StudioSelectionWorkbenchPanel.tsx`, `studio-selection-source-browser.ts`, `studio-selection-refinement.ts`, `studio-pixel-selection-transform.ts`: 수동/마술봉/색상/알파/기기 AI 소스·정리·변형 | 안/중앙/밖 Border Selection·표시 px 두께·기존 페더 보존·Worker·이력·취소 연결 구현 완료; 실제 Worker 8개 시나리오 확인 | 640px 추적 해상도와 영역/구멍 수 제한. 광도/채널 소스, 합성 선택, 정교한 소프트 알파 보존 |
| 선택 재사용 | Procreate 선택 저장·불러오기, CSP 선택 런처 [S6][S7] | `studio-saved-selections.ts`: 이미지별 기기 로컬 최대 16개, 버전·입력 정규화·중복 갱신 | 기존 로컬 저장 의미를 유지 | 프로젝트/CRDT에 포함되는 이름 있는 선택 채널, 썸네일·검색·동기화, 런처 구성 |
| 레이어 탐색·일괄 작업 | Krita 이름/색 라벨 필터, 그룹, 다중 선택, 잠금·알파 상속 [S8] | `layer/`: 구조화 검색·스마트 보기·필터 프리셋·품질 진단·그룹·잠금·마스크·범위 선택 | Shift 범위 확장/축소·Home/End·이름 입력 포커스·접힌 그룹 전체 선택 구현 완료; 펼친 그룹의 범위 밖 자식 과선택 수정 | 대형 트리의 기기별 탐색 성능, 모든 잠금·필터 조합의 일관성 |
| 합성·파일 보존 | Photoshop Smart Object의 원본 유지 변형·필터·연결 인스턴스 [S9] | `studio-named-states.ts`의 희소 override 상태, 마스크/효과 스택. `studio-psd-import.ts`는 텍스트·Smart Object를 픽셀로 가져온다고 명시 | 기존 가져오기 손실 설명을 유지 | editable PSD text 가져오기, linked/embedded Smart Object 원본 편집과 왕복 |
| 텍스트·식자 | CSP Story Editor의 다중 페이지 편집·이동·분할/병합·찾기/바꾸기 [S10] | `StudioDialogueBatchPanel.tsx`, `lettering/studio-dialogue-batch.ts`, `studio-dialogue-structure.ts`: 읽기 순서·일괄 편집. ruby·금칙·곡선 텍스트·자동 맞춤·번역 QA·낭독 존재 | 기존 구현을 재확인; 재구현하지 않음 | 컷 내 읽기 순서 직접 조절과 캔버스 미리보기, 다중 페이지 대사 밀도, 배치 변경 후 overflow 일관 검수 |
| 컷·스토리보드 | CSP 프레임 폴더·분할 미리보기·간격·균등 분할·복제 정책 [S11] | `studio-panel-split.ts`, `lettering/studio-bubble-anchor.ts`, `StudioStoryboardGridPanel.tsx`, `studio-page-review.ts`, `StudioPublishPreflightPanel.tsx` | 컷·말풍선·페이지 검수 흐름의 기존 경로 확인 | 여러 페이지 상태/담당자/잠금 일괄 변경, revision 충돌 검증, 승인 변경 감사로그, sequence/scene/beat 참조 연결 |
| 페이지·내보내기 | CSP JPG/PNG 분할, 너비/배율, 페이지 범위, 개별/연결 출력·휴대폰 영역 [S12] | `export/StudioExportMenuPanel.tsx`, `export/studio-export-presets.ts`, `useStudioRasterExportOrchestration.ts`: 여러 포맷·연합 스크롤·검증 ZIP. MIME·크기·SHA-256·취소 계약 존재 | `1, 3–5, 8` 직접 지정·중복 제거·원고 순서 적용 구현. 검증 ZIP도 같은 선택/사전 검사/캡처 잠금을 공유하고 원본 페이지 번호·라벨 보존; 누락 캡처 차단 | 편집 가능 포맷의 손실, 실제 투명도·해상도·장수, 플랫폼별 업로드 제한의 지속 검증 |
| 색 관리·인쇄 | Krita 프린터 ICC·intent·black-point compensation·종이 시뮬레이션 [S14] | `studio-soft-proofing.ts`, `studio-highbit-*`, `studio-icc-profile-policy.ts`: RGB 공간·고비트 코어·ICC 검사 정책 | RGB 기능과 인쇄 범위를 구분 | 정책에 명시된 LUT/CMYK는 inspect/embed-only. 프린터 LUT 실행·정확한 gamut overlay는 미완료 |
| 필터·리터치 | CSP 선택 영역 한정 필터, 원본 비교·강도, 전체 표시 레이어의 합성 사본 생성 [S18] | `StudioSmartFiltersPanel.tsx`, `StudioPhotoFilterPanel.tsx`, `studio-advanced-pixel-filters.ts`, `StudioColorBalancePanel.tsx`: 효과 스택·픽셀 보정·색 보정 | 기존 보정 경로를 유지; 새 효과 수로 품질을 주장하지 않음 | 효과마다 preview/commit/export·선택 경계·알파의 일치 검증, 큰 이미지 취소/진행률과 품질 측정 |
| 애니메이션·애니매틱 | Procreate onion skin·재생·타임라인·프레임별 옵션 [S19] | `StudioAnimTimelinePanel.tsx`, `animatic/StudioAnimaticWorkspacePanel.tsx`, `studio-anim-tracks.ts`, `animation/studio-timeline-timebase.ts`: 프레임 노출·유리수 FPS·트랙 모델 | 코드에 독립 cel 노출 모델이 있으므로 과거 문서의 blanket 미구현 표현을 사용하지 않음 | 모든 UI/파일 경로의 exposure·오디오 동기화·반올림 왕복, 코덱별 출력과 장시간 playback 검증 |
| 자·가이드·도형 | CSP 자·대칭 자·가이드를 캔버스에서 선택하고 편집 [S20] | `StudioAdvancedRulerPanel.tsx`, `StudioAdvancedRulerOverlay.tsx`, `studio-advanced-ruler-document.ts`, `studio-advanced-ruler-snap.ts`, `canvas/StudioCanvasGuideLayers.tsx` | 문서/스냅 경로 존재 확인 | 다중 핸들의 상대 수치 편집, 실제 줌·회전·화면 비율에서 표시/스냅 오차 측정 |
| 2D 소재·가져오기 | CSP 소재 폴더·태그 검색·정보·캔버스 드래그 [S21] | `StudioUnifiedAssetSmartLibrary.tsx`, `StudioUnifiedAssetToolPopoverContentDirectDrag.tsx`, `StudioAssetRightsManifestPanel.tsx`, `studio-interchange-capabilities.ts` | 2D 소재와 호환성 표기의 기존 경로 확인; 3D 소재는 제외 | 소스별 원본 공급/권리·오프라인 hydration, 가져오기 미지원 특성의 실제 파일 왕복 검증 |
| 반복 작업 자동화 | CSP Auto Action 녹화·명령 재배열·선택 실행·설정 재입력 [S22] | `studio-auto-actions.ts`, `studio-automation-recipe.ts`: 명령 스키마·페이지 범위·계획·진행/실패 계약 | 기존 구현 확인; 임의 자동화 엔진을 중복 도입하지 않음 | 기록 가능한 명령의 완전성, 다중 페이지 실패/취소/되돌리기의 end-to-end 증거 |
| 단축키·접근성 | Procreate 6방향 QuickMenu/드래그 실행, CSP 도구 내 임시 단축 조작 [S15][S16] | `StudioQuickActionsMenu.tsx`: 슬롯 구성·터치/드래그·뷰포트 배치. `StudioShortcutsHelp.tsx`: 검색·단축키 계약 | 색상 탭/색상 목록의 한 Tab 진입점·화살표·Home/End·포커스 유지 구현 | 도구별 잠금 설명, 작은 화면 배치·포커스 복원의 지속 점검 |
| 히스토리·버전 | Photoshop cloud 문서 저장 버전 탐색·썸네일·복구 [S17] | `StudioCheckpointPanel.tsx`: 이름 있는 체크포인트·서버 revision 비교/복구/변경 위치 이동. `useStudioUnifiedHistoryJournal.ts`, `studio-history-retention-ui.ts`: 통합 이력·용량·퇴출 안내 | 이름 있는 체크포인트/revision diff가 이미 있음을 재확인 | 버전 썸네일, 보관 정책 UI, 대용량 복원과 서버 충돌의 실제 실행 증거 |
| 오프라인·협업 | Photoshop의 저장 버전 복구와 Krita의 저해상도 피드백/원본 계산 분리는 참고 패턴 [S13][S17] | `studio-draft-save-outbox.ts`: 내용 없는 탭 단위 서버 저장 의도; 문서는 OPFS/SQLite 보유. vector CRDT·presence·comments와 제한된 raster replay/publisher | 전체 래스터 동시 편집 완료로 확대 해석하지 않음 | publisher는 paint/erase/fill/clear만 허용. 선택/필터/변형/병합/평면화 전 범위 일치, 기기 재시작·다중 탭·계정 ownership 검증 필요 |
| AI·제작 보조 | Photoshop의 색/톤 기반 선택은 구체적인 보조 기능의 기준으로 참고 [S5]; 제작 품질·비용·연속성 평가는 별도 | `studio-writer-room.ts`, `studio-story-bible.ts`, `writer-room/buildStudioWriterRoomCanvasPages.ts`, `studio-ai-provider.ts`, `lettering/studio-dialogue-translate.ts` | 작가실·캔버스 투영·제공자·번역 경로 존재를 확인 | 실제 제공자 성공/비용/취소/부분 재시도·승인 적용 검증. 전문 의미 채색과 장기 캐릭터 일관성은 모델/기기별 별도 증거 필요 |

## 이번 색상 개선의 동작 계약

1. 기본값은 기존처럼 현재 그리기 색을 따른다. 사용자가 기준색을 고정하면 파생색을 연속 선택해도 배색이 변하지 않는다.
2. `현재 색을 기준으로`는 고정을 유지하면서 기준만 바꾼다. 고정 해제는 즉시 현재 색을 따르는 모드로 돌아간다.
3. 팔레트 저장은 화면에 표시된 조화 규칙·기준색·색상 배열을 함께 사용한다. 규칙 또는 기준이 바뀌면 이전 저장 성공 표시는 사라진다.
4. 탭은 활성 항목 하나만 Tab 진입점으로 두고 panel과 연결한다. 색상도 한 진입점과 화살표/Home/End 조작을 제공한다.
5. 파생색 선택으로 외부 `value`가 바뀌어도 같은 슬롯의 DOM을 유지한다. 같은 색이 반복되어도 하나만 선택 상태로 표시한다.
6. 유사색의 가운데와 단색 조화의 세 번째 등 실제 기준색 위치를 표시한다. 첫 번째 색을 일괄 기준색으로 표시하던 오류를 수정한다.
7. 저장 피드백 타이머는 다시 저장·규칙/기준 변경·unmount에서 해제한다. 패널 작업은 브러시 엔진의 stroke/pressure 경로를 바꾸지 않는다.
8. 팝오버에서 조화/웹툰 음영 팔레트를 저장할 때 비동기 저장 결과는 부모가 전담한다. 저장소 성공 전의 자식 성공 배지를 억제하고 실패는 다시 시도할 수 있는 경고로 표시한다. 늦은 이전 저장 응답과 unmount 이후 응답이 안내를 덮어쓰지 않는다. 흰색/검정에서 같은 명도 단계가 반복되어도 radio 선택은 하나이며 파생색 재계산 후 슬롯 포커스를 유지한다.

## 과거 문서에서 바로잡아야 할 상태

- `docs/studio-drawing-input-center-benchmark-2026-09-09.md`의 radial quick menu 후속 후보는 현재 `StudioQuickActionsMenu.tsx`가 이미 구현한다.
- `docs/studio-draft-save-outbox-benchmark-2026-09.md`의 명명 체크포인트/revision diff 후속 후보는 현재 `StudioCheckpointPanel.tsx`에 존재한다.
- `docs/studio-view-benchmark-2026-09-09.md`의 ICC/soft proof 후보는 RGB 실행/ICC 검사와 CMYK LUT 실행을 구분해야 한다. 전자는 존재하고 후자는 별도 경계다.
- “모든 기능에서 더 고도화할 것이 없음”은 판정하지 않는다. 이번에 구현한 사용 개선과 남은 데이터·기기·제공자 과제를 분리한다.

## 검증 기록

- 색상: `StudioColorHarmoniesPanel.test.tsx`의 제어된 부모 상태로 기본 follow, 잠긴 배색의 파생색 연속 선택, 저장 이름/배열, 키보드/포커스, 중복 색, 타이머 정리를 확인한다.
- 부모 팝오버 연결과 흰색/검정의 중복 radio, 조화/웹툰 두 모드의 비동기 저장 실패도 확인했다. `pnpm_config_verify_deps_before_run=false pnpm exec vitest run apps/web/src/domains/creator/StudioColorPopoverAdvanced.test.tsx apps/web/src/domains/creator/StudioColorPopover.test.tsx apps/web/src/domains/creator/StudioColorHarmoniesPanel.test.tsx`: **3개 파일, 21개 테스트 통과**.
- 선택·레이어·출력의 구현은 작업 브랜치에 완료했고 통합 검증을 진행한다. 펼친 그룹 헤더를 지나 첫 자식까지만 Shift 선택했는데 범위 밖 형제까지 선택되던 문제는 최종 리뷰에서 수정했다. 그룹 직접 클릭·접힌 그룹 범위 선택은 전체 그룹을 선택하는 기존 의미를 유지한다.
- 레이어 최종 리뷰 회귀: `studio-layer-keyboard-navigation.test.ts`와 `StudioLayerNavigator.interaction.test.tsx` **2개 파일, 26개 테스트 통과**. 제어된 부모 상태에서 범위 확장/축소, 펼침/접힘 전환, 그룹 직접 선택을 확인했다.
- 실제 native Worker 증거: `/private/tmp/toonstudio-non3d-qa/border-runtime/result.json`. Headless Chromium **151.0.7922.34**, Vite 개발 서버의 module Worker/OffscreenCanvas에서 **8개 시나리오, 28개 픽셀 검사**, 모든 실행 `worker`, `passed: true`, `errors: []`. 안쪽·바깥쪽·중앙·구멍·반전·전체 안쪽·전체 바깥쪽·페더 보존을 확인했다. 페더 사례는 부분 알파 5,288개를 확인했다. 이는 실제 Worker 실행/픽셀 결과 증거이며 운영 UI·실제 태블릿·GPU 성능 검증으로 확대하지 않는다.
- 전체 lint/typecheck/build/필수 CI와 main 병합 여부는 담당자가 최종 실행 기록에 추가한다. 이 보고서의 구현 완료는 병합 또는 배포 완료를 뜻하지 않는다.
- 이 문서의 코드 감사만으로 태블릿 실제 입력, 원격 계정 저장/협업, 제공자 호출, main 병합 또는 운영 배포 성공을 선언하지 않는다.

## 공식 출처

- [S1: Procreate Brush Studio Settings](https://help.procreate.com/procreate/handbook/brushes/brush-studio-settings) — 필압 추가 제어점·압력/기울기/회전·hover.
- [S2: Procreate Harmony](https://help.procreate.com/procreate/handbook/colors/colors-harmony) — 보색·유사색·3색/4색 조화와 파생색.
- [S3: CSP Color Mixing Palette](https://help.clip-studio.com/en-us/manual_en/300_color/Color_Mixing_palette.htm) — 혼합 공간·브러시/블렌드·스포이트.
- [S4: Krita Select Menu](https://docs.krita.org/en/reference_manual/main_menu/select_menu.html) — 알파 선택 결합·grow/shrink/border/smooth.
- [S5: Photoshop Color Range](https://helpx.adobe.com/photoshop/desktop/make-selections/freehand-selections/select-a-color-range-in-photoshop.html) — 색/톤 범위·부분 선택·미리보기·설정 저장.
- [S6: Procreate Advanced Selections](https://help.procreate.com/procreate/handbook/selections/selections-advanced) — 선택 저장·썸네일·불러오기·레이어 내용 선택.
- [S7: CSP Selection Launcher](https://help.clip-studio.com/en-us/manual_en/330_selection/Selection_Launcher.htm) — 맥락형 선택 명령과 사용자 구성.
- [S8: Krita Layers](https://docs.krita.org/en/reference_manual/dockers/layers.html) — 이름/색 라벨 필터·그룹·다중 선택·잠금·알파.
- [S9: Photoshop Smart Objects](https://helpx.adobe.com/photoshop/desktop/create-manage-layers/smart-objects/smart-objects-overview-and-benefits.html) — 원본 유지 변형·필터·연결 인스턴스와 제약.
- [S10: CSP Story Editor](https://help.clip-studio.com/en-us/manual_en/570_pages/Use_Story_Editor.htm) — 페이지 간 텍스트 편집·분할/병합·이동·찾기/바꾸기.
- [S11: CSP Frames and Panels](https://help.clip-studio.com/en-us/manual_en/540_comic/Frames_and_Panels.htm) — 프레임·간격·분할·폴더 정책.
- [S12: CSP Webtoons](https://help.clip-studio.com/en-us/manual_en/540_comic/Webtoons.htm) — 휴대폰 화면 영역·분할·출력 크기·페이지 범위.
- [S13: Krita Instant Preview](https://docs.krita.org/en/reference_manual/instant_preview.html) — 저해상도 피드백·원본 계산 분리와 도구별 제약.
- [S14: Krita Soft Proofing](https://docs.krita.org/en/user_manual/soft_proofing.html) — 프린터 ICC·intent·검정 보정·종이 시뮬레이션.
- [S15: Procreate QuickMenu](https://help.procreate.com/procreate/handbook/interface-gestures/quickmenu) — 6슬롯 구성·touch-drag 실행.
- [S16: CSP Shortcuts During Operation](https://help.clip-studio.com/en-us/manual_en/780_shortcuts/Shortcuts_usable_during_operation.htm) — 도구 내 임시 스포이트·브러시 크기 조작.
- [S17: Photoshop Cloud Documents](https://helpx.adobe.com/in/photoshop/using/manage-cloud-documents-photoshop.html) — 저장 버전 탐색·복원·썸네일.
- [S18: CSP Filters](https://help.clip-studio.com/en-us/manual_en/390_filters/Filters.htm) — 선택/레이어 범위·미리보기·강도·전체 표시 레이어 합성 사본.
- [S19: Procreate Animation](https://help.procreate.com/procreate/handbook/animation) — onion skin·타임라인·프레임 옵션·출력.
- [S20: CSP Editing a Ruler](https://help.clip-studio.com/en-us/manual_en/510_ruler/Editing_a_ruler.htm) — 특수 자·대칭 자·가이드 선택과 편집.
- [S21: CSP Material Palette](https://help.clip-studio.com/en-us/manual_en/630_material/Material_palette.htm) — 소재 폴더·태그 검색·정보·드래그.
- [S22: CSP Auto Actions](https://help.clip-studio.com/en-us/manual_en/720_preferences/Auto_Actions.htm) — 녹화·명령 구성·재생·설정 재입력.
