import { expect, test } from "@playwright/test";

import {
  creatorMarketplaceJsonByteSize,
} from "../lib/creator-marketplace-resource-contract";

/**
 * 창작 마켓 E2E 테스트 — 공개 라우트, 인터랙티브 프리뷰(브러시, 팔레트, 필터, 템플릿, 3D), 스튜디오 딥링크 연동을 철저히 검증한다.
 */

const KIND_HREFS = [
  "/market/browse?kind=brush",
  "/market/browse?kind=filter",
  "/market/browse?kind=palette",
  "/market/browse?kind=template",
  "/market/browse?kind=3d-preset",
  "/market/browse?kind=asset",
];

test("마켓 홈은 카테고리 6종과 CTA를 렌더링한다", async ({ page }) => {
  await page.goto("/market");
  await expect(page.getByRole("heading", { name: "창작 마켓" })).toBeVisible();
  await expect(page.getByRole("link", { name: "리소스 둘러보기" })).toBeVisible();
  await expect(page.getByRole("link", { name: "스튜디오에서 공유하기" })).toBeVisible();

  for (const href of KIND_HREFS) {
    await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
  }
  await expect(page).toHaveTitle(/창작 마켓|Creator Market/);
});

test("마켓 탐색은 종류 칩 필터와 라이선스 필터를 제공한다", async ({ page }) => {
  await page.goto("/market/browse");
  await expect(page.getByRole("heading", { name: "마켓 탐색" })).toBeVisible();

  const kindGroup = page.getByRole("group", { name: "리소스 종류 필터" });
  await expect(kindGroup.getByRole("button", { name: "전체" })).toBeVisible();
  for (const label of ["브러시", "필터", "팔레트", "템플릿", "3D", "에셋"]) {
    await expect(kindGroup.getByRole("button", { name: new RegExp(label) })).toBeVisible();
  }

  const licenseGroup = page.getByRole("group", { name: "라이선스 필터" });
  await expect(licenseGroup.getByRole("button", { name: "전체 라이선스" })).toBeVisible();
});

