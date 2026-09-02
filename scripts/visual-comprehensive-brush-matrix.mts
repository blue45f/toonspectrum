import * as fs from "fs";
import * as path from "path";

import { chromium } from "@playwright/test";

const SCREENSHOT_DIR = "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db/scratch/screenshots";
const ARTIFACT_DIR = "/Users/hjunkim/.gemini/antigravity-cli/brain/568061dd-ed20-4d79-9311-998b433737db";

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

interface BrushGroup {
  groupName: string;
  imageFileName: string;
  brushes: Array<{
    id: string;
    searchTerm: string;
    displayName: string;
    color: string;
    size: number;
    description: string;
  }>;
}

const BRUSH_GROUPS: BrushGroup[] = [
  {
    groupName: "1. 펜 및 잉크 드로잉 (Inking & Pen)",
    imageFileName: "20_showcase_pens_and_inking.png",
    brushes: [
      { id: "pen", searchTerm: "펜(매끈)", displayName: "기본 펜 (Pen)", color: "#18181b", size: 6, description: "안정적인 클린 라인" },
      { id: "gpen", searchTerm: "G펜", displayName: "G펜 (G-Pen)", color: "#09090b", size: 8, description: "필압 강약 대비 카툰 선" },
      { id: "maru-pen", searchTerm: "마루펜", displayName: "마루펜 (Maru Pen)", color: "#1e1e24", size: 4, description: "정밀 세밀선 묘사" },
      { id: "glass-pen", searchTerm: "유리펜", displayName: "유리 딥펜 (Glass Dip Pen)", color: "#27272a", size: 5, description: "잉크 머금음과 맑은 세필" },
      { id: "calligraphy", searchTerm: "캘리그래피", displayName: "캘리그래피 (Calligraphy)", color: "#312e81", size: 14, description: "각도 립 엣지 서예 획" },
      { id: "fountain-pen", searchTerm: "만년필", displayName: "만년필 (Fountain Pen)", color: "#1c1917", size: 7, description: "클래식 잉크 흐름 선" },
    ],
  },
  {
    groupName: "2. 연필 및 건식 미디어 (Pencil & Dry Media)",
    imageFileName: "21_showcase_pencil_and_dry_media.png",
    brushes: [
      { id: "pencil", searchTerm: "기본 연필", displayName: "기본 연필 (Pencil)", color: "#3f3f46", size: 8, description: "종이 결 입자 흑연 질감" },
      { id: "pencil-2b", searchTerm: "2B 연필", displayName: "2B 연필 (2B Pencil)", color: "#27272a", size: 10, description: "부드럽고 짙은 스케치 선" },
      { id: "soft-pencil", searchTerm: "소프트 연필", displayName: "소프트 연필 (Soft Pencil)", color: "#475569", size: 9, description: "부드러운 에스키스 선" },
      { id: "charcoal", searchTerm: "목탄", displayName: "목탄 (Charcoal)", color: "#18181b", size: 24, description: "풍부한 가루 번짐과 톤" },
      { id: "crayon", searchTerm: "크레용", displayName: "크레용 (Crayon)", color: "#b91c1c", size: 18, description: "두껍고 거친 왁스 질감" },
      { id: "pastel", searchTerm: "소프트 파스텔", displayName: "소프트 파스텔 (Pastel)", color: "#047857", size: 22, description: "부드러운 입자 블러링" },
    ],
  },
  {
    groupName: "3. 수채화 및 수묵 워시 (Watercolor & Ink Wash)",
    imageFileName: "22_showcase_watercolor_and_inkwash.png",
    brushes: [
      { id: "watercolor", searchTerm: "맑은 수채화", displayName: "맑은 수채화 (Watercolor)", color: "#0284c7", size: 28, description: "가장자리 안료 응집(Edge Bleed)" },
      { id: "inkwash-bleed-wash", searchTerm: "발묵", displayName: "먹물 발묵 (Ink Wash)", color: "#0f172a", size: 34, description: "촉촉한 수묵 발묵 효과" },
      { id: "inkwash-pen", searchTerm: "수묵 세필", displayName: "수묵 세필 (Ink Fine Pen)", color: "#18181b", size: 12, description: "자연스러운 갈필 세필" },
      { id: "gouache", searchTerm: "불투명 구아슈", displayName: "구아슈 (Gouache)", color: "#4338ca", size: 26, description: "불투명 매트 수채화" },
    ],
  },
  {
    groupName: "4. 유화 및 아크릴 페인팅 (Oil & Heavy Paint)",
    imageFileName: "23_showcase_oil_and_acrylic.png",
    brushes: [
      { id: "oil", searchTerm: "유화 붓", displayName: "유화 붓 (Oil Bristle)", color: "#b45309", size: 28, description: "강모 결 레이크 텍스처" },
      { id: "acrylic", searchTerm: "아크릴", displayName: "아크릴 (Acrylic)", color: "#dc2626", size: 26, description: "선명한 피그먼트 필드" },
    ],
  },
  {
    groupName: "5. 에어브러시, 스프레이 & FX (Airbrush & Particles)",
    imageFileName: "24_showcase_airbrush_and_fx.png",
    brushes: [
      { id: "airbrush", searchTerm: "소프트 에어브러시", displayName: "소프트 에어브러시 (Airbrush)", color: "#ec4899", size: 36, description: "부드러운 그라데이션 안개" },
      { id: "spray", searchTerm: "스프레이", displayName: "스프레이 (Spray)", color: "#8b5cf6", size: 42, description: "미세 분사 입자" },
      { id: "splatter", searchTerm: "스플래터", displayName: "스플래터 (Splatter)", color: "#e11d48", size: 30, description: "방사형 페인트 튀김" },
      { id: "glitter", searchTerm: "글리터", displayName: "글리터 (Glitter)", color: "#eab308", size: 26, description: "빛나는 반짝이 파티클" },
      { id: "neon", searchTerm: "네온 마커", displayName: "네온 글로우 (Neon Glow)", color: "#06b6d4", size: 16, description: "발광 코어 + 네온 아우라" },
    ],
  },
  {
    groupName: "6. 마커 및 형광펜 (Markers & Highlighters)",
    imageFileName: "25_showcase_markers_and_highlighters.png",
    brushes: [
      { id: "marker", searchTerm: "아트 마커", displayName: "아트 마커 (Art Marker)", color: "#2563eb", size: 20, description: "반투명 잉크 중첩 톤" },
      { id: "alcohol-marker", searchTerm: "알코올 마커", displayName: "알코올 마커 (Alcohol Marker)", color: "#7c3aed", size: 22, description: "자연스러운 블렌딩 워시" },
      { id: "highlighter", searchTerm: "형광펜", displayName: "형광펜 (Highlighter)", color: "#84cc16", size: 26, description: "맑은 납작 닙 하이라이트" },
    ],
  },
];

