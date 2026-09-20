import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
const base = process.env.FORTUNE_BASE_URL ?? "http://127.0.0.1:5379";
const output = join(tmpdir(), "fortune-special-days-evidence"); await mkdir(output, { recursive: true });
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: existsSync(chrome) ? chrome : undefined, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const errors = []; page.on("pageerror", (error) => errors.push(String(error)));
let calls = 0, unavailable = false;
await page.route("**/api/**", (route) => route.abort());
await page.route("**/api/fortune/special-days?**", async (route) => {
  calls += 1; const query = new URL(route.request().url()).searchParams;
  if ([...query.keys()].sort().join(",") !== "category,month") throw new Error("Private or unexpected query fields");
  if (unavailable) return route.fulfill({ status: 503, body: "unavailable" });
  return route.fulfill({ contentType: "application/json", body: JSON.stringify({ kind: "special-days", month: query.get("month"), category: query.get("category"),
    status: "external-cache", source: "kasi", policyRevision: "synthetic-browser-fixture", checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(),
    items: [{ date: "2024-02-29", sequence: 1, name: "테스트 특일", isHoliday: true }] }) });
});
try {
  await page.goto(`${base}/fortune?content=almanac`, { timeout: 120000 });
  await page.getByLabel("조회할 달", { exact: true }).fill("2024-02");
  await page.getByRole("button", { name: "만세력 달력 열기", exact: true }).click();
  await page.getByText("공휴일·기념일·절기 정보", { exact: true }).click();
  if (calls !== 0) throw new Error("Unexpected automatic fetch");
  await page.getByRole("button", { name: "특일 정보 확인", exact: true }).click(); await page.getByText(/테스트 특일/).waitFor();
  await page.getByLabel("특일 분류").selectOption("solar-terms");
  if (await page.getByText(/테스트 특일/).count()) throw new Error("Previous category leaked");
  await page.getByRole("button", { name: "특일 정보 확인", exact: true }).click(); await page.getByText(/테스트 특일/).waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Overflow at ${width}`);
    await page.screenshot({ path: join(output, `special-days-${width}.png`), fullPage: true });
  }
  unavailable = true; await page.getByLabel("특일 분류").selectOption("anniversaries");
  await page.getByRole("button", { name: "특일 정보 확인", exact: true }).click();
  await page.getByText("특일 데이터를 확인할 수 없어 기본 달력을 유지합니다.", { exact: true }).waitFor();
  if (await page.getByRole("button", { name: /2024-02-29 음력/ }).count() !== 1) throw new Error("Base calendar lost");
  if (errors.length) throw new Error(errors.join("; "));
  const result = { passed: true, calls, widths: [320, 390, 768, 1440], errors, provider: "synthetic-only" };
  await writeFile(join(output, "result.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} catch (error) { console.error(error); process.exitCode = 1; await page.screenshot({ path: join(output, "failure.png"), fullPage: true }); }
finally { await browser.close(); }
