import {
  STUDIO_MARKETPLACE_PACKAGE_SCHEMA,
  type StudioMarketplacePackage,
  type StudioMarketplacePlacementPreset,
} from "../studio-marketplace-packages";
import {
  STUDIO_ORIGINAL_FREE_ASSET_LICENSE,
  type StudioOriginalFreeAsset,
  type StudioOriginalFreeAssetCategory,
  type StudioOriginalFreeAssetPackage,
} from "../studio-original-free-asset-packs";

const INK = "#211914";
const PAPER = "#f8f2e8";
const ACCENT = "#ed7541";
const COOL = "#72b8c8";
const GOOD = "#72b985";
const WARN = "#e5bd54";
const PINK = "#dd8eaa";
const NIGHT = "#272836";
const VIOLET = "#8b78d0";

interface AssetDescriptor {
  readonly id: string;
  readonly name: string;
  readonly category: StudioOriginalFreeAssetCategory;
  readonly tags: readonly string[];
  readonly body: string;
  readonly width?: number;
  readonly height?: number;
  readonly placement?: readonly StudioMarketplacePlacementPreset[];
}

function wrapSvg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img">${body}</svg>`;
}

function makeAsset(packageId: string, descriptor: AssetDescriptor): StudioOriginalFreeAsset {
  const width = descriptor.width ?? 320;
  const height = descriptor.height ?? 240;
  return Object.freeze({
    id: descriptor.id,
    name: descriptor.name,
    kind: "vector-asset",
    format: "image/svg+xml",
    contentFingerprint: `original-svg:v2:${descriptor.id}`,
    tags: descriptor.tags,
    packageId,
    category: descriptor.category,
    width,
    height,
    svg: wrapSvg(width, height, descriptor.body),
    origin: "original-procedural",
    license: STUDIO_ORIGINAL_FREE_ASSET_LICENSE,
    placementPresets: descriptor.placement ?? ["pointer", "current-view"],
  });
}

function makePackage(input: {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly assets: readonly AssetDescriptor[];
}): StudioOriginalFreeAssetPackage {
  const includedItems = Object.freeze(input.assets.map((asset) => makeAsset(input.id, asset)));
  return Object.freeze({
    schema: STUDIO_MARKETPLACE_PACKAGE_SCHEMA,
    id: input.id,
    name: input.name,
    summary: input.summary,
    category: input.category,
    tags: input.tags,
    kind: "vector-asset",
    access: "free",
    accessLabel: "무료",
    origin: "original-procedural",
    creator: { id: "toonspectrum-lab", name: "ToonSpectrum Lab", verified: true },
    version: "2.0.0",
    packageFingerprint: `original-pack:v2:${input.id}:2.0.0`,
    compatibility: {
      studioVersion: ">=1.0.0",
      renderer: ["canvas2d", "svg"] as const,
      devices: ["desktop", "tablet", "mobile"] as const,
      formats: ["image/svg+xml"],
    },
    license: STUDIO_ORIGINAL_FREE_ASSET_LICENSE,
    includedItems,
    changelog: [{
      version: "2.0.0",
      releasedAt: "2026-09-10",
      changes: [`${includedItems.length}개 웹툰 제작용 원본 SVG 추가`, "Studio 드래그·즉시 삽입 지원"],
    }],
    placementPresets: ["current-view", "pointer"] as const,
    availability: {
      catalog: "bundled",
      library: "local-only",
      payment: "unavailable",
      cloudSync: "unavailable",
      exportManifest: "local-only",
    } as const,
    updatedAt: "2026-09-10T00:00:00.000Z",
  } satisfies StudioMarketplacePackage) as StudioOriginalFreeAssetPackage;
}

