import { expect, test } from "@playwright/test";

/** Production component and real canvas/recording; only the text AI HTTP boundary is mocked. */
test("promo editor uploads, edits, plans, exports and cancels", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let malformed = false;
  let posted = "";
  await page.route("https://promo-ai.invalid/v1/chat/completions", (route) => {
    const body = route.request().postDataJSON() as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    const user = body.messages.find((message) => message.role === "user")?.content ?? "";
    posted = user;
    const data = JSON.parse(user) as { panels: { id: string }[] };
    expect(body.model).toBe("ci-text-fixture");
    expect(route.request().headers().authorization).toBe("Bearer promo-e2e-key");
    expect(route.request().headers().cookie).toBeUndefined();
    const content = malformed
      ? '{"scenes":[]}'
      : JSON.stringify({
          scenes: [...data.panels].reverse().map((panel, index) => ({
            id: panel.id,
            caption: `예고편 자막 ${index + 1}`,
            motion: "push-in",
            weight: 1,
          })),
        });
    return route.fulfill({ json: { choices: [{ message: { content } }] } });
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/tools/browser-harnesses/promo-e2e.html?user-ai=fixture");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const fixtures = await page.evaluate(() => [0, 1, 2].map((index) => {
    const canvas = document.createElement("canvas");
    canvas.width = 600; canvas.height = 900;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas context");
    context.fillStyle = ["#192b4f", "#51314b", "#244c4d"][index] ?? "#192b4f";
    context.fillRect(0, 0, 600, 900);
    context.fillStyle = "#e1d5ba";
    context.fillRect(70 + index * 40, 180, 230, 480);
    context.fillStyle = "#f5b47e";
    context.beginPath(); context.arc(320, 250 + index * 150, 110, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#ffffff"; context.font = "bold 48px sans-serif"; context.fillText(`CUT ${index + 1}`, 70, 790);
    return canvas.toDataURL("image/png").split(",")[1] ?? "";
  }));
  await page.locator("#promo-panels").setInputFiles(fixtures.map((data, index) => ({ name: `cut-${index}.png`, mimeType: "image/png", buffer: Buffer.from(data, "base64") })));
  await expect(page.locator(".promo-shot")).toHaveCount(3);
  await page.locator("#promo-work-title").fill("별빛 아래, 우리의 이야기");
  await page.locator("#promo-synopsis").fill("밤의 도시에서 다시 만난 두 사람의 로맨스. 결말은 공개하지 않는다.");
  await page.locator(".promo-shot textarea").first().fill("밤의 도시를 바라보는 주인공");
  await page.getByRole("button", { name: "로컬 연출 템플릿", exact: true }).click();
  await expect(page.locator(".promo-feedback")).toContainText("AI 생성 결과가 아니며");
  await page.getByRole("button", { name: "AI로 홍보 콘티 구성", exact: true }).click();
  await expect(page.locator(".promo-feedback")).toContainText("내 API 키의 텍스트 AI 구성 적용");
  expect(posted).not.toContain("base64");
  expect(posted).not.toContain('"src"');
  await expect(page.locator('input[id^="caption-"]').first()).toHaveValue("예고편 자막 1");
  malformed = true;
  await page.getByRole("button", { name: "AI로 홍보 콘티 구성", exact: true }).click();
  await expect(page.locator(".promo-error")).toContainText("컷 수");
  await expect(page.locator('input[id^="caption-"]').first()).toHaveValue("예고편 자막 1");
  await page.getByRole("button", { name: "로컬 연출 템플릿", exact: true }).click();
  const wav = Buffer.alloc(44 + 16000 * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(32000, 40);
  for (let index = 0; index < 16000; index += 1) wav.writeInt16LE(Math.round(Math.sin(index * Math.PI * 2 * 220 / 16000) * 6000), 44 + index * 2);
  await page.locator("#promo-audio").setInputFiles({ name: "ci-tone.wav", mimeType: "audio/wav", buffer: wav });
  await expect(page.getByRole("button", { name: "BGM 제거" })).toBeVisible();
  await page.getByRole("button", { name: "재생", exact: true }).click();
  await expect(page.locator(".promo-playback output")).not.toContainText("0.0 /");
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("promo-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("promo-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  const [kit] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Remotion 프로젝트 ZIP", exact: true }).click()]);
  await kit.saveAs(testInfo.outputPath("render-kit.zip"));
  const [srt] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "자막 SRT", exact: true }).click()]);
  await srt.saveAs(testInfo.outputPath("captions.srt"));
  const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "프로젝트 JSON 저장", exact: true }).click()]);
  const jsonPath = testInfo.outputPath("project.json");
  await json.saveAs(jsonPath);
  await page.locator("#promo-work-title").fill("변경된 제목");
  await page.locator("#promo-import").setInputFiles(jsonPath);
  await expect(page.locator("#promo-work-title")).toHaveValue("별빛 아래, 우리의 이야기");
  const save = page.getByRole("button", { name: /^영상 저장 ·/u });
  await save.click();
  await expect(page.getByRole("button", { name: "작업 취소", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "작업 취소", exact: true }).click();
  await expect(save).toBeEnabled();
  await expect(page.locator(".promo-feedback")).toContainText("취소");
  const [video] = await Promise.all([page.waitForEvent("download", { timeout: 45_000 }), save.click()]);
  await video.saveAs(testInfo.outputPath(video.suggestedFilename()));
  await expect(page.locator(".promo-feedback")).toContainText("영상 파일을 저장");
  expect(errors).toEqual([]);
});

