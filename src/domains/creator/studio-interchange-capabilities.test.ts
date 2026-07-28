import { describe, expect, it } from "vitest";

import {
  STUDIO_INTERCHANGE_CAPABILITIES,
  studioDirectlySupportedInterchangeCapabilities,
  studioInterchangeCapabilitiesForExtension,
  studioInterchangeCapability,
} from "./studio-interchange-capabilities";

describe("Studio interchange capability registry", () => {
  it("id와 extension은 정규화되고 id가 중복되지 않는다", () => {
    const ids = STUDIO_INTERCHANGE_CAPABILITIES.map((capability) => capability.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const capability of STUDIO_INTERCHANGE_CAPABILITIES) {
      expect(capability.id).toMatch(/^[a-z0-9-]+$/u);
      expect(capability.extensions.length).toBeGreaterThan(0);
      expect(capability.extensions.every((extension) => extension.startsWith(".") && extension === extension.toLowerCase())).toBe(true);
      expect(capability.mime.length).toBeGreaterThan(0);
    }
  });

  it("available/engine-ready 상태가 양 방향 모두 unsupported인 모순을 만들지 않는다", () => {
    for (const capability of STUDIO_INTERCHANGE_CAPABILITIES) {
      if (capability.status === "available" || capability.status === "engine-ready") {
        expect(capability.import !== "unsupported" || capability.export !== "unsupported").toBe(true);
      }
      if (capability.roundTrip === "lossless") {
        expect(capability.import).toBe("available");
        expect(capability.export).toBe("available");
        expect(capability.lossModel).toEqual([]);
      }
    }
  });

  it("독점 CLIP/SUT/AI를 직접 지원한다고 과장하지 않고 bridge를 제시한다", () => {
    for (const id of ["clip", "sut", "ai"]) {
      const capability = studioInterchangeCapability(id)!;
      expect(capability.proprietary).toBe(true);
      expect(capability.import).toBe("unsupported");
      expect(capability.export).toBe("unsupported");
      expect(capability.status).toBe("bridge-only");
      expect(capability.recommendedBridge?.length).toBeGreaterThan(0);
    }
  });

  it("PSD는 부분 왕복, PDF/SVG/WebM은 출력 전용으로 정직하게 표시한다", () => {
    const psd = studioInterchangeCapability("psd")!;
    expect(psd).toMatchObject({
      import: "partial",
      export: "partial",
      roundTrip: "partial",
    });
    expect(psd.lossModel.join(" ")).toContain("편집 가능한 알파 마스크");
    expect(psd.lossModel.join(" ")).toContain("벡터·이중 마스크");
    expect(psd.lossModel.join(" ")).toContain("페더");
    expect(psd.notes.join(" ")).toContain("무손실 PNG");
    expect(psd.sizeBudget).toMatchObject({
      maxFileBytes: 128 * 1024 * 1024,
      maxDecodedBytes: 128 * 1024 * 1024,
      maxDimensionPx: 30_000,
    });
    expect(psd.notes.join(" ")).toContain("linked-file");
    for (const id of ["pdf", "svg", "webm"]) {
      expect(studioInterchangeCapability(id)).toMatchObject({ import: "unsupported", export: "available", roundTrip: "none" });
    }
  });

  it("ORA와 CBZ import는 실제 UI 계약과 fail-closed ZIP 경계를 공개한다", () => {
    const ora = studioInterchangeCapability("ora")!;
    expect(ora).toMatchObject({
      import: "available",
      export: "available",
      roundTrip: "partial",
      status: "partial",
    });
    expect(ora.lossModel.join(" ")).toContain("단일 그룹");
    expect(ora.notes.join(" ")).toContain("좌표");
    expect(ora.notes.join(" ")).toContain("opacity/visibility");
    expect(ora.runtimeRequirement.join(" ")).toContain("PNG IHDR");

    const cbz = studioInterchangeCapability("cbz")!;
    expect(cbz).toMatchObject({
      import: "available",
      export: "available",
      roundTrip: "none",
      status: "partial",
    });
    expect(cbz.notes.join(" ")).toContain("PNG/JPEG/WebP/GIF");
    expect(cbz.notes.join(" ")).toContain("natural order");
    expect(cbz.notes.join(" ")).toContain("ComicInfo.xml");
    expect(cbz.sizeBudget.maxItems).toBe(200);

    for (const capability of [ora, cbz]) {
      const contract = [...capability.runtimeRequirement, ...capability.notes].join(" ");
      expect(contract).toContain("STORE/DEFLATE");
      expect(contract).toContain("ZIP64");
      expect(contract).toContain("암호화");
      expect(contract).toContain("data descriptor");
      expect(contract).toContain("legacy non-UTF-8");
      expect(contract).toContain("공통 손실 미리보기");
      expect(capability.sizeBudget.notes).toContain("모바일 64MiB/데스크톱 128MiB");
    }
  });

  it("공개 래스터 codec과 1,280px 표시 프록시 손실을 실제 UI 상태로 기록한다", () => {
    for (const id of ["bmp", "tga", "netpbm", "qoi", "tiff"]) {
      const capability = studioInterchangeCapability(id);
      expect(capability).toMatchObject({
        import: "available",
        export: "available",
        roundTrip: "rendered",
        status: "partial",
      });
      expect(capability?.lossModel.join(" ")).toContain("1,280px");
      expect(capability?.runtimeRequirement).toContain("Web Worker");
      expect(capability?.sizeBudget.maxFileBytes).toBe(64 * 1024 * 1024);
      expect(capability?.sizeBudget.maxDecodedBytes).toBe(64 * 1024 * 1024);
    }
    expect(studioInterchangeCapabilitiesForExtension(".dib").map((item) => item.id)).toContain("bmp");
    expect(studioInterchangeCapabilitiesForExtension(".pam").map((item) => item.id)).toContain("netpbm");
  });

  it("3D source formats are import-only normalization, not fake round-trip", () => {
    for (const id of ["glb", "gltf", "obj", "fbx", "dae", "stl", "ply", "3ds"]) {
      const capability = studioInterchangeCapability(`3d-${id}`)!;
      expect(capability.import).toBe("available");
      expect(capability.export).toBe("unsupported");
      expect(capability.roundTrip).toBe("none");
      expect(capability.notes.join(" ")).toContain("GLB");
    }
  });

  it("all seven palette codecs are connected to the visible import/export UI", () => {
    for (const id of ["gpl", "ase", "aco", "act", "jasc-pal", "css-palette", "json-palette"]) {
      expect(studioInterchangeCapability(id)).toMatchObject({ import: "available", export: "available", status: "available" });
    }
    expect(studioInterchangeCapability("act")?.sizeBudget.maxItems).toBe(256);
    expect(studioInterchangeCapability("jasc-pal")?.extensions).toEqual([".pal"]);
  });

  it("이미 연결된 대사·연재 운영 포맷을 실제 손실 수준으로 기록한다", () => {
    expect(studioInterchangeCapability("dialogue-json")).toMatchObject({
      import: "available",
      export: "available",
      roundTrip: "lossless",
    });
    for (const id of ["dialogue-table", "dialogue-script-text", "subtitles"]) {
      expect(studioInterchangeCapability(id)).toMatchObject({
        import: "available",
        export: "available",
        roundTrip: "partial",
      });
    }
    expect(studioInterchangeCapability("dialogue-fdx")).toMatchObject({
      import: "available",
      export: "available",
      roundTrip: "partial",
      status: "available",
      sizeBudget: { maxFileBytes: 8 * 1024 * 1024, maxItems: 20_000 },
    });
    expect(studioInterchangeCapabilitiesForExtension(".fdx").map((item) => item.id)).toEqual([
      "dialogue-fdx",
    ]);
    expect(studioInterchangeCapability("release-calendar")).toMatchObject({ import: "unsupported", export: "available" });
    expect(studioInterchangeCapability("publication-analytics-csv")).toMatchObject({ import: "available", export: "unsupported" });
  });

  it("extension lookup accepts dotted/undotted and returns overlapping uses", () => {
    expect(studioInterchangeCapabilitiesForExtension("psd").map((item) => item.id)).toEqual(["psd"]);
    expect(studioInterchangeCapabilitiesForExtension(".png").map((item) => item.id)).toEqual(expect.arrayContaining(["png", "brush-tip-png"]));
    expect(studioInterchangeCapabilitiesForExtension("unknown")).toEqual([]);
  });

  it("direct support filter excludes bridge-only rows and includes the GIF/APNG export row", () => {
    const ids = studioDirectlySupportedInterchangeCapabilities().map((capability) => capability.id);
    expect(ids).toContain("toonproject-archive");
    expect(ids).toContain("ase");
    expect(ids).not.toContain("clip");
    expect(ids).toContain("gif-apng-mp4-export");
  });

  it("GIF/APNG는 내보내기 전용으로, 가져오기와 MP4는 미지원으로 정직하게 표시한다", () => {
    const capability = studioInterchangeCapability("gif-apng-mp4-export")!;
    expect(capability).toMatchObject({
      import: "unsupported",
      export: "partial",
      roundTrip: "none",
      status: "partial",
    });
    expect(capability.lossModel.join(" ")).toContain("256색");
    expect(capability.lossModel.join(" ")).toContain("1비트 투명");
    expect(capability.lossModel.join(" ")).toContain("MP4 내보내기는 구현 전");
    expect(capability.runtimeRequirement.join(" ")).toContain("GIF89a");
    expect(capability.runtimeRequirement.join(" ")).toContain("NETSCAPE2.0");
    expect(capability.runtimeRequirement.join(" ")).toContain("acTL/fcTL/fdAT");
    expect(capability.runtimeRequirement.join(" ")).toContain("CRC32");
    expect(capability.notes.join(" ")).toContain("무한 반복");
    expect(capability.notes.join(" ")).toContain("MP4 지원으로 오표시하지 않습니다");
    expect(capability.sizeBudget.maxItems).toBe(60);
  });

  it("known hard limits match the audited runtime boundaries", () => {
    expect(studioInterchangeCapability("toonproject-archive")?.sizeBudget.maxFileBytes).toBe(280_000_000);
    expect(studioInterchangeCapability("abr")?.sizeBudget.maxFileBytes).toBe(32 * 1024 * 1024);
    expect(studioInterchangeCapability("3d-glb")?.sizeBudget.maxFileBytes).toBe(100 * 1024 * 1024);
    expect(studioInterchangeCapability("vrm")?.sizeBudget.maxFileBytes).toBe(128 * 1024 * 1024);
    expect(studioInterchangeCapability("ora")?.sizeBudget).toMatchObject({
      maxFileBytes: 520_000_000,
      maxDecodedBytes: 128 * 1024 * 1024,
      maxDimensionPx: 32_768,
      maxFiles: 516,
      maxItems: 500,
    });
    expect(studioInterchangeCapability("ora")?.sizeBudget.notes).toContain("16,777,216픽셀");
    expect(studioInterchangeCapability("cbz")?.sizeBudget).toMatchObject({
      maxFileBytes: 520_000_000,
      maxDecodedBytes: 512 * 1024 * 1024,
      maxDimensionPx: 131_072,
      maxFiles: 1_163,
      maxItems: 200,
    });
  });
});