const UI_ASSETS: readonly AssetDescriptor[] = [
  { id: "original-ui-chat-thread", name: "메신저 대화 묶음", category: "daily-prop", tags: ["GUI", "메신저", "대화", "휴대폰"], body: `<rect x="38" y="22" width="244" height="196" rx="26" fill="${PAPER}" stroke="${INK}" stroke-width="7"/><rect x="58" y="48" width="142" height="42" rx="21" fill="${COOL}"/><rect x="104" y="104" width="156" height="42" rx="21" fill="${PINK}"/><rect x="58" y="160" width="126" height="34" rx="17" fill="${GOOD}"/><circle cx="76" cy="69" r="6" fill="${PAPER}"/><path d="M126 125h94M78 177h74" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>` },
  { id: "original-ui-phone-screen", name: "스마트폰 화면 프레임", category: "daily-prop", tags: ["GUI", "휴대폰", "스마트폰", "화면"], body: `<rect x="82" y="14" width="156" height="212" rx="30" fill="${NIGHT}" stroke="${INK}" stroke-width="7"/><rect x="94" y="38" width="132" height="158" rx="18" fill="${COOL}"/><path d="M118 63h84M118 88h58M118 113h84M118 138h68" stroke="${PAPER}" stroke-width="7" stroke-linecap="round"/><circle cx="160" cy="211" r="8" fill="${PAPER}"/>` },
  { id: "original-ui-system-window", name: "판타지 시스템 창", category: "genre-prop", tags: ["GUI", "상태창", "판타지", "게임"], body: `<rect x="28" y="28" width="264" height="184" rx="16" fill="${NIGHT}" stroke="${COOL}" stroke-width="5"/><path d="M48 60h224" stroke="${COOL}" stroke-width="3"/><circle cx="58" cy="46" r="6" fill="${GOOD}"/><circle cx="78" cy="46" r="6" fill="${WARN}"/><path d="M58 88h102M58 112h166M58 148h82M150 148h96M58 178h188" stroke="${PAPER}" stroke-width="7" stroke-linecap="round"/><rect x="214" y="82" width="42" height="42" rx="8" fill="${VIOLET}"/>` },
  { id: "original-ui-notification-toast", name: "알림 토스트 카드", category: "daily-prop", tags: ["GUI", "알림", "토스트", "앱"], body: `<rect x="30" y="74" width="260" height="92" rx="24" fill="${PAPER}" stroke="${INK}" stroke-width="6"/><circle cx="76" cy="120" r="24" fill="${ACCENT}"/><path d="M68 120l7 7 13-17" fill="none" stroke="${PAPER}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M116 104h126M116 128h90" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>` },
  { id: "original-ui-comment-card", name: "댓글·리뷰 카드", category: "daily-prop", tags: ["GUI", "댓글", "리뷰", "커뮤니티"], body: `<rect x="32" y="28" width="256" height="184" rx="20" fill="${PAPER}" stroke="${INK}" stroke-width="6"/><circle cx="72" cy="72" r="22" fill="${PINK}"/><path d="M112 58h108M112 78h74M58 116h204M58 142h180M58 168h146" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M220 190l12-16 12 16" fill="none" stroke="${ACCENT}" stroke-width="5"/>` },
  { id: "original-ui-profile-badge", name: "프로필·인증 배지", category: "daily-prop", tags: ["GUI", "프로필", "인증", "배지"], body: `<circle cx="116" cy="110" r="72" fill="${COOL}" stroke="${INK}" stroke-width="7"/><circle cx="116" cy="86" r="28" fill="${PAPER}"/><path d="M68 154q48-54 96 0" fill="${PAPER}"/><path d="M190 78l22 10 22-10 10 22-10 22 10 22-22 10-22-10-10-22 10-22z" fill="${GOOD}" stroke="${INK}" stroke-width="5"/><path d="M205 122l10 10 18-24" fill="none" stroke="${PAPER}" stroke-width="6" stroke-linecap="round"/>` },
  { id: "original-ui-map-location-card", name: "지도 위치 카드", category: "daily-prop", tags: ["GUI", "지도", "위치", "약속"], body: `<rect x="34" y="28" width="252" height="184" rx="18" fill="${PAPER}" stroke="${INK}" stroke-width="6"/><path d="M52 64l64-18 78 22 74-22v112l-74 22-78-22-64 18z" fill="${COOL}" opacity=".45" stroke="${INK}" stroke-width="4"/><path d="M116 48v110M194 68v112" stroke="${PAPER}" stroke-width="5"/><path d="M164 74c-30 0-42 35-18 60l18 24 18-24c24-25 12-60-18-60z" fill="${ACCENT}" stroke="${INK}" stroke-width="5"/><circle cx="164" cy="105" r="11" fill="${PAPER}"/>` },
  { id: "original-ui-status-chips", name: "상태·태그 칩 세트", category: "daily-prop", tags: ["GUI", "태그", "상태", "칩"], body: `<rect x="36" y="46" width="110" height="38" rx="19" fill="${GOOD}"/><rect x="158" y="46" width="126" height="38" rx="19" fill="${WARN}"/><rect x="36" y="100" width="138" height="38" rx="19" fill="${PINK}"/><rect x="186" y="100" width="98" height="38" rx="19" fill="${COOL}"/><rect x="36" y="154" width="248" height="38" rx="19" fill="${NIGHT}"/><path d="M58 65h66M180 65h82M58 119h94M208 119h54M58 173h202" stroke="${PAPER}" stroke-width="6" stroke-linecap="round"/>` },
];

