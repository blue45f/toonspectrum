import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const base = process.env.FORTUNE_BASE_URL ?? "http://127.0.0.1:5279";
const output = process.env.FORTUNE_EVIDENCE_DIR ?? join(tmpdir(), "fortune-enrichment-evidence");
await mkdir(output, { recursive: true });
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: existsSync(chrome) ? chrome : undefined, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const errors = []; page.on("pageerror", (error) => errors.push(String(error)));
await page.route("**/api/fortune/**", (route) => route.abort());
try {
  await page.goto(`${base}/fortune?content=tarot-three`, { timeout: 120000 });
  await page.locator("#fo-tarot-deck").selectOption("full-78"); await page.locator("#fo-date").fill("2024-02-29");
  if (await page.getByRole("radio").count() !== 78) throw new Error("Expected 78 choices");
  await page.getByRole("button", { name: "카드 섞기", exact: true }).click();
  if (await page.getByRole("radio").count() !== 78) throw new Error("Shuffle changed deck size");
  await page.getByRole("radio").nth(7).check(); await page.getByRole("button", { name: "3카드 타로 열기", exact: true }).click();
  await page.getByRole("button", { name: "상세 리포트", exact: true }).click(); await page.locator(".fo-tarot-results figure").nth(2).waitFor();
  const cards = await page.locator(".fo-tarot-results figure > p").allTextContents();
  if (new Set(cards).size !== 3 || !(await page.locator(".fo-method").textContent()).includes("전체 78장")) throw new Error("Full-deck identity was lost");
  await page.screenshot({ path: join(output, "full-deck-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: join(output, "full-deck-mobile.png"), fullPage: true });
  await page.goto(`${base}/fortune?content=almanac`); await page.getByLabel("조회할 달", { exact: true }).fill("2024-02");
  await page.getByRole("button", { name: "만세력 달력 열기", exact: true }).click();
  await page.getByRole("button", { name: "공공 데이터로 대조하기", exact: true }).click();
  await page.getByText("추가 데이터를 확인할 수 없어 기본 로컬 해석을 유지합니다.", { exact: true }).waitFor();
  await page.getByRole("button", { name: /2024-02-29 음력/ }).click();
  await page.getByText("2024-02-29 ·", { exact: false }).waitFor();
  await page.goto(`${base}/fortune?content=zodiac`); await page.getByPlaceholder("1990-06-15").first().fill("1990-06-15");
  await page.getByRole("button", { name: /별자리.*열기/ }).click();
  await page.getByRole("button", { name: "월간", exact: true }).click();
  await page.getByText(/주간은 월요일 시작/).waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Overflow at ${width}`);
  }
  await page.screenshot({ path: join(output, "zodiac-period.png"), fullPage: true });
  if (errors.length) throw new Error(errors.join("; "));
  await writeFile(join(output, "result.json"), JSON.stringify({ passed: true, cards, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, cards, errors }));
} catch (error) {
  await page.screenshot({ path: join(output, "failure.png"), fullPage: true });
  console.error(error); process.exitCode = 1;
} finally { await browser.close(); }
