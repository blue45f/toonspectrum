import { describe, expect, it } from "vitest";

import { FIXTURE_GLB_SHA256, characterPackageIndexFixture, characterPackageManifestFixture } from "../../testing/manifest-fixtures";

import { DEFAULT_PACKAGE_INDEX_URL, createFetchPackagePort, loadAuthoredPackageFlow, loadPackageIndexFlow } from "./package-load-flow";

import type { FetchBytesResult, FetchJsonResult, PackageFetchPort } from "./package-load-flow";

function portOf(json: Record<string, unknown>, bytes: Record<string, Uint8Array>): PackageFetchPort {
  return {
    fetchJson: async (url): Promise<FetchJsonResult> => (url in json ? { ok: true, json: json[url] } : { ok: false, status: 404, message: "404 Not Found" }),
    fetchBytes: async (url): Promise<FetchBytesResult> => {
      const found = bytes[url];
      return found ? { ok: true, bytes: found } : { ok: false, status: 404, message: "404 Not Found" };
    },
  };
}

const sha256Of = (value: string) => async () => value;

describe("authored/package-load-flow", () => {
  it("index 404는 '등록된 제작 패키지 없음', 빈 목록·형식 오류도 각각 사유를 낸다", async () => {
    const missing = await loadPackageIndexFlow(portOf({}, {}), undefined, 1);
    expect(missing.ok === false && missing.failure.code).toBe("package-index-missing");
    expect(missing.ok === false && missing.failure.reasonKo).toMatch(/등록된 제작 패키지가 없습니다/u);
    const empty = await loadPackageIndexFlow(portOf({ [DEFAULT_PACKAGE_INDEX_URL]: { packages: [] } }, {}), undefined, 1);
    expect(empty.ok === false && empty.failure.code).toBe("package-index-empty");
    const invalid = await loadPackageIndexFlow(portOf({ [DEFAULT_PACKAGE_INDEX_URL]: { nope: 1 } }, {}), undefined, 1);
    expect(invalid.ok === false && invalid.failure.code).toBe("package-index-invalid");
    const network: PackageFetchPort = { fetchJson: async () => ({ ok: false, status: null, message: "offline" }), fetchBytes: async () => ({ ok: false, status: null, message: "offline" }) };
    const offline = await loadPackageIndexFlow(network, undefined, 1);
    expect(offline.ok === false && offline.failure.code).toBe("package-index-fetch-failed");
    expect(offline.ok === false && offline.failure.detail).toBe("offline");
  });

  it("계약 형식 패키지를 끝까지 로드한다(manifest → GLB → SHA → 플랜)", async () => {
    const manifest = characterPackageManifestFixture({ glbBytes: 3 });
    const port = portOf(
      { [DEFAULT_PACKAGE_INDEX_URL]: characterPackageIndexFixture(["mina"]), "/assets/characters/mina/character-package.json": manifest },
      { "/assets/characters/mina/mina.glb": new Uint8Array([1, 2, 3]) },
    );
    const index = await loadPackageIndexFlow(port, undefined, 1);
    expect(index.ok).toBe(true);
    if (!index.ok) return;
    const entry = index.entries[0];
    if (!entry) throw new Error("entry");
    const loaded = await loadAuthoredPackageFlow(port, entry, { sha256: sha256Of(FIXTURE_GLB_SHA256), now: 1 });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.plan.glbUrl).toBe("/assets/characters/mina/mina.glb");
    expect(loaded.plan.licenseNote).toMatch(/자체 제작/u);
    expect(loaded.detail.observedSha256).toBe(FIXTURE_GLB_SHA256);
    expect(loaded.detail.conversion).toBeNull();
    expect(loaded.detail.warnings).toEqual([]);
    expect(loaded.detail.glbBytes.byteLength).toBe(3);
  });

  it("SHA 불일치·품질 미통과·GLB 404·manifest 404·SHA 계산 실패는 각각 LabFailure", async () => {
    const manifest = characterPackageManifestFixture({ glbBytes: 3 });
    const port = portOf(
      { [DEFAULT_PACKAGE_INDEX_URL]: characterPackageIndexFixture(["mina"]), "/assets/characters/mina/character-package.json": manifest },
      { "/assets/characters/mina/mina.glb": new Uint8Array([1, 2, 3]) },
    );
    const index = await loadPackageIndexFlow(port, undefined, 1);
    const entry = index.ok ? index.entries[0] : undefined;
    if (!entry) throw new Error("entry");
    const sha = await loadAuthoredPackageFlow(port, entry, { sha256: sha256Of("f".repeat(64)), now: 1 });
    expect(sha.ok === false && sha.failure.code).toBe("package-sha-mismatch");
    const shaError = await loadAuthoredPackageFlow(port, entry, { sha256: async () => Promise.reject(new Error("no subtle")), now: 1 });
    expect(shaError.ok === false && shaError.failure.code).toBe("package-sha-unavailable");
    const failedQuality = portOf({ "/assets/characters/mina/character-package.json": characterPackageManifestFixture({ qualityPassed: false, glbBytes: 3 }) }, { "/assets/characters/mina/mina.glb": new Uint8Array([1, 2, 3]) });
    const quality = await loadAuthoredPackageFlow(failedQuality, entry, { sha256: sha256Of(FIXTURE_GLB_SHA256), now: 1 });
    expect(quality.ok === false && quality.failure.code).toBe("package-quality-failed");
    const noGlb = await loadAuthoredPackageFlow(portOf({ "/assets/characters/mina/character-package.json": manifest }, {}), entry, { sha256: sha256Of(FIXTURE_GLB_SHA256), now: 1 });
    expect(noGlb.ok === false && noGlb.failure.code).toBe("package-glb-fetch-failed");
    const noManifest = await loadAuthoredPackageFlow(portOf({}, {}), entry, { sha256: sha256Of(FIXTURE_GLB_SHA256), now: 1 });
    expect(noManifest.ok === false && noManifest.failure.code).toBe("package-manifest-fetch-failed");
  });

  it("실제 형식 manifest의 slot-mapping.json이 404면 경고만 남기고 규칙 판정으로 진행한다", async () => {
    const authored = {
      schema: "toonstudio.character-lab.authored-character/1",
      id: "orionette",
      displayName: "오리오넷",
      files: { glb: { path: "o.glb", bytes: 2, sha256: FIXTURE_GLB_SHA256 }, slotMapping: { path: "slot-mapping.json" } },
      quality: { score: 100, passed: true, minimumScore: 90 },
      shapeKeys: [{ name: "faceEyeSizeBig", mesh: "Body", kind: "semantic-identity", contractMorphName: "param:eyeSize:+" }],
      partMeshes: [{ node: "TS_AuthoredHair_soft-bob_LOD0", part: "hair", lod: 0, triangles: 10 }],
    };
    const index = { schema: "toonstudio.character-lab.authored-character-index/1", baseUrl: "/assets/characters/", characters: [{ id: "orionette", displayName: "오리오넷", files: { manifest: { path: "orionette/manifest.json" } } }] };
    const port = portOf({ [DEFAULT_PACKAGE_INDEX_URL]: index, "/assets/characters/orionette/manifest.json": authored }, { "/assets/characters/orionette/o.glb": new Uint8Array([1, 2]) });
    const parsedIndex = await loadPackageIndexFlow(port, undefined, 1);
    const entry = parsedIndex.ok ? parsedIndex.entries[0] : undefined;
    if (!entry) throw new Error("entry");
    expect(entry.manifestFormat).toBe("authored-character");
    const loaded = await loadAuthoredPackageFlow(port, entry, { sha256: sha256Of(FIXTURE_GLB_SHA256), now: 1 });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.detail.warnings[0]).toMatch(/slot-mapping\.json을 불러오지 못해\(404\)/u);
    expect(loaded.detail.judgement.basis.hair).toBe("rule");
    expect(loaded.plan.capabilities.eyes.status).toBe("partial");
    expect(loaded.plan.licenseNote).toMatch(/라이선스 미기재/u);
  });

  it("전역 fetch 포트는 상태 코드와 예외를 구분한다", async () => {
    const fetchImpl = (async (url: string) => {
      if (url.endsWith("index.json")) return new Response(JSON.stringify({ packages: [] }), { status: 200 });
      if (url.endsWith(".glb")) return new Response(new Uint8Array([1]), { status: 200 });
      return new Response(null, { status: 500, statusText: "Boom" });
    }) as unknown as typeof fetch;
    const port = createFetchPackagePort(fetchImpl);
    expect((await port.fetchJson("/x/index.json")).ok).toBe(true);
    const failed = await port.fetchJson("/x/other.json");
    expect(failed.ok === false && failed.status).toBe(500);
    const bytes = await port.fetchBytes("/x/a.glb");
    expect(bytes.ok && bytes.bytes.byteLength).toBe(1);
    const thrower = createFetchPackagePort((async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch);
    const offline = await thrower.fetchBytes("/x");
    expect(offline.ok === false && offline.message).toBe("offline");
  });
});