async function run() {
  console.log("=== Launching Comprehensive Studio Visual Matrix Audit ===");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--use-gl=swiftshader"],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1200 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error(`[Browser Error]: ${msg.text()}`);
    }
  });

  console.log("Navigating to http://localhost:5173/studio ...");
  await page.goto("http://localhost:5173/studio", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  for (let gIdx = 0; gIdx < BRUSH_GROUPS.length; gIdx++) {
    const group = BRUSH_GROUPS[gIdx]!;
    console.log(`\n========================================`);
    console.log(`Testing Group [${gIdx + 1}/${BRUSH_GROUPS.length}]: ${group.groupName}`);
    console.log(`========================================`);

    // Clean canvas for each group by navigating or clearing
    if (gIdx > 0) {
      await page.goto("http://localhost:5173/studio", { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
    }

    // Activate Pen Tool
    await page.keyboard.press("b");
    await page.waitForTimeout(200);

    const stage = page.locator(".konvajs-content").first();
    const box = await stage.boundingBox();
    if (!box) throw new Error("Stage bounds not found");

    const startX = box.x + box.width * 0.12;
    const startY = box.y + box.height * 0.12;
    const rowGap = Math.min(130, (box.height * 0.75) / group.brushes.length);

    for (let bIdx = 0; bIdx < group.brushes.length; bIdx++) {
      const brush = group.brushes[bIdx]!;
      const y = startY + bIdx * rowGap;

      console.log(`  -> [${bIdx + 1}/${group.brushes.length}] Selecting brush: ${brush.displayName} (${brush.id})...`);

      // 1. Try selecting via quick chip first
      const directChip = page.locator(`[data-studio-brush-chip="${brush.id}"]`).first();
      if (await directChip.isVisible()) {
        await directChip.click();
        await page.waitForTimeout(150);
      } else {
        // 2. Open Brush Library Catalog
        const openLibButton = page.locator('[data-studio-open-brush-library="true"]').first();
        if (await openLibButton.isVisible()) {
          await openLibButton.click();
          await page.waitForTimeout(200);

          const searchInput = page.locator('input[data-studio-brush-search-scope="all"]').first();
          if (await searchInput.isVisible()) {
            await searchInput.fill("");
            await searchInput.fill(brush.searchTerm);
            await page.waitForTimeout(200);

            const itemButton = page.locator(`button[data-studio-brush-select="${brush.id}"]`).first();
            if (await itemButton.isVisible()) {
              await itemButton.click();
              await page.waitForTimeout(200);
            } else {
              const firstResult = page.locator("button[data-studio-brush-select]").first();
              if (await firstResult.isVisible()) {
                await firstResult.click();
                await page.waitForTimeout(200);
              }
            }
          }
        }
      }

      // Close library if still open
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);

      // Ensure pen tool is active
      await page.keyboard.press("b");
      await page.waitForTimeout(100);

      // 3. Draw test patterns on canvas
      // Pattern A: S-Curve Flourish
      await page.mouse.move(startX, y);
      await page.mouse.down();
      for (let s = 1; s <= 24; s++) {
        const px = startX + s * 14;
        const py = y + Math.sin(s * 0.35) * 22;
        await page.mouse.move(px, py, { steps: 2 });
      }
      await page.mouse.up();

      // Pattern B: Fast Velocity Taper Stroke
      const bx = startX + 380;
      await page.mouse.move(bx, y);
      await page.mouse.down();
      await page.mouse.move(bx + 180, y - 10, { steps: 3 });
      await page.mouse.move(bx + 260, y + 15, { steps: 1 });
      await page.mouse.up();

      // Pattern C: Pressure Swell & Hatching
      const cx = startX + 680;
      await page.mouse.move(cx, y - 20);
      await page.mouse.down();
      for (let h = 0; h < 8; h++) {
        await page.mouse.move(cx + (h % 2 === 0 ? 35 : -15), y - 20 + h * 6, { steps: 1 });
      }
      await page.mouse.up();

      await page.waitForTimeout(100);
    }

    // Wait for canvas to settle
    await page.waitForTimeout(800);

    // Capture Group Showcase Screenshot
    const groupScreenshotPath = path.join(SCREENSHOT_DIR, group.imageFileName);
    await page.screenshot({ path: groupScreenshotPath });

    const artifactPath = path.join(ARTIFACT_DIR, group.imageFileName);
    fs.copyFileSync(groupScreenshotPath, artifactPath);
    console.log(`  Saved group showcase to: ${artifactPath}`);
  }

  // Final Overview
  const finalOverviewPath = path.join(SCREENSHOT_DIR, "26_brush_system_comprehensive_matrix.png");
  await page.screenshot({ path: finalOverviewPath });
  const finalArtifactPath = path.join(ARTIFACT_DIR, "26_brush_system_comprehensive_matrix.png");
  fs.copyFileSync(finalOverviewPath, finalArtifactPath);
  console.log(`\nSaved comprehensive matrix overview to: ${finalArtifactPath}`);

  await browser.close();
  console.log("\n=== Visual Matrix Audit Complete! ===");
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
