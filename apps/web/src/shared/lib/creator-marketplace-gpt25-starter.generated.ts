import {
  CREATOR_MARKETPLACE_BUILTIN_PREFIX_BY_KIND,
  CREATOR_MARKETPLACE_RUNTIME_BY_KIND,
  CreatorMarketplaceResourceRecordSchema,
  canonicalizeCreatorMarketplaceJson,
  creatorMarketplaceJsonByteSize,
} from "./creator-marketplace-resource-contract";
import { sha256HexPortable } from "./sha256-portable";

import type { CreatorMarketplaceResourceRecord } from "./creator-marketplace-resource-contract";

const OFFICIAL_PUBLISHER = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "ToonSpectrum 공식",
  avatar: "#b4532a",
} as const;

const STARTER_TIMESTAMP = "2026-09-18T00:15:49.022Z";

const DEFINITIONS = Object.freeze([
  {
    "recordId": "e2500000-0000-4000-8000-000000000001",
    "assetId": "webtoon-action-highway-chase",
    "name": "야간 고속도로 · 세로 원근",
    "description": "야간 고속도로 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "액션",
      "실외",
      "고속도로"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000002",
    "assetId": "webtoon-action-jungle-temple",
    "name": "정글 속 고대 유적 · 세로 원근",
    "description": "정글 속 고대 유적 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "액션",
      "실외",
      "정글",
      "유적"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000003",
    "assetId": "webtoon-action-ruined-city",
    "name": "붕괴한 도심 · 세로 원근",
    "description": "붕괴한 도심 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "액션",
      "실외",
      "폐허",
      "도시"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000004",
    "assetId": "webtoon-bedroom",
    "name": "도시 야경이 보이는 침실 · 세로 원근",
    "description": "도시 야경이 보이는 침실 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "일상",
      "실내",
      "침실",
      "방",
      "아파트"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000005",
    "assetId": "webtoon-convenience",
    "name": "밤 편의점 · 세로 원근",
    "description": "밤 편의점 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "일상",
      "실내",
      "편의점",
      "상점"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000006",
    "assetId": "webtoon-drama-boardroom",
    "name": "대기업 회의실 · 세로 원근",
    "description": "대기업 회의실 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "드라마",
      "실내",
      "회의실",
      "기업"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000007",
    "assetId": "webtoon-drama-courtroom",
    "name": "현대 법정 · 세로 원근",
    "description": "현대 법정 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "드라마",
      "실내",
      "법정",
      "재판"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000008",
    "assetId": "webtoon-drama-hospital-corridor",
    "name": "병원 복도 · 세로 원근",
    "description": "병원 복도 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "드라마",
      "실내",
      "병원",
      "복도"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000009",
    "assetId": "webtoon-fantasy-dragon-peak",
    "name": "용이 깃든 절벽 · 세로 원근",
    "description": "용이 깃든 절벽 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "판타지",
      "실외",
      "용",
      "절벽"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000010",
    "assetId": "webtoon-horror-abandoned-hospital",
    "name": "폐병원 병동 · 세로 원근",
    "description": "폐병원 병동 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "공포",
      "실내",
      "폐병원",
      "병동"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000011",
    "assetId": "webtoon-horror-dark-tunnel",
    "name": "끝이 보이지 않는 터널 · 세로 원근",
    "description": "끝이 보이지 않는 터널 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "공포",
      "실내",
      "터널",
      "어둠"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000012",
    "assetId": "webtoon-horror-foggy-cabin",
    "name": "안개 속 오두막 · 세로 원근",
    "description": "안개 속 오두막 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "공포",
      "실외",
      "오두막"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000013",
    "assetId": "webtoon-romance-carnival",
    "name": "밤의 대관람차 광장 · 세로 원근",
    "description": "밤의 대관람차 광장 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "로맨스",
      "실외",
      "놀이공원",
      "대관람차",
      "야경"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000014",
    "assetId": "webtoon-romance-cherry-blossom",
    "name": "벚꽃 산책길 · 세로 원근",
    "description": "벚꽃 산책길 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "로맨스",
      "실외",
      "벚꽃",
      "산책로"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000015",
    "assetId": "webtoon-sf-cyberpunk-street",
    "name": "비 내리는 사이버 골목 · 세로 원근",
    "description": "비 내리는 사이버 골목 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "SF",
      "실외",
      "사이버펑크",
      "골목"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000016",
    "assetId": "webtoon-sf-research-lab",
    "name": "미래 연구실 · 세로 원근",
    "description": "미래 연구실 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "SF",
      "실내",
      "연구실",
      "미래"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000017",
    "assetId": "webtoon-sf-space-station",
    "name": "우주 정거장 전망실 · 세로 원근",
    "description": "우주 정거장 전망실 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "SF",
      "실내",
      "우주정거장",
      "전망실"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000018",
    "assetId": "webtoon-wuxia-cliff-duel",
    "name": "절벽 산길 · 세로 원근",
    "description": "절벽 산길 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "무협·사극",
      "실외",
      "절벽",
      "산길"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000019",
    "assetId": "webtoon-wuxia-market-street",
    "name": "조선시대 저잣거리 · 세로 원근",
    "description": "조선시대 저잣거리 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "무협·사극",
      "실외",
      "저잣거리",
      "사극"
    ]
  },
  {
    "recordId": "e2500000-0000-4000-8000-000000000020",
    "assetId": "webtoon-wuxia-palace-courtyard",
    "name": "궁궐 안뜰 · 세로 원근",
    "description": "궁궐 안뜰 · 세로 원근 — 1152×2048 세로 웹툰 배경. 인물과 읽을 수 있는 텍스트를 배제하도록 생성하고 전체 프레임 시각 검수를 완료한 ToonSpectrum 1차 AI 생성 소재입니다.",
    "tags": [
      "웹툰 배경",
      "AI 생성",
      "검수완료",
      "무협·사극",
      "실외",
      "궁궐",
      "안뜰"
    ]
  }
] as const);

