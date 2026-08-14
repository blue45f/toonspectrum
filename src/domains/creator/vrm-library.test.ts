import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BUNDLED_VRM_RIGHTS_BLOCKS,
  bundledVrmRightsBlockById,
  createUploadedVrmRecord,
  deleteStoredVrmModel,
  extractEmbeddedVrmThumbnailBytes,
  getDeletableModelIds,
  isBundledVrmRightsBlocked,
  SAMPLE_VRM_ENTRIES,
  SAMPLE_VRM_LIBRARY_ENTRY,
  SAMPLE_VRMS,
  sampleVrmUrl,
  selectableSampleVrmUrl,
  withDefaultVrmEntry,
} from "./vrm-library";

// 2026-06 추가된 번들 15종(헤어 전용 샘플 2종은 캐릭터가 아니라 제외·정리됨) + 2026-07 오픈소스 아바타 레지스트리(100Avatars R1~R3, CC0) 62종
// (그 중 OldMoustache·Eugenia는 "노인" 카테고리 보강분) — 모두 public/vrm/LICENSES.md 고지 대상.
const NEW_BUNDLE_FILES = [
  // 2026-06: madjin/vrm-samples + UniVRM + 100Avatars 1차분
  "Sendagaya_Shino.vrm",
  "Sakurada_Fumiriya.vrm",
  "Darkness_Shibu.vrm",
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
  "OldMoustache.vrm",
  "Eugenia.vrm",
] as const;

const ORIGINAL_BUNDLE_FILES = [
  "TS_Minseo_Campus.vrm",
  "TS_Taeo_Barista.vrm",
  "TS_Jeonghwa_Gardener.vrm",
  "TS_Haram_Explorer.vrm",
  "TS_Yeonhui_RuneGuard.vrm",
  "TS_Nova_ServiceAndroid.vrm",
  "cyber_agent_zero.vrm",
  "TS_Seojin_Architect.vrm",
  "TS_Mira_Detective.vrm",
  "TS_Okseon_HanjiArchivist.vrm",
  "TS_Nuri_RobotClub.vrm",
  "TS_Dami_RescueCaptain.vrm",
  "TS_Moru_MossGolem.vrm",
  "TS_Samira_OrbitalBotanist.vrm",
  "TS_Yunae_DeafPercussionist.vrm",
  "TS_Boram_WeatherScientist.vrm",
  "TS_Hyeon_StudioPotter.vrm",
  "TS_Dorong_SeaOtterCourier.vrm",
] as const;

const WAVE4_SAMPLE_IDS = [
  "ts-samira-orbital-botanist",
  "ts-yunae-deaf-percussionist",
  "ts-boram-weather-scientist",
  "ts-hyeon-studio-potter",
  "ts-dorong-sea-otter-courier",
] as const;

const MIN_BUNDLE_FILE_BYTES = 100 * 1024;

