# 레거시 의상 GLB 감사 기록

- 상태: **역사적 참조 자산, 제품 wardrobe 아님**
- 최종 갱신: **2026-09-26**

이 디렉터리의 `outfit_*.glb` 18개는 과거 Blender 참조 산출물이다. ToonSpectrum Studio에 표시되는
wardrobe 자산이 아니다.

2026년 8월 binary/source 감사 결과 모든 파일은 rigid mesh node 1~2개만 포함하며 `skins`, animation,
`JOINTS_0`, `WEIGHTS_0`이 없다. 현재 `apps/web/src/domains/creator`의 production module은 이 경로나
파일명을 참조하지 않는다. 따라서 정적 shell만 교체해도 사용자가 장착·포즈·capture할 수 있는 제품
기능은 바뀌지 않는다.

실제 wardrobe 권위는 다음 경계에 있다.

1. `studio-vrm-wardrobe.ts`가 로드한 VRM을 측정하고 모델 비율에 맞는 `GarmentPart` surface를 만든다.
2. `studio-vrm-skinned-garment.ts`가 지원 의상에 raw rig bone index, 정규화 weight, inverse-bind matrix,
   skeleton을 연결한다.
3. `StudioVrmWardrobePropsProjection.tsx`가 live VRM에 surface를 붙인다. `pleated`, `longskirt`는
   bounded `xpbd-skirt-v1`, dress/robe/trench-coat/trouser는 raw-rig skinned procedural, shoes는 명시적
   rigid procedural 경로를 사용한다.
4. 현재 live wardrobe item은 기존 persisted ID를 유지한 채 선택 가능하다. 감사에 실패한 미래 item은
   명시적 replacement 경계로 처리한다.

향후 GLB wardrobe importer는 모델별 fitting, humanoid bone resolution, skin index/weight,
inverse-bind matrix, surface receipt, 결정적 cleanup과 계약 미충족 시 unavailable 상태를 보존해야 한다.
그 전까지 이 파일을 runtime-ready wearable로 노출하지 않는다.

실행 회귀 검사는
`apps/web/src/domains/creator/studio-vrm-outfit-static-asset-audit.test.ts`가 소유한다.