const EMOTION_ASSETS: readonly AssetDescriptor[] = [
  { id: "original-fx-shock-burst", name: "충격 번쩍 효과", category: "atmosphere-fx", tags: ["오버레이", "충격", "번쩍", "감정"], body: `<path d="M160 16l22 68 58-40-18 70 76 6-70 34 50 56-72-18-6 38-28-32-44 46-4-62-72 22 48-58-74-20 72-26-36-56 64 30z" fill="${WARN}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`, placement: ["background-cover", "pointer"] },
  { id: "original-fx-heart-flutter", name: "두근 하트 군집", category: "atmosphere-fx", tags: ["오버레이", "하트", "로맨스", "두근"], body: Array.from({ length: 16 }, (_, i) => { const x=30+((i*67)%260); const y=24+((i*43)%182); const s=8+(i%5)*3; return `<path d="M${x} ${y+s}c-${s*1.4}-${s} -${s*1.8}-${s*2.2} 0-${s*2.7} ${s*1.5}-.5 ${s*2} ${s} ${s*2} ${s*1.6} 0-${s*.6} ${s*.5}-${s*2.1} ${s*2}-${s*1.6} ${s*1.8}.${s*.5} ${s*1.4} ${s*1.7} 0 ${s*2.7}z" fill="${PINK}" opacity="${0.5+(i%4)*0.12}"/>`; }).join("") },
  { id: "original-fx-anger-veins", name: "분노 혈관 마크", category: "atmosphere-fx", tags: ["오버레이", "분노", "화남", "감정"], body: `<path d="M160 34v64M160 142v64M56 120h68M196 120h68M92 54l46 46M182 142l46 46M228 54l-46 46M138 142l-46 46" stroke="${ACCENT}" stroke-width="20" stroke-linecap="round"/><circle cx="160" cy="120" r="28" fill="none" stroke="${INK}" stroke-width="7"/>` },
  { id: "original-fx-sweat-drops", name: "당황 식은땀", category: "atmosphere-fx", tags: ["오버레이", "땀", "당황", "코믹"], body: Array.from({ length: 12 }, (_, i) => { const x=38+((i*73)%240); const y=22+((i*47)%170); const s=12+(i%4)*4; return `<path d="M${x} ${y}q-${s} ${s*1.3}-${s/2} ${s*2.2}q${s/2} ${s*.8} ${s} 0q${s/2}-${s}-${s/2}-${s*2.2}z" fill="${COOL}" stroke="${INK}" stroke-width="2" opacity=".78"/>`; }).join("") },
  { id: "original-fx-gloom-lines", name: "침울 세로선", category: "atmosphere-fx", tags: ["오버레이", "침울", "우울", "코믹"], body: Array.from({ length: 24 }, (_, i) => `<path d="M${22+i*12} 28v${80+(i%5)*22}" stroke="${NIGHT}" stroke-width="${3+(i%3)}" stroke-linecap="round" opacity="${0.25+(i%4)*0.13}"/>`).join("") },
  { id: "original-fx-sparkle-field", name: "반짝이 필드", category: "atmosphere-fx", tags: ["오버레이", "반짝이", "빛", "감정"], body: Array.from({ length: 22 }, (_, i) => { const x=22+((i*79)%276); const y=18+((i*53)%204); const r=5+(i%5)*2; return `<path d="M${x} ${y-r}l${r/3} ${r*.66} ${r*.66} ${r/3}-${r*.66} ${r/3}-${r/3} ${r*.66}-${r/3}-${r*.66}-${r*.66}-${r/3} ${r*.66}-${r/3}z" fill="${i%2?WARN:PAPER}" stroke="${INK}" stroke-width="1"/>`; }).join("") },
  { id: "original-fx-blush-cloud", name: "설렘 홍조 구름", category: "atmosphere-fx", tags: ["오버레이", "홍조", "설렘", "로맨스"], body: `<ellipse cx="160" cy="120" rx="118" ry="58" fill="${PINK}" opacity=".22"/>${Array.from({ length: 20 },(_,i)=>`<path d="M${52+(i%10)*24} ${92+Math.floor(i/10)*44}l14-10" stroke="${PINK}" stroke-width="7" stroke-linecap="round" opacity=".72"/>`).join("")}` },
  { id: "original-fx-speed-streaks", name: "코믹 질주선", category: "atmosphere-fx", tags: ["오버레이", "속도선", "질주", "액션"], body: Array.from({ length: 22 }, (_, i) => `<path d="M${10+(i%4)*8} ${20+i*9}L${210+(i%5)*20} ${18+i*9}" stroke="${INK}" stroke-width="${2+(i%4)}" stroke-linecap="round" opacity="${0.35+(i%5)*0.11}"/>`).join("") },
];