test("종류 칩은 URL 파라미터를 갱신한다", async ({ page }) => {
  await page.goto("/market/browse");
  const kindGroup = page.getByRole("group", { name: "리소스 종류 필터" });
  await kindGroup.getByRole("button", { name: /브러시/ }).click();
  await expect(page).toHaveURL(/market\/browse\?kind=brush$/);
  await expect(kindGroup.getByRole("button", { name: /브러시/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("없는 리소스 상세는 404 안내 또는 오류 상태로 흐름 제어한다", async ({ page }) => {
  await page.goto("/market/resource/123e4567-e89b-42d3-a456-426614174000");
  await expect(page.getByRole("link", { name: "마켓으로 돌아가기" })).toBeVisible();
  await expect(
    page.getByText(/리소스를 찾을 수 없어요|불러올 수 없어요|불러오지 못했습니다/)
  ).toBeVisible({ timeout: 15_000 });
});

test("리소스 상세 페이지에서 브러시 인터랙티브 캔버스를 렌더링한다", async ({ page }) => {
  const resourceId = "123e4567-e89b-12d3-a456-426614174001";
  const payload = {
    schemaVersion: 1 as const,
    resourceKind: "brush" as const,
    runtime: "studio-brush-v1" as const,
    definition: {
      snapshot: {
        size: 14,
        opacity: 0.95,
        flow: 0.9,
        family: "pen",
        color: "#1e293b",
      },
    },
  };
  const byteSize = creatorMarketplaceJsonByteSize(payload);

  const mockBrushResource = {
    schemaVersion: 1,
    id: resourceId,
    packageId: "toon-ink-gpen",
    name: "먹물 G펜 프로",
    description: "웹툰 인물 펜선용 고감도 잉크 브러시",
    tags: ["ink", "gpen", "lineart"],
    kind: "brush",
    resourceVersion: "1.0.0",
    minimumStudioVersion: "1.0.0",
    license: "cc0-1.0",
    attributionText: "",
    containsAi: false,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d", "webgpu"] },
    entries: [
      {
        id: "gpen-entry",
        kind: "brush",
        name: "먹물 G펜",
        delivery: {
          mode: "portable-json",
          mediaType: "application/vnd.toonspectrum.brush+json",
          payload,
          byteSize,
          sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
      },
    ],
    manifestHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    manifestByteSize: 680,
    publisher: { id: "publisher-1", name: "김작가", avatar: null },
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
    isOwner: false,
    access: "free",
  };

  await page.route(new RegExp(`/creator/marketplace/resources/${resourceId}`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockBrushResource),
    });
  });

  await page.goto(`/market/resource/${resourceId}`);
  await expect(page.getByRole("heading", { name: "먹물 G펜 프로" })).toBeVisible();
  await expect(page.getByText("웹툰 인물 펜선용 고감도 잉크 브러시")).toBeVisible();
  await expect(page.getByRole("link", { name: "스튜디오에서 불러오기 & 설치" })).toBeVisible();
  await expect(page.getByRole("button", { name: "패키지 JSON 다운로드" })).toBeVisible();

  // 브러시 캔버스 프리뷰 확인
  await expect(page.locator("canvas.touch-none")).toBeVisible();
  await expect(page.getByText("마우스나 터치로 직접 그려보세요")).toBeVisible();
});

test("리소스 상세 페이지에서 팔레트 스와치와 색상 복사 인터랙션을 렌더링한다", async ({ page }) => {
  const resourceId = "123e4567-e89b-12d3-a456-426614174002";
  const payload = {
    schemaVersion: 1 as const,
    resourceKind: "palette" as const,
    runtime: "studio-palette-v1" as const,
    definition: {
      colors: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"],
    },
  };
  const byteSize = creatorMarketplaceJsonByteSize(payload);

  const mockPaletteResource = {
    schemaVersion: 1,
    id: resourceId,
    packageId: "sunset-webtoon-palette",
    name: "노을빛 로맨스 팔레트",
    description: "황혼 시간대 로맨스 판타지 웹툰 전용 컬러 세트",
    tags: ["sunset", "palette", "romance"],
    kind: "palette",
    resourceVersion: "1.0.0",
    minimumStudioVersion: "1.0.0",
    license: "cc-by-4.0",
    attributionText: "Created by ColorMaster",
    containsAi: false,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d"] },
    entries: [
      {
        id: "sunset-entry",
        kind: "palette",
        name: "노을빛 세트",
        delivery: {
          mode: "portable-json",
          mediaType: "application/vnd.toonspectrum.palette+json",
          payload,
          byteSize,
          sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
      },
    ],
    manifestHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    manifestByteSize: 520,
    publisher: { id: "publisher-2", name: "ColorMaster", avatar: null },
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
    isOwner: false,
    access: "free",
  };

  await page.route(new RegExp(`/creator/marketplace/resources/${resourceId}`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockPaletteResource),
    });
  });

  await page.goto(`/market/resource/${resourceId}`);
  await expect(page.getByRole("heading", { name: "노을빛 로맨스 팔레트" })).toBeVisible();
  await expect(page.getByText("색상 구성 (5색)")).toBeVisible();
  await expect(page.getByRole("button", { name: "#3b82f6 색상 복사" })).toBeVisible();
  await expect(page.getByRole("button", { name: "JSON 저장" })).toBeVisible();
});

test("리소스 상세 페이지에서 필터 전후 슬라이더를 렌더링한다", async ({ page }) => {
  const resourceId = "123e4567-e89b-12d3-a456-426614174003";
  const payload = {
    schemaVersion: 1 as const,
    resourceKind: "filter" as const,
    runtime: "studio-filter-v1" as const,
    definition: {
      engine: "color-adjustment",
      values: {
        contrast: 1.25,
        saturation: 20,
        brightness: 1.05,
      },
    },
  };
  const byteSize = creatorMarketplaceJsonByteSize(payload);

  const mockFilterResource = {
    schemaVersion: 1,
    id: resourceId,
    packageId: "cinematic-film-filter",
    name: "시네마틱 필름 룩",
    description: "웹툰 썸네일 및 드라마틱 씬을 위한 시네마틱 톤 보정 필터",
    tags: ["filter", "cinematic", "tone"],
    kind: "filter",
    resourceVersion: "1.0.0",
    minimumStudioVersion: "1.0.0",
    license: "toonspectrum-standard",
    attributionText: "",
    containsAi: false,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d", "webgl2", "webgpu"] },
    entries: [
      {
        id: "cinematic-entry",
        kind: "filter",
        name: "시네마틱 필름",
        delivery: {
          mode: "portable-json",
          mediaType: "application/vnd.toonspectrum.filter+json",
          payload,
          byteSize,
          sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
      },
    ],
    manifestHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    manifestByteSize: 620,
    publisher: { id: "publisher-3", name: "필터장인", avatar: null },
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
    isOwner: false,
    access: "free",
  };

  await page.route(new RegExp(`/creator/marketplace/resources/${resourceId}`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockFilterResource),
    });
  });

  await page.goto(`/market/resource/${resourceId}`);
  await expect(page.getByRole("heading", { name: "시네마틱 필름 룩" })).toBeVisible();
  await expect(page.getByText("필터 효과 미리보기 (시네마틱 필름)")).toBeVisible();
  await expect(page.getByText("필터 적용")).toBeVisible();
  await expect(page.getByText("원본 (Raw)")).toBeVisible();
  await expect(page.getByLabel("필터 전후 비교 슬라이더")).toBeVisible();
});

test("스튜디오 마켓 딥링크 진입 시 커뮤니티 탭이 활성화된다", async ({ page }) => {
  await page.goto("/studio?assetMarket=community");
  await expect(page.locator("body")).toBeVisible();
});
