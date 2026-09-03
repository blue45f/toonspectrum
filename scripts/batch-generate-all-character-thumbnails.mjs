
import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const SAMPLES_FILE = "scripts/sample-vrms-list.json";
const OUT_DIR = "public/assets/3d/characters/thumbnails";

async function main() {
  const characters = JSON.parse(fs.readFileSync(SAMPLES_FILE, "utf8"));
  console.log("Starting batch 3D thumbnail generation for", characters.length, "characters...");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const server = await createServer({
    server: { port: 5220, host: "127.0.0.1" },
    logLevel: "error"
  });
  await server.listen();
  const port = server.httpServer.address().port;
  console.log("Vite server running on port:", port);

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--enable-webgl"]
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/scripts/inspect-harness.html`);
  await page.waitForFunction(() => window.__VRM_READY__ === true);

  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const outPath = path.join(OUT_DIR, `${char.id}.png`);
    process.stdout.write(`[${i + 1}/${characters.length}] ${char.id} (${char.name})... `);
    
    try {
      const res = await page.evaluate(async ({ url, id }) => {
        return await window.renderCharacterThumbnail(url, id);
      }, { url: char.url, id: char.id });

      const base64Data = res.dataUrl.replace(/^data:image\/png;base64,/, "");
      const imgBuf = Buffer.from(base64Data, "base64");
      fs.writeFileSync(outPath, imgBuf);

      results.push({
        id: char.id,
        name: char.name,
        url: char.url,
        thumbnailUrl: `/assets/3d/characters/thumbnails/${char.id}.png`,
        success: true,
        byteSize: imgBuf.length,
        vrmVersion: res.vrmVersion,
        height: Number(res.box.height.toFixed(3)),
        width: Number(res.box.width.toFixed(3)),
        hasHead: res.hasHead,
        hasHips: res.hasHips,
        isMascotOrChibi: res.framing.isMascotOrChibi,
        cameraDistance: Number(res.framing.distance.toFixed(3)),
        targetY: Number(res.framing.target[1].toFixed(3))
      });

      console.log(`OK (${imgBuf.length}B, H:${res.box.height.toFixed(2)}m, ${res.framing.isMascotOrChibi ? "mascot" : "humanoid"})`);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      results.push({
        id: char.id,
        name: char.name,
        url: char.url,
        success: false,
        error: err.message
      });
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nFinished batch render in ${elapsed}s!`);
  console.log(`Success: ${results.filter(r => r.success).length}/${characters.length}`);

  fs.writeFileSync("scripts/character-thumbnails-report.json", JSON.stringify(results, null, 2));

  await browser.close();
  await server.close();
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
