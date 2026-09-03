import { expect, test, type Page } from "@playwright/test";

const HANDOFF_KEY = "toonspectrum:creator-marketplace-handoff:v2";

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => Math.max(
    0,
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
}

async function openPublish(page: Page): Promise<void> {
  await page.goto("/market/publish", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("marketplace-authoring-workshop")).toBeVisible({
    timeout: 90_000,
  });
}

test.describe("Creator Marketplace authoring workshop", () => {
  test("desktop creator can compose a multi-engine brush package", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openPublish(page);

    await page.getByTestId("market-authoring-title").fill("Chromium multi-engine ink");
    await page.getByRole("tab", { name: /엔진·구성/u }).click();
    await page.getByLabel("추가할 엔진").selectOption("watercolor-diffusion");
    await page.getByTestId("market-authoring-add-engine").click();
    await page.getByLabel("추가할 엔진").selectOption("glow");
    await page.getByTestId("market-authoring-add-engine").click();

    const list = page.getByTestId("market-authoring-engine-list");
    await expect(list.getByText("수채 확산", { exact: true })).toBeVisible();
    await expect(list.getByText("글로우", { exact: true })).toBeVisible();
    await expect(list.getByRole("button", { name: "위로 이동" })).toHaveCount(3);

    await page.getByRole("tab", { name: /미리보기/u }).click();
    await expect(page.getByTestId("market-authoring-brush-preview")).toBeVisible();
    await page.getByRole("button", { name: /stroke-sheet/u }).click();
    await expect(page.getByText("stroke-sheet", { exact: true })).toHaveCount(2);

    await expectNoHorizontalOverflow(page);
  });

  test("mobile authoring keeps every step reachable without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPublish(page);

    const workshop = page.getByTestId("marketplace-authoring-workshop");
    await expect(workshop.getByRole("button", { name: "브러시", exact: true })).toBeVisible();
    for (const name of ["제작 원본", "엔진·구성", "미리보기", "번들", "호환성", "권리", "검수·배포"]) {
      const tab = workshop.getByRole("tab", { name: new RegExp(name, "u") });
      await tab.scrollIntoViewIfNeeded();
      await expect(tab).toBeVisible();
    }
    await workshop.getByRole("button", { name: "3D 에셋", exact: true }).click();
    await workshop.getByRole("tab", { name: /엔진·구성/u }).click();
    await expect(workshop.getByLabel("polygonCount")).toBeVisible();
    await expect(workshop.getByLabel("lodCount")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("Brush Studio handoff restores exact native engine programs", async ({ page }) => {
    await page.addInitScript(({ key }) => {
      const now = new Date().toISOString();
      const dryProgram = { id: "dry", kind: "dry-media", grain: { scale: 0.7 } };
      const waterProgram = {
        id: "water",
        kind: "watercolor-diffusion",
        wetMix: { water: 0.5 },
      };
      sessionStorage.setItem(key, JSON.stringify({
        schemaVersion: 2,
        id: "draft_e2e",
        resumeToken: "resume_e2e_native_programs",
        createdAt: now,
        updatedAt: now,
        kind: "brush",
        title: "Native program handoff",
        summary: "A production Brush Studio handoff with native programs.",
        description: "This fixture verifies that exact native engine programs remain attached to the authoring draft.",
        tags: ["ink", "hybrid"],
        source: {
          mode: "brush-studio",
          name: "Native program handoff",
          studioSnapshot: {
            name: "Native program handoff",
            enginePrograms: [dryProgram, waterProgram],
          },
        },
        brush: {
          engineNodes: [
            {
              id: "studio_program_0",
              name: "Studio engine 1",
              engine: "dry-media",
              sourceProgram: dryProgram,
            },
            {
              id: "studio_program_1",
              name: "Studio engine 2",
              engine: "watercolor-diffusion",
              sourceProgram: waterProgram,
            },
          ],
          originalEnginePrograms: [dryProgram, waterProgram],
          deterministicSeed: 42,
          presetFamily: "hybrid",
          intendedUse: ["inking"],
        },
        technical: {},
        compatibility: {
          canvas2d: true,
          webgl2: true,
          webgpu: false,
          wasm: false,
          touch: true,
          stylus: true,
          mouse: true,
          minAppVersion: "1.0.0",
          testedBrowsers: ["Chrome"],
          notes: "",
        },
        media: [],
        bundle: [],
        release: {
          mode: "new",
          version: "1.0.0",
          changelog: "Initial release",
          migrationNotes: "",
          breaking: false,
        },
        rights: {
          license: "free",
          commercialUse: true,
          redistribution: false,
          aiTrainingAllowed: false,
          containsThirdPartyContent: false,
          thirdPartyAttribution: "",
          originalWorkAttested: false,
          previewRightsAttested: false,
        },
        reviewNotes: "",
        completedSteps: [],
      }));
    }, { key: HANDOFF_KEY });

    await openPublish(page);
    await expect(page.getByTestId("market-authoring-title")).toHaveValue("Native program handoff");
    await page.getByRole("tab", { name: /엔진·구성/u }).click();
    const list = page.getByTestId("market-authoring-engine-list");
    await expect(list.getByText("Studio 원본 보존", { exact: true })).toHaveCount(2);
  });
});