const CITY_ASSETS: readonly AssetDescriptor[] = [
  { id: "original-city-street-lamp", name: "도시 가로등", category: "daily-prop", tags: ["소품", "도시", "가로등", "거리"], body: `<path d="M140 216V72q0-32 34-32h42" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/><path d="M194 40h58l-12 48h-34z" fill="${WARN}" stroke="${INK}" stroke-width="7"/><ellipse cx="140" cy="220" rx="54" ry="12" fill="${NIGHT}"/>` },
  { id: "original-city-traffic-cones", name: "교통 콘 세트", category: "daily-prop", tags: ["소품", "교통", "도로", "콘"], body: `<path d="M58 196h92L116 48H92zM176 196h92L234 70h-24z" fill="${ACCENT}" stroke="${INK}" stroke-width="7"/><path d="M78 138h58M194 142h58" stroke="${PAPER}" stroke-width="14"/><path d="M42 202h124M162 202h122" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>` },
  { id: "original-city-bus-stop", name: "버스 정류장 표지", category: "daily-prop", tags: ["소품", "버스", "정류장", "도시"], body: `<rect x="94" y="28" width="132" height="88" rx="44" fill="${COOL}" stroke="${INK}" stroke-width="7"/><path d="M160 116v104" stroke="${INK}" stroke-width="12"/><rect x="110" y="136" width="100" height="48" rx="8" fill="${PAPER}" stroke="${INK}" stroke-width="5"/><path d="M128 155h64" stroke="${INK}" stroke-width="6"/>` },
  { id: "original-city-vending-machine", name: "음료 자판기", category: "daily-prop", tags: ["소품", "자판기", "거리", "음료"], body: `<rect x="74" y="18" width="172" height="210" rx="16" fill="${ACCENT}" stroke="${INK}" stroke-width="7"/><rect x="94" y="42" width="132" height="88" rx="9" fill="${PAPER}"/><g fill="${COOL}">${Array.from({length:8},(_,i)=>`<rect x="${104+(i%4)*30}" y="${54+Math.floor(i/4)*36}" width="18" height="26" rx="5"/>`).join("")}</g><rect x="96" y="150" width="54" height="20" rx="6" fill="${NIGHT}"/><rect x="170" y="148" width="52" height="54" rx="8" fill="${PAPER}"/>` },
  { id: "original-city-cafe-board", name: "카페 입간판", category: "daily-prop", tags: ["소품", "카페", "간판", "거리"], body: `<path d="M104 26h112l30 188H74z" fill="${PAPER}" stroke="${INK}" stroke-width="8"/><rect x="112" y="48" width="96" height="112" rx="9" fill="${NIGHT}"/><path d="M132 84h56M128 108h64M142 134h38" stroke="${WARN}" stroke-width="7" stroke-linecap="round"/><path d="M92 214h136" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>` },
  { id: "original-city-umbrella-stand", name: "우산 꽂이", category: "daily-prop", tags: ["소품", "우산", "비", "현관"], body: `<path d="M90 116h140l-16 104H106z" fill="${COOL}" stroke="${INK}" stroke-width="7"/><path d="M118 150V58q0-32 28-32t28 32M164 150V76q0-28 24-28t24 28" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M118 58q28 24 56 0M164 76q24 20 48 0" fill="${PINK}" stroke="${INK}" stroke-width="5"/>` },
  { id: "original-city-bicycle", name: "생활 자전거", category: "daily-prop", tags: ["소품", "자전거", "교통", "거리"], body: `<circle cx="82" cy="174" r="48" fill="none" stroke="${INK}" stroke-width="8"/><circle cx="238" cy="174" r="48" fill="none" stroke="${INK}" stroke-width="8"/><path d="M82 174l56-82 46 82H82l40-54h88M184 174l28-94h32M112 88h52" fill="none" stroke="${ACCENT}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` },
  { id: "original-city-parcel-box", name: "택배 상자 더미", category: "daily-prop", tags: ["소품", "택배", "상자", "현관"], body: `<rect x="42" y="118" width="126" height="96" fill="${WARN}" stroke="${INK}" stroke-width="7"/><rect x="154" y="78" width="124" height="136" fill="${PAPER}" stroke="${INK}" stroke-width="7"/><path d="M42 144h126M154 112h124M104 118v96M216 78v136" stroke="${INK}" stroke-width="5"/><rect x="66" y="158" width="48" height="22" fill="${PAPER}"/><path d="M178 134h70M178 154h48" stroke="${ACCENT}" stroke-width="6" stroke-linecap="round"/>` },
];

