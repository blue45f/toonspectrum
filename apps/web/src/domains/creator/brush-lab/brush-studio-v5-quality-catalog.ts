import type { BrushCatalogEntry } from "./brush-studio-v5-quality-types";

function catalog(group: string, entries: readonly [string, string, string, string, boolean][]): readonly BrushCatalogEntry[] {
  return entries.map(([id, name, signature, engine, quick]) => Object.freeze({ id, group, name, signature, engine, quick }));
}

export const BRUSH_QUALITY_CATALOG: readonly BrushCatalogEntry[] = Object.freeze([
  ...catalog("선화·잉크·마커", [
    ["clean-ink", "클린 잉크", "입자 없는 직접 원형 잉크", "Native WebGPU", true], ["mesh-ink", "메시 잉크", "급회전·코너 모델링 메시", "Google Ink", false],
    ["comic-gpen", "만화 G펜", "강한 필압 테이퍼", "perfect-freehand", true], ["croquis-capsule", "크로키 캡슐", "풀드 스트링 캡슐 연결", "WebGPU", false],
    ["chisel-calligraphy", "치즐 캘리그래피", "tilt·twist 평촉", "WebGPU", true], ["natural-ink", "자연 잉크 붓", "MYB 다브와 잉크량", "libmypaint/Hokusai", true],
    ["dry-sumi", "드라이 수묵 강모", "개별 강모 갈필", "Krita Hairy", false], ["rough-comic", "러프 코믹 잉크", "깨지는 외곽과 종이결", "WebGPU", false],
    ["flat-marker", "플랫 마커", "균일 불투명 바디", "WebGPU", true], ["chisel-marker", "치즐 마커", "평촉 면과 모서리", "WebGPU", false],
    ["alcohol-bloom", "알코올 블룸 마커", "용제 확산·아래색 픽업", "Krita+Spectral", true], ["one-wash", "원워시 형광펜", "동일 획 과농도 억제", "WebGPU", false],
  ]),
  ...catalog("연필·목탄·건식", [
    ["graphite-line", "흑연 라인", "종이 이빨 연속 흑연", "WebGPU", true], ["side-graphite", "사이드 그래파이트", "tilt 접촉면 음영", "WebGPU", true],
    ["grain-pencil", "그레인 스탬프 연필", "문서 고정 이산 입자", "WebGPU", false], ["natural-graphite", "자연 흑연", "MYB 압력·속도 다브", "libmypaint/Hokusai", false],
    ["dual-graphite", "듀얼팁 흑연", "심·보조 입자 마스크", "Krita", false], ["compressed-charcoal", "압축 목탄", "단단한 중심·큰 파편", "WebGPU", true],
    ["vine-charcoal", "바인 목탄", "부드러운 방향성 탄소", "WebGPU/MYB", false], ["hairy-charcoal", "Hairy 목탄", "복수 탄소 strand", "Krita", false],
    ["wax-crayon", "왁스 크레용", "종이 골을 건너뛰는 왁스", "WebGPU", true], ["powder-chalk", "파우더 초크", "가루 공극·부스러짐", "WebGPU", false],
    ["velvet-pastel", "벨벳 파스텔", "케이크형 소프트 입자", "WebGPU/MYB", true], ["oil-pastel", "왁시 오일파스텔", "점착성 막과 안료 누적", "Open K/S", false],
  ]),
  ...catalog("수채·Inkwash·수묵", [
    ["clean-watercolor", "클린 수채 워시", "투명 확산·글레이즈", "WebGPU", true], ["granular-watercolor", "과립 수채", "종이 골 안료 침전", "Inkwash+K/S", true],
    ["backrun", "백런 엣지 블룸", "커피링·역류 테두리", "Inkwash", true], ["wet-edge-stamp", "웻엣지 스탬프", "다브별 프린지", "WebGPU", false],
    ["living-watercolor", "리빙 수채", "획 이후 흐름·건조", "Inkwash", true], ["living-ink", "리빙 잉크 펜", "속도·압력·dwell pooling", "Inkwash", true],
    ["water-brush", "순수 물붓", "안료 없이 수분·유속", "Inkwash", true], ["loaded-water", "안료 적재 물붓", "물과 색소 동시 도포", "Inkwash+Spectral", false],
    ["dense-sumi", "농묵 코어", "짙은 중심·제한 번짐", "Inkwash", false], ["fiber-sumi", "섬유 수묵", "섬유 방향 feathering", "Inkwash", false],
    ["chroma-halo", "크로마 후광 잉크", "채널 이동 색분리", "Inkwash", false], ["white-gouache", "화이트 과슈", "아래 안료 희석·제거", "Inkwash", false],
    ["dendritic", "덴드라이트 잉크", "가지형 반응 확산", "WebGPU", false], ["thin-film-wash", "Thin-film 드립 워시", "중력형 길이·두께 흐름", "WebGPU", false],
  ]),
  ...catalog("과슈·아크릴·유화", [
    ["matte-gouache", "매트 과슈", "불투명 매트 바디", "Open K/S", true], ["polymer-acrylic", "아크릴 폴리머 플랫", "빠른 고정·단단한 외곽", "WebGPU", false],
    ["oil-filbert", "유화 필버트", "둥근 모서리·평행 강모", "WebGPU", true], ["natural-oil", "자연 유화", "paint load·pickup·smudge", "MYB", false],
    ["hairy-oil", "Hairy 유화", "개별 강모 접촉·벌어짐", "Krita", false], ["dry-fan", "드라이 팬 브러시", "펼쳐진 갈필 레인", "WebGPU", false],
    ["impasto", "임파스토 릴리프", "물감 높이·강모 능선", "WebGPU", true], ["tube-extrusion", "튜브 압출", "연속 둥근 물감 비드", "WebGPU", false],
    ["palette-knife", "팔레트 나이프", "칼날 긁힘·다색 밀림", "WebGPU", false], ["pigment-blender", "피그먼트 블렌더", "아래색 pickup 혼색", "Krita+K/S", true],
  ]),
  ...catalog("에어·입자·FX", [
    ["soft-air", "소프트 에어브러시", "입자 없는 연속 감쇠", "WebGPU", true], ["hard-air", "하드 에어브러시", "단단한 중심·짧은 감쇠", "WebGPU", false],
    ["grit-air", "그릿 에어브러시", "소프트 외곽 속 입자", "WebGPU", false], ["equal-spray", "등면적 스프레이", "중심 쏠림 없는 분포", "WebGPU", false],
    ["burst", "버스트 스플래터", "큰 방울·작은 비말", "WebGPU", false], ["physics-splatter", "물리 스플래터", "속도·충돌·중력", "WebGPU", false],
    ["neon", "네온 튜브", "밝은 코어·다단 후광", "WebGPU", false], ["glitter", "글리터 스타필드", "결정적 별·플레이크", "WebGPU", false],
  ]),
  ...catalog("톤·패턴·문양·프로시저럴", [
    ["dot-tone", "도트 스크린톤", "문서 고정 망점 위상", "WebGPU", true], ["line-tone", "라인 스크린톤", "평행선 농도·각도", "WebGPU", false],
    ["gradient-tone", "그라데이션 하프톤", "가변 망점 크기", "WebGPU", false], ["cross-hatch", "크로스해칭", "진행 방향 교차 음영", "Krita/WebGPU", true],
    ["contour-rake", "컨투어 갈퀴", "곡률 정렬 평행선", "Krita", false], ["radial-burst", "방사 버스트", "중심 고정 속도선", "WebGPU", false],
    ["fabric", "패브릭 위브", "경사·위사 직조", "WebGPU", false], ["brick", "브릭 모르타르", "반단 벽돌·줄눈", "WebGPU", false],
    ["foliage", "폴리지 클러스터", "blue-noise 잎 군집", "WebGPU", false], ["fur", "헤어·퍼 스트랜드", "휘고 갈라지는 털", "Krita/WebGPU", false],
    ["stitch", "스티치·체인", "경로 연결 모티프", "WebGPU", false], ["scatter", "스캐터 스탬프", "비반복 atlas 산란", "WebGPU", false],
    ["swarm", "스웜 잉크", "중심 획 추적 에이전트", "WebGPU", false], ["kaleido", "칼레이도 잉크", "반사·회전 대칭", "WebGPU", false],
    ["spiro", "스파이로 오빗", "궤도형 반복 곡선", "WebGPU", false], ["rainbow", "레인보우 플로우", "거리 종속 색상 순환", "WebGPU", false],
  ]),
]);

export function brushQualityCatalogGroups(): readonly string[] {
  return Object.freeze([...new Set(BRUSH_QUALITY_CATALOG.map((entry) => entry.group))]);
}