test("director templates, layered parallax, narration, assets and local draft survive a real browser workflow", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/studio-ai/status", (route) => route.fulfill({ json: { configured: false, requiresAuth: true } }));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/tools/browser-harnesses/promo-e2e.html");
  await expect(page.locator("#promo-work-title")).toBeEnabled();
  const artwork = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 1800;
    const ctx = canvas.getContext("2d")!;
    for (let part = 0; part < 3; part += 1) {
      const y = part * 600;
      ctx.fillStyle = ["#142342", "#243f52", "#512947"][part]!; ctx.fillRect(0, y, 600, 600);
      ctx.fillStyle = "#a1c9eb";
      for (let i = 0; i < 9; i += 1) ctx.fillRect(i * 75, y + 120 + (i % 3) * 70, 48, 380);
      ctx.fillStyle = "white"; ctx.font = "bold 38px sans-serif"; ctx.fillText(`STORY ${part + 1}`, 60, y + 80);
    }
    const strip = canvas.toDataURL("image/png").split(",")[1]!;
    canvas.width = 400; canvas.height = 600;
    ctx.clearRect(0, 0, 400, 600); ctx.fillStyle = "#eac0a0"; ctx.beginPath(); ctx.arc(210, 140, 60, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#eee2ef"; ctx.fillRect(145, 200, 130, 250);
    return { strip, foreground: canvas.toDataURL("image/png").split(",")[1]! };
  });
  await page.locator("#promo-split").selectOption("3");
  await page.locator("#promo-panels").setInputFiles({ name: "long-strip.png", mimeType: "image/png", buffer: Buffer.from(artwork.strip, "base64") });
  await expect(page.locator(".promo-shot")).toHaveCount(3);
  await page.locator("#promo-work-title").fill("도시의 별 · Director QA");
  await page.locator('input[id^="caption-"]').first().fill("우리가 다시 만나는 순간");
  await page.getByRole("button", { name: /애니 오프닝/u }).click();
  await expect(page.locator('select[id^="motion-"]').first()).toHaveValue("impact");
  await page.locator(".promo-shot-direction summary").first().click();
  await page.locator('select[id^="transition-"]').first().selectOption("dissolve");
  await page.locator('select[id^="effect-"]').first().selectOption("rain");
  await page.locator('select[id^="fit-"]').first().selectOption("cover");
  await page.locator('input[id^="focus-x-"]').first().fill("0.8");
  await page.locator('input[id^="foreground-"]').first().setInputFiles({ name: "actor.png", mimeType: "image/png", buffer: Buffer.from(artwork.foreground, "base64") });
  await expect(page.getByRole("button", { name: "전경 제거" })).toBeVisible();
  await page.locator('select[id^="camera-mode-"]').first().selectOption("custom");
  await page.locator('input[id^="camera-to-zoom-"]').first().fill("1.5");
  await page.getByRole("button", { name: "컷 1 복제", exact: true }).click();
  await expect(page.locator(".promo-shot")).toHaveCount(4);
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(page.locator(".promo-shot")).toHaveCount(3);
  await page.getByRole("button", { name: "다시 실행", exact: true }).click();
  await expect(page.locator(".promo-shot")).toHaveCount(4);
  await page.locator("#promo-caption-style").selectOption("boxed");
  await page.locator("#promo-brand-text").fill("TOONSTUDIO ORIGINAL");
  await page.getByRole("button", { name: "펄스 생성", exact: true }).click();
  await expect(page.getByRole("button", { name: "BGM 제거" })).toBeVisible();
  const wav = Buffer.alloc(44 + 16000 * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(32000, 40);
  for (let i = 0; i < 16000; i += 1) wav.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 880 / 16000) * 9000), 44 + i * 2);
  await page.locator("#promo-voice").setInputFiles({ name: "narration-test.wav", mimeType: "audio/wav", buffer: wav });
  await expect(page.getByRole("button", { name: "내레이션 제거" })).toBeVisible();
  await page.locator("#promo-voice-start").fill("2");
  await page.getByRole("button", { name: "재생", exact: true }).click();
  await expect(page.locator(".promo-playback output")).toContainText(/3\.\d \/ 15초/u);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("director-desktop.png"), fullPage: true });
  for (const [button, filename] of [["홍보 썸네일 PNG", "poster.png"], ["콘티 시트 PNG", "contact-sheet.png"], ["자막 VTT", "director-captions.vtt"], ["장면 타임코드 JSON", "shot-list.json"], ["Remotion 프로젝트 ZIP", "director-render-kit.zip"]]) {
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: button!, exact: true }).click()]);
    await download.saveAs(testInfo.outputPath(filename!));
  }
  await expect(page.locator(".promo-draft-status")).toContainText("자동 저장됨");
  page.on("dialog", (dialog) => void dialog.accept());
  await page.reload();
  await expect(page.locator("#promo-work-title")).toHaveValue("도시의 별 · Director QA");
  await expect(page.locator(".promo-shot")).toHaveCount(4);
  await expect(page.locator("#promo-brand-text")).toHaveValue("TOONSTUDIO ORIGINAL");
  await expect(page.locator("#promo-voice-start")).toHaveValue("2");
  await expect(page.getByRole("button", { name: "내레이션 제거" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("director-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  // Once loaded, local composition/export must work without any AI/API/network connection.
  await page.context().setOffline(true);
  const [video] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), page.getByRole("button", { name: /^영상 저장 ·/u }).click()]);
  await video.saveAs(testInfo.outputPath(`director.${video.suggestedFilename().split(".").pop()}`));
  await expect(page.locator(".promo-feedback")).toContainText("영상 파일을 저장");
  await page.context().setOffline(false);
  expect(errors).toEqual([]);
});
