/**
 * Creator Market 개발 시드 — 테스트 계정 생성 후 실제 API(signup→login→publish)로
 * 다양한 종류·라이선스·태그의 샘플 리소스를 게시한다.
 *
 * Usage:
 *   node --import tsx scripts/seed/market-dev-seed.mts \
 *     --api http://127.0.0.1:4001 \
 *     --email market-seed@toonstudio.dev --password "SeedMarket!2026" --name "마켓 시드"
 */
import { createHash } from "node:crypto";

import {
  CREATOR_MARKETPLACE_RUNTIME_BY_KIND,
  CreatorMarketplaceResourceManifestSchema,
  canonicalizeCreatorMarketplaceJson,
  creatorMarketplaceJsonByteSize,
} from "../../lib/creator-marketplace-resource-contract";

import type {
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceLicense,
  CreatorMarketplaceResourceManifest,
} from "../../lib/creator-marketplace-resource-contract";

const MEDIA_TYPE_BY_KIND = {
  asset: "application/vnd.toonspectrum.asset+json",
  brush: "application/vnd.toonspectrum.brush+json",
  filter: "application/vnd.toonspectrum.filter+json",
  palette: "application/vnd.toonspectrum.palette+json",
  template: "application/vnd.toonspectrum.template+json",
  "3d-preset": "application/vnd.toonspectrum.3d-preset+json",
} as const;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

interface SeedSpec {
  readonly packageId: string;
  readonly name: string;
  readonly description: string;
  readonly kind: CreatorMarketplaceResourceKind;
  readonly tags: string[];
  readonly license: CreatorMarketplaceResourceLicense;
  readonly attributionText?: string;
  readonly containsAi?: boolean;
  readonly entryName: string;
  readonly definition: Record<string, unknown>;
}