const FOOD_ASSETS: readonly AssetDescriptor[] = [
  { id: "original-food-coffee-cup", name: "카페 라테 컵", category: "daily-prop", tags: ["소품", "음식", "카페", "커피"], body: `<path d="M78 72h154l-16 118q-3 28-30 28h-62q-27 0-30-28z" fill="${PAPER}" stroke="${INK}" stroke-width="7"/><path d="M232 96q54 0 42 54q-8 36-54 26" fill="none" stroke="${INK}" stroke-width="9"/><ellipse cx="155" cy="76" rx="76" ry="22" fill="${ACCENT}" stroke="${INK}" stroke-width="6"/><path d="M118 76q38-30 76 0q-38 30-76 0z" fill="${PAPER}" opacity=".55"/>` },
  { id: "original-food-cake-slice", name: "딸기 케이크 조각", category: "daily-prop", tags: ["소품", "음식", "케이크", "디저트"], body: `<path d="M64 174l168-74 30 96H64z" fill="${PAPER}" stroke="${INK}" stroke-width="7"/><path d="M64 144l168-74 30 30-168 74z" fill="${PINK}" stroke="${INK}" stroke-width="7"/><path d="M86 158l162-70" stroke="${ACCENT}" stroke-width="9"/><circle cx="192" cy="58" r="20" fill="${ACCENT}" stroke="${INK}" stroke-width="5"/><path d="M192 40q12-20 28-10" fill="none" stroke="${GOOD}" stroke-width="5"/>` },
  { id: "original-food-ramen-bowl", name: "라면 그릇", category: "daily-prop", tags: ["소품", "음식", "라면", "식사"], body: `<path d="M48 108h224q-8 104-112 104T48 108z" fill="${PAPER}" stroke="${INK}" stroke-width="7"/><ellipse cx="160" cy="108" rx="112" ry="34" fill="${ACCENT}" stroke="${INK}" stroke-width="7"/><path d="M88 108q22-26 44 0t44 0t44 0" fill="none" stroke="${WARN}" stroke-width="8"/><circle cx="116" cy="98" r="22" fill="${PAPER}"/><path d="M92 38h156M102 50h146" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>` },
  { id: "original-food-bento", name: "도시락 세트", category: "daily-prop", tags: ["소품", "음식", "도시락", "학교"], body: `<rect x="34" y="54" width="252" height="158" rx="22" fill="${NIGHT}" stroke="${INK}" stroke-width="7"/><rect x="50" y="70" width="110" height="126" rx="14" fill="${PAPER}"/><rect x="174" y="70" width="96" height="58" rx="12" fill="${GOOD}"/><rect x="174" y="138" width="96" height="58" rx="12" fill="${WARN}"/><circle cx="104" cy="110" r="30" fill="${PINK}"/><path d="M70 158h70" stroke="${ACCENT}" stroke-width="10" stroke-linecap="round"/>` },
  { id: "original-food-soda-cup", name: "탄산음료 컵", category: "daily-prop", tags: ["소품", "음료", "컵", "패스트푸드"], body: `<path d="M94 64h128l-16 156H110z" fill="${ACCENT}" stroke="${INK}" stroke-width="7"/><path d="M82 64h152" stroke="${INK}" stroke-width="12" stroke-linecap="round"/><path d="M182 64l18-46" stroke="${COOL}" stroke-width="8" stroke-linecap="round"/><path d="M126 104h64M122 134h72M118 164h80" stroke="${PAPER}" stroke-width="7" stroke-linecap="round"/>` },
  { id: "original-food-takeout-bag", name: "테이크아웃 쇼핑백", category: "daily-prop", tags: ["소품", "음식", "포장", "쇼핑백"], body: `<path d="M82 64h156l18 156H64z" fill="${WARN}" stroke="${INK}" stroke-width="7"/><path d="M116 72q0-46 44-46t44 46" fill="none" stroke="${INK}" stroke-width="8"/><circle cx="160" cy="138" r="38" fill="${PAPER}"/><path d="M140 138h40M160 118v40" stroke="${ACCENT}" stroke-width="8" stroke-linecap="round"/>` },
  { id: "original-food-skillet", name: "프라이팬 요리", category: "daily-prop", tags: ["소품", "주방", "팬", "음식"], body: `<ellipse cx="126" cy="146" rx="92" ry="66" fill="${NIGHT}" stroke="${INK}" stroke-width="7"/><path d="M202 126l84-52" stroke="${INK}" stroke-width="18" stroke-linecap="round"/><ellipse cx="126" cy="142" rx="58" ry="38" fill="${PAPER}"/><circle cx="112" cy="136" r="18" fill="${WARN}"/><path d="M142 124q26 12 34 38M72 158q24-18 40-4" fill="none" stroke="${GOOD}" stroke-width="8" stroke-linecap="round"/>` },
  { id: "original-food-dessert-plate", name: "디저트 접시", category: "daily-prop", tags: ["소품", "음식", "디저트", "카페"], body: `<ellipse cx="160" cy="176" rx="124" ry="38" fill="${COOL}" opacity=".35" stroke="${INK}" stroke-width="7"/><path d="M112 158q48-110 96 0z" fill="${PINK}" stroke="${INK}" stroke-width="7"/><path d="M130 132h60" stroke="${PAPER}" stroke-width="10"/><circle cx="160" cy="76" r="18" fill="${ACCENT}" stroke="${INK}" stroke-width="5"/>` },
];