function sha256Hex(value: unknown): string {
  return sha256HexPortable(
    new TextEncoder().encode(canonicalizeCreatorMarketplaceJson(value)),
  );
}

function buildRecord(definition: (typeof DEFINITIONS)[number]): CreatorMarketplaceResourceRecord {
  const runtimeRef =
    `${CREATOR_MARKETPLACE_BUILTIN_PREFIX_BY_KIND.asset}gpt25/${definition.assetId}`;
  const payload = {
    schemaVersion: 1 as const,
    resourceKind: "asset" as const,
    runtime: CREATOR_MARKETPLACE_RUNTIME_BY_KIND.asset,
    runtimeRef,
  };
  const entry = {
    id: `${definition.assetId}/background`,
    kind: "asset" as const,
    name: definition.name,
    delivery: {
      mode: "builtin-ref" as const,
      runtimeRef,
      byteSize: 0 as const,
      sha256: sha256Hex(payload),
    },
  };
  const manifestToHash = {
    schemaVersion: 1 as const,
    packageId: `official/asset/gpt25/${definition.assetId}`,
    name: definition.name,
    description: definition.description,
    kind: "asset" as const,
    resourceVersion: "1.0.0",
    minimumStudioVersion: "0.1.0",
    tags: [...definition.tags],
    license: "toonspectrum-standard" as const,
    attributionText: "",
    containsAi: true,
    rightsConfirmed: true as const,
    provenance: { origin: "original" as const, authoredByPublisher: true as const },
    compatibility: { engines: ["canvas2d" as const] },
    entries: [entry],
  };
  return CreatorMarketplaceResourceRecordSchema.parse({
    schemaVersion: manifestToHash.schemaVersion,
    packageId: manifestToHash.packageId,
    name: manifestToHash.name,
    description: manifestToHash.description,
    kind: manifestToHash.kind,
    resourceVersion: manifestToHash.resourceVersion,
    minimumStudioVersion: manifestToHash.minimumStudioVersion,
    tags: manifestToHash.tags,
    license: manifestToHash.license,
    attributionText: manifestToHash.attributionText,
    containsAi: manifestToHash.containsAi,
    provenance: manifestToHash.provenance,
    compatibility: manifestToHash.compatibility,
    entries: manifestToHash.entries,
    id: definition.recordId,
    manifestHash: sha256Hex(manifestToHash),
    manifestByteSize: creatorMarketplaceJsonByteSize(manifestToHash),
    publisher: OFFICIAL_PUBLISHER,
    createdAt: STARTER_TIMESTAMP,
    updatedAt: STARTER_TIMESTAMP,
    isOwner: false,
    access: "free",
  });
}

export const CREATOR_MARKETPLACE_GPT25_STARTER_RECORDS: readonly CreatorMarketplaceResourceRecord[] =
  Object.freeze(DEFINITIONS.map(buildRecord));