const SEEDS: readonly SeedSpec[] = [
  {
    packageId: "seed/brush/ink-gpen-fine",
    name: "정석 G펜 파인 — 선화용 잉크 브러시",
    description:
      "웹툰 선화 작업에 바로 쓰는 압력 반응 G펜. 가는 복선과 굵은 주선을 하나의 필악 커브로 처리합니다.",
    kind: "brush",
    tags: ["브러시", "선화", "gpen", "ink"],
    license: "toonspectrum-standard",
    entryName: "정석 G펜 파인",
    definition: {
      snapshot: {
        name: "seed gpen fine",
        tip: "stamp",
        spacing: 0.08,
        sizeRange: [2, 14],
        pressureCurve: { x0: 0, y0: 0, x1: 0.35, y1: 0.9 },
        smoothing: 0.62,
        opacity: 1,
        colorJitter: 0,
        wetEdges: false,
      },
    },
  },
  {
    packageId: "seed/brush/soft-water-wash",
    name: "수채 워시 소프트",
    description: "배경 하늘과 물감 번짐 표현용 수채 워시 브러시.",
    kind: "brush",
    tags: ["브러시", "watercolor", "배경"],
    license: "cc0-1.0",
    entryName: "수채 워시 소프트",
    definition: {
      snapshot: {
        name: "soft water wash",
        tip: "scatter-bristle",
        spacing: 0.22,
        sizeRange: [18, 120],
        flow: 0.45,
        wetness: 0.7,
        granulation: 0.3,
      },
    },
  },
  {
    packageId: "seed/filter/webtoon-duotone-dusk",
    name: "두톤 던스크 색보정",
    description: "야간 장면용 두 톤 필터. 명암 대비를 살리며 따뜻한 그림자를 얹습니다.",
    kind: "filter",
    tags: ["필터", "색보정", "야간"],
    license: "cc-by-4.0",
    attributionText: "ToonSpectrum Market Seed (qa)",
    entryName: "두톤 던스크",
    definition: {
      engine: "canvas2d-filter-v1",
      values: {
        exposure: 0.06,
        contrast: 0.18,
        temperature: -0.12,
        shadowTint: "#2a1f3d",
        highlightTint: "#ffd9b0",
        saturation: 0.82,
      },
    },
  },
  {
    packageId: "seed/filter/manga-screentone-pop",
    name: "만화 스크린톤 팝",
    description: "하이라이트에 팝한 스크린톤 질감을 얹는 이펙트 프리셋.",
    kind: "filter",
    tags: ["필터", "screentone", "레트로"],
    license: "toonspectrum-standard",
    entryName: "스크린톤 팝",
    definition: {
      engine: "canvas2d-filter-v1",
      values: { posterize: 5, dotGain: 0.24, vibrance: 0.3 },
    },
  },
  {
    packageId: "seed/palette/neon-night-city",
    name: "네온 나이트 시티 8색",
    description: "사이버 도심 야경 장면의 8색 팔레트.",
    kind: "palette",
    tags: ["팔레트", "야경", "neon", "도시"],
    license: "cc0-1.0",
    entryName: "네온 나이트 시티",
    definition: {
      colors: [
        "#0b0e1a",
        "#141a33",
        "#23305c",
        "#3d4f8f",
        "#7a5fd0",
        "#38d6e0",
        "#ff5da2",
        "#ffe066",
      ],
    },
  },
  {
    packageId: "seed/palette/pastel-cafe-morning",
    name: "파스텔 카페 모닝",
    description: "일상 힐링 물 장면용 부드러운 파스텔 팔레트.",
    kind: "palette",
    tags: ["팔레트", "일상", "pastel"],
    license: "cc-by-nc-4.0",
    attributionText: "ToonSpectrum Market Seed (qa) — CC BY-NC",
    entryName: "파스텔 카페 모닝",
    definition: {
      colors: [
        "#f7ede2",
        "#f0d9c0",
        "#e8b4a2",
        "#d795aa",
        "#a3b7c9",
        "#7d8ca3",
        "#5c6672",
        "#ffffff",
      ],
    },
  },
  {
    packageId: "seed/template/three-cut-action-board",
    name: "3컷 액션 연출 보드",
    description: "추격·전투 신의 속도감을 위한 3컷 액션 템플릿.",
    kind: "template",
    tags: ["템플릿", "액션", "구도"],
    license: "toonspectrum-standard",
    entryName: "3컷 액션 연출 보드",
    definition: { templateId: "seed-three-cut-action-board-1600x2400" },
  },
  {
    packageId: "seed/template/emotional-two-shot",
    name: "감정 투샷 정면 구도",
    description: "대화신 감정 전달에 최적화된 두 명의 정면 투샷 시작판.",
    kind: "template",
    tags: ["템플릿", "대화", "로맨스"],
    license: "cc-by-4.0",
    attributionText: "ToonSpectrum Market Seed (qa)",
    entryName: "감정 투샷 정면 구도",
    definition: { templateId: "seed-emotional-two-shot-1200x1800" },
  },
  {
    packageId: "seed/bg3d/rainy-alley-night",
    name: "비 내리는 골목 밤 3D 프리셋",
    description: "절차형 3D 배경으로 만드는 네온 반사가 있는 비 오는 골목.",
    kind: "3d-preset",
    tags: ["3d프리셋", "골목", "비", "야경"],
    license: "toonspectrum-standard",
    entryName: "비 내리는 골목 밤",
    definition: {
      recipeId: "seed-bg3d-rainy-alley-night",
      parameters: { cameraFovDeg: 42, fogDensity: 0.22, rainIntensity: 0.65, neonHueShift: 210 },
    },
  },
  {
    packageId: "seed/bg3d/sunset-rooftop-school",
    name: "노을 옥상 학교 3D 프리셋",
    description: "청춘 물결 마무리 신에 어울리는 노을 옥상 배경 프리셋.",
    kind: "3d-preset",
    tags: ["3d프리셋", "학교", "노을"],
    license: "cc0-1.0",
    entryName: "노을 옥상 학교",
    definition: {
      recipeId: "seed-bg3d-sunset-rooftop-school",
      parameters: { sunElevationDeg: 8, hazeStrength: 0.4, cloudCover: 0.35 },
    },
  },
  {
    packageId: "seed/asset/procedural-teacup-set",
    name: "절차형 찻잔 세트",
    description: "파라미터만 바꾸면 되는 절차형 찻잔·접시 오브제 레시피.",
    kind: "asset",
    tags: ["에셋", "소품", "카페"],
    license: "cc-by-4.0",
    attributionText: "ToonSpectrum Market Seed (qa)",
    entryName: "절차형 찻잔 세트",
    definition: {
      recipeId: "seed-procedural-teacup-set",
      parameters: { rimRadius: 0.42, handleAngle: 96, glazeGloss: 0.55, saucer: true },
    },
  },
  {
    packageId: "seed/asset/street-prop-pack",
    name: "거리 소품 팩 (볼라드·표지판)",
    description: "도시 배경에 필요한 볼라드와 표지판 절차형 소품 묶음.",
    kind: "asset",
    tags: ["에셋", "도시", "소품"],
    license: "cc-by-nc-4.0",
    attributionText: "ToonSpectrum Market Seed (qa) — CC BY-NC",
    entryName: "거리 소품 팩",
    definition: {
      recipeId: "seed-street-prop-pack",
      parameters: { bollardHeight: 0.9, signVariants: 3, wearLevel: 0.25 },
    },
  },
];