const FANTASY_ASSETS: readonly AssetDescriptor[] = [
  { id: "original-fantasy-hero-sword", name: "모험가 장검", category: "genre-prop", tags: ["소품", "판타지", "검", "무기"], body: `<path d="M160 18l28 54-18 100-10 22-10-22-18-100z" fill="${COOL}" stroke="${INK}" stroke-width="7"/><path d="M104 174h112" stroke="${WARN}" stroke-width="15" stroke-linecap="round"/><path d="M160 178v48" stroke="${INK}" stroke-width="16"/><circle cx="160" cy="228" r="13" fill="${ACCENT}" stroke="${INK}" stroke-width="5"/>` },
  { id: "original-fantasy-crest-shield", name: "왕실 문장 방패", category: "genre-prop", tags: ["소품", "판타지", "방패", "문장"], body: `<path d="M64 42q96-38 192 0v76q0 76-96 112q-96-36-96-112z" fill="${NIGHT}" stroke="${WARN}" stroke-width="8"/><path d="M160 62l22 42 48 7-35 34 8 48-43-22-43 22 8-48-35-34 48-7z" fill="${ACCENT}" stroke="${PAPER}" stroke-width="5"/>` },
  { id: "original-fantasy-potion", name: "마나 포션", category: "genre-prop", tags: ["소품", "판타지", "포션", "마법"], body: `<path d="M124 34h72v38q38 26 38 78q0 72-74 72t-74-72q0-52 38-78z" fill="${COOL}" fill-opacity=".45" stroke="${INK}" stroke-width="7"/><path d="M112 132q48 30 96 0v58q-20 28-48 28t-48-28z" fill="${VIOLET}"/><rect x="116" y="24" width="88" height="30" rx="8" fill="${WARN}" stroke="${INK}" stroke-width="6"/><circle cx="144" cy="112" r="10" fill="${PAPER}" opacity=".8"/>` },
  { id: "original-fantasy-quest-scroll", name: "퀘스트 두루마리", category: "genre-prop", tags: ["소품", "판타지", "퀘스트", "문서"], body: `<path d="M82 34h156q24 0 24 24t-24 24v120H82V82q-24 0-24-24t24-24z" fill="${PAPER}" stroke="${INK}" stroke-width="7"/><path d="M102 102h116M102 128h86M102 154h116" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><circle cx="214" cy="182" r="28" fill="${ACCENT}" stroke="${INK}" stroke-width="5"/><path d="M202 182l10 10 18-24" fill="none" stroke="${PAPER}" stroke-width="6"/>` },
  { id: "original-fantasy-mana-orb", name: "마력 구체", category: "genre-prop", tags: ["소품", "판타지", "마력", "구체"], body: `<circle cx="160" cy="120" r="82" fill="${VIOLET}" opacity=".4" stroke="${INK}" stroke-width="7"/><circle cx="160" cy="120" r="54" fill="${COOL}" opacity=".55"/><path d="M160 42l12 46 46 12-46 12-12 46-12-46-46-12 46-12z" fill="${PAPER}"/><ellipse cx="160" cy="218" rx="74" ry="14" fill="${NIGHT}" opacity=".4"/>` },
  { id: "original-fantasy-rune-circle", name: "룬 마법진", category: "genre-prop", tags: ["소품", "판타지", "마법진", "룬"], body: `<circle cx="160" cy="120" r="96" fill="none" stroke="${VIOLET}" stroke-width="8"/><circle cx="160" cy="120" r="66" fill="none" stroke="${COOL}" stroke-width="5" stroke-dasharray="12 8"/><path d="M160 48l22 48 54 6-40 36 12 52-48-26-48 26 12-52-40-36 54-6z" fill="none" stroke="${WARN}" stroke-width="5"/><circle cx="160" cy="120" r="20" fill="${PAPER}" opacity=".8"/>` },
  { id: "original-fantasy-coin-pile", name: "골드 코인 더미", category: "genre-prop", tags: ["소품", "판타지", "코인", "재화"], body: `${Array.from({length:18},(_,i)=>{const x=60+(i%6)*40+(Math.floor(i/6)%2)*12; const y=170-Math.floor(i/6)*34; return `<ellipse cx="${x}" cy="${y}" rx="24" ry="11" fill="${WARN}" stroke="${INK}" stroke-width="4"/><path d="M${x-20} ${y}v10q20 12 40 0V${y}" fill="${WARN}" stroke="${INK}" stroke-width="3"/>`;}).join("")}` },
  { id: "original-fantasy-magic-book", name: "마도서", category: "genre-prop", tags: ["소품", "판타지", "책", "마법"], body: `<path d="M50 54q54-22 110 18q56-40 110-18v148q-54-22-110 18q-56-40-110-18z" fill="${NIGHT}" stroke="${INK}" stroke-width="7"/><path d="M160 72v148" stroke="${WARN}" stroke-width="5"/><circle cx="108" cy="126" r="34" fill="none" stroke="${VIOLET}" stroke-width="5"/><path d="M108 94l10 22 24 3-18 16 6 24-22-12-22 12 6-24-18-16 24-3z" fill="${COOL}"/>` },
];

