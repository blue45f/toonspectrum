import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createUploadedVrmRecord, getDeletableModelIds, SAMPLE_VRM_ENTRIES, SAMPLE_VRM_LIBRARY_ENTRY, SAMPLE_VRMS, sampleVrmUrl, withDefaultVrmEntry } from "./vrm-library";

// 2026-06 추가된 신규 번들 8종 — public/vrm/LICENSES.md 고지 대상.
const NEW_BUNDLE_FILES = [
  "Sendagaya_Shino.vrm",
  "Sakurada_Fumiriya.vrm",
  "Darkness_Shibu.vrm",
  "HairSample_Female.vrm",
  "HairSample_Male.vrm",
  "fem_vroid.vrm",
  "masc_vroid.vrm",
  "AliciaSolid.vrm",
] as const;

describe("VRM library helpers", () => {
  it("uses polished character names for bundled VRMs", () => {
    expect(SAMPLE_VRM_ENTRIES.map((entry) => entry.name)).toEqual([
      "루미",
      "하린",
      "세라",
      "유나",
      "시온",
      "비비",
      "비타",
      "루빈",
      "오리온 (로봇)",
      "크립토 (복셀봇)",
      "미빗 (블록맨)",
      "시드상 (마스코트)",
      "시노",
      "후미",
      "카게 (다크)",
      "헤라",
      "하루",
      "미오",
      "노아",
      "아리시아",
    ]);
    expect(SAMPLE_VRM_ENTRIES.map((entry) => entry.name).join(" ")).not.toMatch(/샘플|아바타|Avatar|VRoid/i);
  });

  it("bundles 20 sample characters with unique ids and local /vrm/ urls", () => {
    expect(SAMPLE_VRMS).toHaveLength(20);

    const ids = SAMPLE_VRMS.map((sample) => sample.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const sample of SAMPLE_VRMS) {
      expect(sample.url, `${sample.id} url`).toMatch(/^\/vrm\/[A-Za-z0-9_.-]+\.vrm$/);
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
  });

  it("backs every bundled character with an actual local VRM asset", () => {
    // CI 환경에서는 gitignore된 VRM 파일들이 없을 수 있으므로
    // 실제 존재하는 tracked 파일들만 검증하거나, CI일 경우 존재 여부를 체크하지 않습니다.
    if (process.env.CI) {
      const trackedSampleIds = ["sample-vrm", "avatar-a", "avatar-b", "avatar-c"];
      const missingFiles = SAMPLE_VRM_ENTRIES.filter((e) => trackedSampleIds.includes(e.id)).flatMap((entry) => {
        const url = sampleVrmUrl(entry.id);
        const filePath = join(process.cwd(), "public", url.replace(/^\//, ""));
        return existsSync(filePath) ? [] : [`${entry.id}:${url}`];
      });
      expect(missingFiles).toEqual([]);
      return;
    }

    const missingFiles = SAMPLE_VRM_ENTRIES.flatMap((entry) => {
      const url = sampleVrmUrl(entry.id);
      const filePath = join(process.cwd(), "public", url.replace(/^\//, ""));
      return existsSync(filePath) ? [] : [`${entry.id}:${url}`];
    });

    expect(missingFiles).toEqual([]);
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