describe("VRM library helpers", () => {
  it("uses polished character names for bundled VRMs", () => {
    const names = SAMPLE_VRM_ENTRIES.map((entry) => entry.name);

    // 대표 엔트리 스팟 체크(기존 + 2026-07 신규).
    expect(names.slice(0, 4)).toEqual(["루미", "하린", "세라", "유나"]);
    expect(names.slice(4, 22)).toEqual([
      "민서 (캠퍼스 메이커)",
      "태오 (동네 바리스타)",
      "정화 (노년 정원사)",
      "하람 (어린 탐험가)",
      "연휘 (룬 수호자)",
      "노바 (서비스 안드로이드)",
      "사이버 에이전트 제로",
      "서진 (배리어프리 건축가)",
      "미라 (느와르 탐정)",
      "옥선 (한지 기록가)",
      "누리 (로봇 동아리원)",
      "다미 (구조대장)",
      "모루 (이끼 골렘)",
      "사미라 (궤도 식물학자)",
      "윤애 (진동 타악 연주자)",
      "보람 (기상과학자)",
      "현 (도예 스튜디오 운영자)",
      "도롱 (해달 우편원)",
    ]);
    expect(names).toContain("데빌 (악마)");
    expect(names).toContain("쿨에일리언 (외계인)");
    expect(names).toContain("스포츠메카 (메카)");
    expect(names).toContain("올드무스타치 (할아버지)");
    expect(names).toContain("유제니아 (할머니)");

    // 이름은 전부 비어있지 않고 유일해야 하며, 기술 용어 흔적이 없어야 한다.
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name.trim().length, `empty name`).toBeGreaterThan(0);
    }
    expect(names.join(" ")).not.toMatch(/샘플|아바타|Avatar|VRoid/i);
  });

  it("registers bundled sample characters with unique ids and local /vrm/ urls", () => {
    expect(SAMPLE_VRMS.length).toBeGreaterThan(0);
    const ids = SAMPLE_VRMS.map((sample) => sample.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const sample of SAMPLE_VRMS) {
      expect(sample.url, `${sample.id} url`).toMatch(/^\/vrm\/[A-Za-z0-9_.-]+\.vrm$/);
      expect(sample.id, `${sample.id} id format`).toMatch(/^[a-z0-9]+([_.-][a-z0-9]+)*$/);
    }

    const urls = SAMPLE_VRMS.map((sample) => sample.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("places all five Wave 4 originals immediately after Moru in the default picker", () => {
    const ids = SAMPLE_VRM_ENTRIES.map((entry) => entry.id);
    const moruIndex = ids.indexOf("ts-moru-moss-golem");

    expect(moruIndex).toBeGreaterThanOrEqual(0);
    expect(ids.slice(moruIndex + 1, moruIndex + 1 + WAVE4_SAMPLE_IDS.length))
      .toEqual(WAVE4_SAMPLE_IDS);
  });

  it("keeps audited limitations bounded while legacy ids remain restorable", () => {
    const samplesById = new Map(SAMPLE_VRMS.map((sample) => [sample.id, sample] as const));

    expect(samplesById.get("cryptovoxel")).toMatchObject({
      visibility: "legacy",
      limitations: ["no-expressions"],
    });
    expect(SAMPLE_VRM_ENTRIES.some((entry) => entry.id === "cryptovoxel")).toBe(false);
    expect(sampleVrmUrl("cryptovoxel")).toBe("/vrm/cryptovoxels.vrm");
    expect(selectableSampleVrmUrl("cryptovoxel")).toBe("/vrm/cryptovoxels.vrm");

    expect(samplesById.get("polybot")?.limitations).toEqual(["limited-hand-rig"]);
    expect(samplesById.get("kiba")?.limitations).toEqual(["limited-hand-rig"]);
    expect(samplesById.get("fumi")?.limitations).toEqual(["heavy-payload"]);
    expect(samplesById.get("kage")?.limitations).toEqual(["heavy-payload"]);
    expect(samplesById.get("pirate-bot")?.limitations).toEqual(["heavy-payload"]);
  });

  it("registers every newly bundled model in the sample list", () => {
    const urls = new Set(SAMPLE_VRMS.map((sample) => sample.url));
    for (const fileName of [...NEW_BUNDLE_FILES, ...ORIGINAL_BUNDLE_FILES]) {
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
    for (const fileName of ORIGINAL_BUNDLE_FILES) {
      expect(licenses, `LICENSES.md missing ${fileName}`).toContain(fileName);
    }
    // 출처 저장소와 Alicia(니코니 솔리드) 라이선스 고지 링크가 명시되어야 한다.
    expect(licenses).toContain("github.com/madjin/vrm-samples");
    expect(licenses).toContain("github.com/vrm-c/UniVRM");
    expect(licenses).toContain("3d.nicovideo.jp/alicia");
    // 2026-07 오픈소스 아바타 레지스트리 출처와 CC0 고지가 명시되어야 한다.
    expect(licenses).toContain("github.com/ToxSam/open-source-avatars");
    expect(licenses).toContain("CC0");
    expect(licenses).toContain("meebit_09842.vrm");
    expect(licenses).toContain("권리 격리");
    expect(licenses).toContain("런타임 로드를 차단");
    expect(licenses).toContain("scripts/blender/generate_toonspectrum_vrm_pack.py");
    expect(licenses).toContain("CC0 1.0");
    expect(licenses).toContain("https://creativecommons.org/publicdomain/zero/1.0/");
    expect(licenses).toContain('Avatar_Orion.vrm');
    expect(licenses).toContain('"author": "Polygonal Mind"');
    expect(licenses).toContain('"licenseName": "CC0"');
    expect(licenses).toMatch(/현재 확인된 유일한 직접\s+CC0 근거/);
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

  // 위 검사의 반대 방향. public/vrm 은 통째로 dist 로 복사돼 배포 산출물의 절반 이상을
  // 차지한다(2026-08 실측: .vrm 88개 443.7MB / dist 735MB). 카탈로그에서 빠졌는데 파일만
  // 남으면 아무도 못 여는 수백 MB가 조용히 배포에 실린다 — 고아 파일을 여기서 막는다.
  // 의도적으로 남기는 파일은 BUNDLED_VRM_RIGHTS_BLOCKS 에 사유와 함께 등록해야 한다.
  it("ships no orphan .vrm file that the catalog cannot reach", () => {
    const vrmDir = join(process.cwd(), "public", "vrm");
    const catalogFileNames = new Set(SAMPLE_VRMS.map((sample) => sample.url.replace("/vrm/", "")));
    const documentedFileNames = new Set(
      BUNDLED_VRM_RIGHTS_BLOCKS.map((block) => block.url.replace("/vrm/", "")),
    );

    const orphans = readdirSync(vrmDir)
      .filter((fileName) => fileName.toLowerCase().endsWith(".vrm"))
      .filter((fileName) => !catalogFileNames.has(fileName) && !documentedFileNames.has(fileName));

    expect(orphans).toEqual([]);
  });

  it("resolves sample urls by id and falls back to the default", () => {
    expect(sampleVrmUrl("cool-alien")).toBe("/vrm/CoolAlien.vrm");
    expect(sampleVrmUrl("devil")).toBe("/vrm/Devil.vrm");
    expect(SAMPLE_VRMS.find((sample) => sample.id === "orion")).toMatchObject({
      id: "orion",
      url: "/vrm/Avatar_Orion.vrm",
    });
    expect(sampleVrmUrl("orion")).toBe("/vrm/Avatar_Orion.vrm");
    expect(sampleVrmUrl("no-such-id")).toBe("/vrm/sample.vrm");
    expect(selectableSampleVrmUrl("ts-nova-service-android"))
      .toBe("/vrm/TS_Nova_ServiceAndroid.vrm");
  });

  it("권리 제한 meebit을 별도 메타데이터로 격리하고 신규 카탈로그·엄격 로드에서 차단한다", () => {
    expect(BUNDLED_VRM_RIGHTS_BLOCKS).toHaveLength(1);
    expect(bundledVrmRightsBlockById("meebit")).toMatchObject({
      id: "meebit",
      url: "/vrm/meebit_09842.vrm",
      status: "rights-blocked",
      reasonCode: "redistribution-commercial-restriction",
    });
    expect(isBundledVrmRightsBlocked("meebit")).toBe(true);
    expect(selectableSampleVrmUrl("meebit")).toBeNull();
    expect(selectableSampleVrmUrl("no-such-id")).toBeNull();
    expect(selectableSampleVrmUrl("devil")).toBe("/vrm/Devil.vrm");
    expect(SAMPLE_VRMS.some((sample) => sample.id === "meebit")).toBe(false);
    expect(SAMPLE_VRM_ENTRIES.some((entry) => entry.id === "meebit")).toBe(false);
    expect(
      existsSync(join(process.cwd(), "public", "vrm", "meebit_09842.vrm")),
    ).toBe(false);
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

  it("allows only non-durable memory models to enter the deletion surface", () => {
    const deletableIds = getDeletableModelIds([
      SAMPLE_VRM_LIBRARY_ENTRY,
      {
        id: "upload-1",
        name: "Action Hero",
        source: "sqlite-opfs",
        thumbnail: null,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "memory-1",
        name: "Current-tab model",
        source: "memory",
        thumbnail: null,
        createdAt: 2,
        updatedAt: 2,
      },
    ]);

    expect(deletableIds).toEqual(["memory-1"]);
  });

  it("fails closed before opening durable storage when user deletion has no owner proof", async () => {
    await expect(deleteStoredVrmModel("upload-1")).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("extracts embedded PNG/JPEG thumbnails or main texture bytes from sample VRM GLB files", () => {
    const filePath = join(process.cwd(), "public/vrm/AvatarSample_A.vrm");
    if (!existsSync(filePath)) return;
    const buffer = readFileSync(filePath);
    const result = extractEmbeddedVrmThumbnailBytes(buffer);

    expect(result).not.toBeNull();
    expect(result?.mimeType).toMatch(/^image\/(png|jpeg|webp)$/);
    expect(result?.bytes.byteLength).toBeGreaterThan(100);
  });
});