function buildManifest(spec: SeedSpec): CreatorMarketplaceResourceManifest {
  const runtime = CREATOR_MARKETPLACE_RUNTIME_BY_KIND[spec.kind];
  const mode = spec.kind === "asset" || spec.kind === "3d-preset"
    ? "procedural-recipe"
    : "portable-json";
  const payload = {
    schemaVersion: 1 as const,
    resourceKind: spec.kind,
    runtime,
    definition: spec.definition,
  };
  const canonical = canonicalizeCreatorMarketplaceJson(payload);
  const manifest = {
    schemaVersion: 1 as const,
    packageId: spec.packageId,
    name: spec.name,
    description: spec.description,
    kind: spec.kind,
    resourceVersion: "1.0.0",
    minimumStudioVersion: "1.0.0",
    tags: spec.tags,
    license: spec.license,
    attributionText: spec.attributionText ?? "",
    containsAi: spec.containsAi ?? false,
    rightsConfirmed: true as const,
    provenance: { origin: "original", authoredByPublisher: true } as const,
    compatibility: { engines: ["canvas2d"] as const },
    entries: [
      {
        id: `${spec.kind}/${spec.packageId.split("/").pop()}`,
        kind: spec.kind,
        name: spec.entryName,
        delivery: {
          mode,
          mediaType: MEDIA_TYPE_BY_KIND[spec.kind],
          payload,
          byteSize: creatorMarketplaceJsonByteSize(payload),
          sha256: sha256(canonical),
        },
      },
    ],
  };
  return CreatorMarketplaceResourceManifestSchema.parse(manifest);
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1]?.startsWith("--") ? "" : (argv[index + 1] ?? "");
    args[key] = value;
  }
  return args;
}

const CSRF_HEADERS = { "x-toonspectrum-csrf": "1" } as const;

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const api = (args.api ?? "http://127.0.0.1:4001").replace(/\/$/u, "");
  const email = args.email ?? "market-seed@toonstudio.dev";
  const password = args.password ?? "SeedMarket!2026";
  const name = args.name ?? "마켓 시드";

  const signup = await fetch(`${api}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: api, ...CSRF_HEADERS },
    body: JSON.stringify({ email, password, name }),
  });
  if (!signup.ok && signup.status !== 409) {
    console.error("signup failed:", signup.status, await signup.text());
    process.exit(1);
  }

  const login = await fetch(`${api}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: api, ...CSRF_HEADERS },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) {
    console.error("login failed:", login.status, await login.text());
    process.exit(1);
  }
  const setCookie = login.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((value) => value.split(";")[0]).join("; ");
  if (!cookie) {
    console.error("login returned no session cookie");
    process.exit(1);
  }
  const session = await fetch(`${api}/api/auth/session`, { headers: { cookie } });
  console.log("session:", session.status, (await session.text()).slice(0, 120));

  let published = 0;
  for (const spec of SEEDS) {
    const manifest = buildManifest(spec);
    const response = await fetch(`${api}/api/creator/marketplace/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: api, cookie, ...CSRF_HEADERS },
      body: JSON.stringify(manifest),
    });
    if (response.ok || response.status === 409) {
      published += 1;
      console.log(`${response.status === 409 ? "exists" : "published"}: ${spec.name}`);
    } else {
      console.error(`FAILED (${response.status}): ${spec.name}`, (await response.text()).slice(0, 300));
    }
  }
  const list = await fetch(`${api}/api/creator/marketplace/resources?limit=32`);
  const page = (await list.json()) as { items?: unknown[] };
  console.log(`done. published=${published}/${SEEDS.length} listTotal=${page.items?.length ?? "?"}`);
}

await main();