const NATURE_ASSETS: readonly AssetDescriptor[] = [
  { id: "original-nature-flower-branch", name: "꽃가지 장식", category: "daily-prop", tags: ["자연", "꽃", "장식", "로맨스"], body: `<path d="M42 204Q126 112 274 42" fill="none" stroke="${GOOD}" stroke-width="9" stroke-linecap="round"/>${[[92,154],[132,126],[174,96],[216,70],[252,50]].map(([x,y],i)=>`<g transform="translate(${x} ${y}) rotate(${i*18})"><ellipse rx="22" ry="10" fill="${GOOD}"/><circle cx="24" cy="-16" r="15" fill="${PINK}"/><circle cx="36" cy="-2" r="15" fill="${PINK}"/><circle cx="18" cy="2" r="15" fill="${PINK}"/><circle cx="28" cy="-5" r="7" fill="${WARN}"/></g>`).join("")}` },
  { id: "original-nature-leaf-cluster", name: "잎사귀 군집", category: "daily-prop", tags: ["자연", "잎", "식물", "장식"], body: `${Array.from({length:16},(_,i)=>{const x=42+((i*71)%236); const y=30+((i*47)%170); const r=(i*29)%180; return `<ellipse cx="${x}" cy="${y}" rx="28" ry="12" fill="${i%3===0?COOL:GOOD}" stroke="${INK}" stroke-width="3" transform="rotate(${r} ${x} ${y})"/>`;}).join("")}` },
  { id: "original-nature-grass-patch", name: "잔디 덤불", category: "daily-prop", tags: ["자연", "잔디", "풀", "배경"], body: `${Array.from({length:30},(_,i)=>{const x=20+i*10; const h=42+(i%7)*10; const bend=(i%2?10:-10); return `<path d="M${x} 218q${bend} -${h/2} ${bend*1.4} -${h}" fill="none" stroke="${i%4===0?COOL:GOOD}" stroke-width="7" stroke-linecap="round"/>`;}).join("")}` },
  { id: "original-nature-clouds", name: "구름 세트", category: "atmosphere-fx", tags: ["자연", "구름", "하늘", "오버레이"], body: `<g fill="${PAPER}" stroke="${COOL}" stroke-width="5"><path d="M26 154q8-40 48-40q14-46 58-30q38-28 66 14q44-6 54 36q38 2 42 38H26z"/><path d="M76 74q8-30 38-26q18-34 52-12q24-20 52 8q30 0 36 30z" opacity=".72"/></g>`, placement: ["background-cover", "pointer"] },
  { id: "original-nature-moon-stars", name: "달과 별", category: "atmosphere-fx", tags: ["자연", "달", "별", "야간"], body: `<path d="M178 28q-56 32-42 92q14 60 78 66q-40 42-96 22q-64-24-60-94q4-68 70-92q26-10 50 6z" fill="${WARN}" stroke="${INK}" stroke-width="6"/>${[[238,56],[260,114],[222,166],[284,186],[68,62]].map(([x,y],i)=>`<path d="M${x} ${y-12}l4 8 8 4-8 4-4 8-4-8-8-4 8-4z" fill="${i%2?PAPER:COOL}"/>`).join("")}` },
  { id: "original-nature-water-splash", name: "물 튀김", category: "atmosphere-fx", tags: ["자연", "물", "튀김", "효과"], body: `<path d="M34 188q54-64 100-18q30-86 64-4q46-48 88 20q-54-24-88 4q-34-52-64 2q-46-28-100-4z" fill="${COOL}" opacity=".68" stroke="${INK}" stroke-width="5"/>${[[88,92],[132,54],[202,78],[244,110]].map(([x,y])=>`<path d="M${x} ${y}q-18 24 0 36q18-12 0-36z" fill="${COOL}" stroke="${INK}" stroke-width="3"/>`).join("")}` },
  { id: "original-nature-rock-cluster", name: "바위 군집", category: "daily-prop", tags: ["자연", "바위", "돌", "배경"], body: `<path d="M32 202l44-80 46 22 38-92 48 70 38-22 50 102z" fill="${NIGHT}" opacity=".68" stroke="${INK}" stroke-width="7"/><path d="M76 122l30 22M160 52l20 74M208 122l22 36" stroke="${PAPER}" stroke-width="5" opacity=".45"/>` },
  { id: "original-nature-petal-wreath", name: "꽃잎 프레임", category: "atmosphere-fx", tags: ["자연", "꽃잎", "프레임", "로맨스"], body: `${Array.from({length:28},(_,i)=>{const a=(Math.PI*2*i)/28; const x=160+Math.cos(a)*120; const y=120+Math.sin(a)*88; const r=(i*37)%180; return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="9" ry="17" fill="${i%3===0?WARN:PINK}" opacity=".78" transform="rotate(${r} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;}).join("")}` },
];

