import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createUploadedVrmRecord, getDeletableModelIds, SAMPLE_VRM_ENTRIES, SAMPLE_VRM_LIBRARY_ENTRY, SAMPLE_VRMS, sampleVrmUrl, withDefaultVrmEntry } from "./vrm-library";

// 2026-06 추가된 번들 17종 + 2026-07 오픈소스 아바타 레지스트리(100Avatars R1~R3, CC0) 60종
// — 모두 public/vrm/LICENSES.md 고지 대상.
const NEW_BUNDLE_FILES = [
  // 2026-06: madjin/vrm-samples + UniVRM + 100Avatars 1차분
  "Sendagaya_Shino.vrm",
  "Sakurada_Fumiriya.vrm",
  "Darkness_Shibu.vrm",
  "HairSample_Female.vrm",
  "HairSample_Male.vrm",
  "fem_vroid.vrm",
  "masc_vroid.vrm",
  "AliciaSolid.vrm",
  "Devil.vrm",
  "Polydancer.vrm",
  "Rose.vrm",
  "Robert.vrm",
  "Bloody.vrm",
  "Rabbit.vrm",
  "Eggplant.vrm",
  "CoolBanana.vrm",
  "Skull.vrm",
  // 2026-07: github.com/ToxSam/open-source-avatars 레지스트리 (100Avatars R1~R3, CC0)
  "CoolAlien.vrm",
  "Jimmy.vrm",
  "Froggy.vrm",
  "Teddy.vrm",
  "Nightmare.vrm",
  "Pumpkin.vrm",
  "Wizzir.vrm",
  "Clown.vrm",
  "Wolfman.vrm",
  "Mummy.vrm",
  "Kate.vrm",
  "Witch.vrm",
  "Dracula.vrm",
  "Zombie.vrm",
  "DinoKid.vrm",
  "Astronaut.vrm",
  "Polybot.vrm",
  "Jennifer.vrm",
  "Erika.vrm",
  "Olivia.vrm",
  "Avocado.vrm",
  "IceCream.vrm",
  "PyreSorcerer.vrm",
  "UnicornPerson.vrm",
  "LaloBot.vrm",
  "SharkPerson.vrm",
  "ChillPenguin.vrm",
  "CoolTurtle.vrm",
  "MoonGirl.vrm",
  "EyeWizard.vrm",
  "CoolPizza.vrm",
  "CoolRamen.vrm",
  "CoolTaco.vrm",
  "CoolPirate.vrm",
  "CosmicDweller.vrm",
  "ChillPalm.vrm",
  "GoodKnight.vrm",
  "BadBot.vrm",
  "PirateBot.vrm",
  "Cyberpal.vrm",
  "BaoSamurai.vrm",
  "Kiba.vrm",
  "StitchWitch.vrm",
  "MegaAngel.vrm",
  "MushroomFairy.vrm",
  "WeirdCat.vrm",
  "CuteSaurus.vrm",
  "Crowley.vrm",
  "LadyKoi.vrm",
  "YetiDude.vrm",
  "Anna.vrm",
  "MeganTheFox.vrm",
  "CoolTiger.vrm",
  "LilRam.vrm",
  "LadyFawn.vrm",
  "StrawberryPrincess.vrm",
  "BluePixie.vrm",
  "BotBunny.vrm",
  "SportMecha.vrm",
  "CosmicBot.vrm",
] as const;

const MIN_BUNDLE_FILE_BYTES = 100 * 1024;

