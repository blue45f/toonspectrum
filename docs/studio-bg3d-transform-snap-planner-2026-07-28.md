# Studio 3D Transform Constraint + Snap Planner

- 기준일: 2026-07-28
- 범위: 이동 변형의 축/평면 제약, Global/Local 좌표계, increment/vertex/surface 스냅
- 원칙: Blender·CAD 구현 코드는 사용하지 않고 공식 매뉴얼에 공개된 조작 계약만 clean-room 방식으로 재해석한다.

## 공식 문서에서 채택한 계약

| 공식 제품 계약 | ToonSpectrum 엔진 중립 계약 |
| --- | --- |
| Blender는 X/Y/Z 단일 축과 Shift+축 평면 제약을 제공하고, 변형 방향을 Global 또는 Local orientation으로 해석한다. | `free`, `axis`, `plane` 제약과 검증된 오른손 직교 Global/Local basis |
| Blender increment는 변형 시작점 기준 상대 이동과 absolute grid를 구분하며, 변형 중 임시로 스냅 상태를 반전할 수 있다. | `relative`/`absolute` increment와 `invertSnapping` semantic override |
| Blender의 snap base는 객체 원점 외의 선택 지점을 타깃에 맞출 수 있다. | 객체 위치와 분리된 `snapBaseWorldPosition` |
| Fusion Move/Copy는 Component XYZ와 Design XYZ, Point-to-Point, 피벗 스냅을 구분한다. | Local/Global 좌표계와 vertex/surface candidate → snap base 이동 |
| Fusion은 modifier로 snap point를 잠그거나 숨길 수 있다. | 기하 후보만 임시 억제하고 increment는 유지하는 `suppressGeometrySnaps` |
| AutoCAD는 grid snap과 기하 object snap을 함께 제공하며 겹친 후보를 순환·선택할 수 있다. | 입력 순서와 무관한 거리·종류·이동량·ID tie-break; 후속 UI에서 후보 순환 가능 |

참고한 공식 문서:

- [Blender 5.0 Transform Modal Map](https://docs.blender.org/manual/en/5.0/modeling/transform/modal_map.html)
- [Blender Transform Orientations](https://docs.blender.org/manual/en/5.0/editors/3dview/controls/orientation.html)
- [Blender 3D Viewport Snapping](https://docs.blender.org/manual/en/3.6/editors/3dview/controls/snapping.html)
- [Autodesk Fusion — Move or copy geometry](https://help.autodesk.com/view/NINVFUS/ENU/?contextId=MODEL-MOVE-OR-COPY-CMD)
- [Autodesk Fusion — Measure objects](https://help.autodesk.com/view/fusion360/ENU/?contextId=SLD-MEASURE)
- [AutoCAD — Specify a precise point location](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Core/files/GUID-392167BC-8032-44D9-B4A9-DF4AC00DF5C4.htm)

## 기존 구현과의 격차

기존 `studio-bg3d-object-ops.ts`는 World XYZ/XZ의 단순 수치 step snap에 적합하지만 Local basis, 축/평면 제약과 기하 후보 경쟁을 하나의 트랜잭션으로 결정하지 않는다. `studio-bg3d-surface-snap.ts`는 검증된 단일 표면 배치에 강하지만 vertex/increment 후보와 경쟁하지 않는다. `studio-bg3d-placement-session.ts`의 Shift 제약은 World X/Z 배치에 특화돼 있다.

신규 `studio-bg3d-transform-snap-planner.ts`는 위 모듈을 대체하지 않고 그 앞의 공통 계획 계층을 제공한다.

- 객체 시작 위치와 snap base를 분리한다.
- Global/Local basis에서 자유 이동, 단일 축, 제외 축 평면을 동일한 투영 수학으로 처리한다.
- 화면 거리 안에 든 vertex/surface를 먼저 비교하고, 없으면 relative/absolute increment를 사용한다.
- 후보 입력 순서와 무관하게 화면 거리 → vertex 우선 → 최소 이동량 → ASCII ID 순서로 결정한다.
- 축 제약 때문에 기하점에 정확히 도달하지 못하면 `constraintResidualWorld`를 반환해 가이드가 투영 오차를 시각화할 수 있다.
- 후보 수와 평가 수를 계획 전에 검증하며 초과·중복 ID·비정규 basis·NaN·범위 초과는 부분 결과 없이 실패한다.

## 최소 통합 경계

1. R3F/Three adapter가 현재 포인터 주변의 vertex와 surface hit를 만들고 CSS pixel 거리를 계산한다.
2. 객체 quaternion에서 Local X/Y/Z world axis를 만들되 부모 scale/shear가 있으면 직교화된 회전 basis만 전달한다.
3. 키보드 계층은 실제 키를 직접 엔진에 전달하지 않고 `constraint`, `invertSnapping`, `suppressGeometrySnaps`로 해석한다.
4. planner 성공 결과의 `positionWorld`만 기존 scene/history transaction에 기록한다.
5. `snap.targetWorld`, `snapBaseWorld`, `constraintResidualWorld`, surface normal은 기즈모·툴팁·가이드 렌더링에만 사용한다.
6. planner 실패 시 마지막 검증 위치를 유지하고 장면이나 undo history를 변경하지 않는다.

## 후속 확장

현재 공통 기반 이후의 큰 기능 격차는 edge/edge-center/perpendicular/intersection 후보, 회전·스케일 constraint snap, BVH 후보 수집기, Tab 후보 순환, 다중 snap base 평균, surface normal 회전 정렬의 제품 통합이다. 이들은 신규 planner의 candidate/ranking 경계 또는 별도 rotation planner로 확장할 수 있으며, 이번 순수 이동 계약을 변경할 필요는 없다.