export const STUDIO_ORIGINAL_2D_EXPANSION_PACKAGES: readonly StudioOriginalFreeAssetPackage[] = Object.freeze([
  makePackage({ id: "original-webtoon-ui-kit", name: "웹툰 UI·메신저 키트", summary: "휴대폰 대화, 상태창, 알림, 지도 등 현대·판타지 장면에 바로 쓰는 GUI 8종.", category: "GUI·그래픽", tags: ["GUI", "메신저", "상태창", "웹툰"], assets: UI_ASSETS }),
  makePackage({ id: "original-emotion-fx-kit", name: "감정·코믹 효과 키트", summary: "충격·설렘·분노·당황·침울·반짝이·속도감을 즉시 더하는 오버레이 8종.", category: "감정·효과", tags: ["감정", "오버레이", "코믹", "효과"], assets: EMOTION_ASSETS }),
  makePackage({ id: "original-urban-props-kit", name: "도시 생활 소품 키트", summary: "거리·학교·카페·현관 장면에 반복 사용하기 좋은 현대 소품 8종.", category: "현대 소품", tags: ["도시", "거리", "생활", "소품"], assets: CITY_ASSETS }),
  makePackage({ id: "original-food-cafe-kit", name: "음식·카페 소품 키트", summary: "카페, 학교, 일상 대화 컷을 채우는 음식·음료·주방 소품 8종.", category: "음식·카페", tags: ["음식", "카페", "소품", "일상"], assets: FOOD_ASSETS }),
  makePackage({ id: "original-fantasy-props-kit", name: "판타지 모험 소품 키트", summary: "검·방패·포션·마도서·마법진·퀘스트 UI를 묶은 장르 소품 8종.", category: "판타지 소품", tags: ["판타지", "마법", "모험", "소품"], assets: FANTASY_ASSETS }),
  makePackage({ id: "original-nature-decoration-kit", name: "자연·계절 장식 키트", summary: "꽃·잎·잔디·구름·달·물·바위로 컷 가장자리와 배경을 완성하는 8종.", category: "자연·장식", tags: ["자연", "장식", "계절", "배경"], assets: NATURE_ASSETS }),
]);

export const STUDIO_ORIGINAL_2D_EXPANSION_ASSETS: readonly StudioOriginalFreeAsset[] = Object.freeze(
  STUDIO_ORIGINAL_2D_EXPANSION_PACKAGES.flatMap((pkg) => pkg.includedItems),
);

export function findStudioOriginal2dExpansionPackage(packageId: unknown): StudioOriginalFreeAssetPackage | null {
  if (typeof packageId !== "string") return null;
  return STUDIO_ORIGINAL_2D_EXPANSION_PACKAGES.find((pkg) => pkg.id === packageId) ?? null;
}