describe("VRM library helpers", () => {
  it("uses polished character names for bundled VRMs", () => {
    const names = SAMPLE_VRM_ENTRIES.map((entry) => entry.name);

    // 대표 엔트리 스팟 체크(기존 + 2026-07 신규).
    expect(names.slice(0, 4)).toEqual(["루미", "하린", "세라", "유나"]);
    expect(names).toContain("데빌 (악마)");
    expect(names).toContain("쿨에일리언 (외계인)");
    expect(names).toContain("스포츠메카 (메카)");

    // 이름은 전부 비어있지 않고 유일해야 하며, 기술 용어 흔적이 없어야 한다.
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name.trim().length, `empty name`).toBeGreaterThan(0);
    }
    expect(names.join(" ")).not.toMatch(/샘플|아바타|Avatar|VRoid/i);
  });

  it("bundles 89 sample characters with unique ids and local /vrm/ urls", () => {
    expect(SAMPLE_VRMS).toHaveLength(89);

    const ids = SAMPLE_VRMS.map((sample) => sample.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const sample of SAMPLE_VRMS) {
      expect(sample.url, `${sample.id} url`).toMatch(/^\/vrm\/[A-Za-z0-9_.-]+\.vrm$/);
      expect(sample.id, `${sample.id} id format`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }

    const urls = SAMPLE_VRMS.map((sample) => sample.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("registers every newly bundled model in the sample list", () => {
    const urls = new Set(SAMPLE_VRMS.map((sample) => sample.url));
    for (const fileName of NEW_BUNDLE_FILES) {
      expect(urls.has(`/vrm/${fileName}`), `missing sample entry for ${fileName}`).toBe(true);
    }
  });

  it("documents all newly bundled models in public/vrm/LICENSES.md", () => {
    const licensesPath = join(process.cwd(), "public", "vrm", "LICENSES.md");
    expect(existsSync(licensesPath)).toBe(true);

    const licenses = readFileSync(licensesPath, "utf8");
    for (const fileName of NEW_BUNDLE_FILES) {
      expect(licenses, `LICENSES.md missing ${fileName}`).toContain(fileName);
    }
    // 출처 저장소와 Alicia(니코니 솔리드) 라이선스 고지 링크가 명시되어야 한다.
    expect(licenses).toContain("github.com/madjin/vrm-samples");
    expect(licenses).toContain("github.com/vrm-c/UniVRM");
    expect(licenses).toContain("3d.nicovideo.jp/alicia");
    // 2026-07 오픈소스 아바타 레지스트리 출처와 CC0 고지가 명시되어야 한다.
    expect(licenses).toContain("github.com/ToxSam/open-source-avatars");
    expect(licenses).toContain("CC0");
  });

  // 회귀 방지: 파일 없는 "유령 엔트리"(선택 시 404)가 다시 생기지 않도록
  // 모든 SAMPLE_VRMS url이 public/vrm/ 실파일(>100KB)로 뒷받침되는지 검사한다.
  it("backs every bundled character with a real local VRM asset larger than 100KB", () => {
    const problems = SAMPLE_VRMS.flatMap((sample) => {
      const filePath = join(process.cwd(), "public", sample.url.replace(/^\//, ""));
      if (!existsSync(filePath)) return [`${sample.id}: missing file for ${sample.url}`];
      const { size } = statSync(filePath);
      if (size <= MIN_BUNDLE_FILE_BYTES) return [`${sample.id}: file too small (${size}B) for ${sample.url}`];
      return [];
    });

    expect(problems).toEqual([]);
  });

  it("resolves sample urls by id and falls back to the default", () => {
    expect(sampleVrmUrl("cool-alien")).toBe("/vrm/CoolAlien.vrm");
    expect(sampleVrmUrl("devil")).toBe("/vrm/Devil.vrm");
    expect(sampleVrmUrl("no-such-id")).toBe("/vrm/sample.vrm");
  });

  it("keeps every bundled sample before uploaded library entries", () => {
    const entries = withDefaultVrmEntry([
      {
        id: "upload-1",
        name: "Romance Lead",
        blob: new Blob(["vrm"], { type: "model/gltf-binary" }),
        createdAt: 2,
        updatedAt: 2,
        thumbnail: null,
      },
    ]);

    expect(entries.slice(0, SAMPLE_VRM_ENTRIES.length)).toEqual(SAMPLE_VRM_ENTRIES);
    expect(entries.map((entry) => entry.id)).toEqual([...SAMPLE_VRM_ENTRIES.map((entry) => entry.id), "upload-1"]);
  });

  it("normalizes uploaded model names and creates blob-backed records", () => {
    const file = new File(["vrm"], "Fantasy Knight.vrm", { type: "application/octet-stream" });
    const record = createUploadedVrmRecord(file, "fixed-id", 42);

    expect(record).toMatchObject({
      id: "fixed-id",
      name: "Fantasy Knight",
      createdAt: 42,
      updatedAt: 42,
      thumbnail: null,
    });
    expect(record.blob).toBe(file);
  });

  it("only allows uploaded models to be deleted", () => {
    const deletableIds = getDeletableModelIds([
      SAMPLE_VRM_LIBRARY_ENTRY,
      {
        id: "upload-1",
        name: "Action Hero",
        source: "indexed-db",
        thumbnail: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    expect(deletableIds).toEqual(["upload-1"]);
  });
});
