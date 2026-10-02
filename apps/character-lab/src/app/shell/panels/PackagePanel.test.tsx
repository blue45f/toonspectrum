// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, failVisible } from "../../../contracts";
import { loadAuthoredPackageFlow, loadPackageIndexFlow } from "../../../domains/authored/package-load-flow";
import { createMockEngine } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession, createMockLabStore } from "../../../testing/mock-store";
import { createPackagePlanRegistry } from "../package-plan-registry";

import { PackagePanel } from "./PackagePanel";

import type { PackagePanelLoader } from "./PackagePanel";
import type { PackageFetchPort } from "../../../domains/authored/package-load-flow";

/**
 * jsdom 환경(web transform)에서는 `import.meta.url`이 `http://localhost/<vite root 상대 경로>`라 fileURLToPath를 쓸 수 없다.
 * file: 스킴이면 그대로 쓰고, 아니면 cwd(루트 설정 = 저장소 루트, 앱 로컬 설정 = apps/character-lab) 기준 후보 중 존재하는 디렉터리를 고른다.
 */
function resolveAssetRoot(): string {
  const metaUrl = new URL(import.meta.url);
  if (metaUrl.protocol === "file:") return fileURLToPath(new URL("../../../../public/assets/characters/", metaUrl));
  const candidates = [path.resolve(process.cwd(), "public/assets/characters"), path.resolve(process.cwd(), "apps/character-lab/public/assets/characters")];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`제작 패키지 디렉터리(public/assets/characters)를 찾지 못했습니다(cwd ${process.cwd()}).`);
  return `${found}${path.sep}`;
}

const ASSET_ROOT = resolveAssetRoot();
const URL_PREFIX = "/assets/characters/";
const ORION_SHA = "7a2bfd8d2a8a3f54395162ba44f4249259d9c8bdd826a619bc0090c040cd06ed";

function fsPort(): PackageFetchPort {
  const resolve = (url: string): string => `${ASSET_ROOT}${url.slice(URL_PREFIX.length)}`;
  return {
    async fetchJson(url) {
      try {
        return { ok: true, json: JSON.parse(await readFile(resolve(url), "utf8")) as unknown };
      } catch (error) {
        return { ok: false, status: 404, message: String(error) };
      }
    },
    async fetchBytes(url) {
      try {
        return { ok: true, bytes: new Uint8Array(await readFile(resolve(url))) };
      } catch (error) {
        return { ok: false, status: 404, message: String(error) };
      }
    },
  };
}

const nodeSha256 = async (bytes: Uint8Array): Promise<string> => createHash("sha256").update(bytes).digest("hex");

function fsLoader(sha256 = nodeSha256): PackagePanelLoader {
  const port = fsPort();
  return {
    loadIndex: () => loadPackageIndexFlow(port, undefined, 1),
    loadPackage: (entry, options) => loadAuthoredPackageFlow(port, entry, { sha256, preferredLod: options.preferredLod, now: 1 }),
  };
}

afterEach(cleanup);

describe("PackagePanel", () => {
  it("실제 index.json을 읽어 2개 패키지를 나열하고 Orion을 끝까지 불러와 source/set을 dispatch한다", async () => {
    const store = createMockLabStore();
    const packagePlans = createPackagePlanRegistry();
    render(
      <MockLabProvider store={store} shell={{ packagePlans }}>
        <PackagePanel loader={fsLoader()} now={() => 1} />
      </MockLabProvider>,
    );
    expect(screen.getByRole("status").textContent).toMatch(/절차적 휴머노이드/u);
    await screen.findByText("Avatar Orion · Authored Toon");
    expect(screen.getByText("ToonStudio Reference Character")).toBeTruthy();
    expect(screen.getByText("주 캐릭터")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Avatar Orion · Authored Toon 불러오기" }));
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy(), { timeout: 15000 });

    const sourceSet = store.dispatched.find((command) => command.type === "source/set");
    expect(sourceSet).toBeDefined();
    if (sourceSet?.type === "source/set" && sourceSet.source.kind === "package") {
      expect(sourceSet.source.characterId).toBe("avatar-orion-authored");
      expect(sourceSet.source.sha256).toBe(ORION_SHA);
      expect(sourceSet.capabilities.ears.status).toBe("partial");
      expect(sourceSet.capabilities.pose.status).toBe("available");
    } else {
      throw new Error("source/set(package) 없음");
    }
    expect(packagePlans.get("avatar-orion-authored")?.glbSha256).toBe(ORION_SHA);
    expect(store.events.filter((event) => event.type === "failure")).toEqual([]);

    const statuses = screen.getAllByRole("status").map((node) => node.textContent ?? "");
    expect(statuses.some((text) => text.includes("플랜을 등록했습니다") && text.includes(ORION_SHA.slice(0, 12)))).toBe(true);
    const earsRow = document.querySelector('tr[data-slot="ears"]');
    expect(earsRow?.textContent).toMatch(/부분 지원/u);
    expect(earsRow?.textContent).toMatch(/선언 \(규칙 판정: 지원\)/u);
    const poseRow = document.querySelector('tr[data-slot="pose"]');
    expect(poseRow?.textContent).toMatch(/지원/u);
    expect(screen.getByText(/불일치 2개/u)).toBeTruthy();
    expect(screen.getByText(/GLB에 VRM 확장 없음/u)).toBeTruthy();
    expect(screen.getByText(/필수 15\/15 · 손가락 30\/30/u)).toBeTruthy();
    expect(screen.getByText(/패키지 격차 \d+개/u)).toBeTruthy();
  }, 30000);

  it("엔진이 있으면 reloadSource로 올리고 '절차 소스로 돌아가기'는 procedural source/set을 보낸다", async () => {
    const store = createMockLabStore({ recipe: { ...createMockLabStore().getState().recipe, source: { kind: "package", characterId: "avatar-orion-authored", sha256: ORION_SHA } } });
    const engineSession = createMockEngineSession({ phase: "ready", backend: "webgpu", diagnostics: createMockEngine().diagnostics });
    const engine = createMockEngine();
    engineSession.setEngine(engine);
    render(
      <MockLabProvider store={store} engineSession={engineSession}>
        <PackagePanel loader={fsLoader()} now={() => 1} />
      </MockLabProvider>,
    );
    expect(screen.getByText(/현재 소스: 제작 패키지 avatar-orion-authored/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "절차 소스로 돌아가기" }));
    expect(store.dispatched[0]).toEqual({ type: "source/set", source: { kind: "procedural" }, capabilities: ALL_AVAILABLE_CAPABILITIES });

    await screen.findByText("ToonStudio Reference Character");
    fireEvent.click(screen.getByRole("button", { name: "ToonStudio Reference Character 불러오기" }));
    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy(), { timeout: 15000 });
    expect(engine.calls.some((call) => call.method === "loadSource")).toBe(true);
    expect(screen.getAllByRole("status").some((node) => (node.textContent ?? "").includes("엔진에 올렸습니다"))).toBe(true);
    const sourceSet = store.dispatched.find((command) => command.type === "source/set" && command.source.kind === "package");
    expect(sourceSet?.type === "source/set" && sourceSet.source.kind === "package" && sourceSet.source.characterId).toBe("reference-character");
  }, 30000);

  it("index 404·SHA 불일치는 사유를 그대로 보여 주고 source/set을 보내지 않는다", async () => {
    const store = createMockLabStore();
    const failing: PackagePanelLoader = {
      loadIndex: async () => ({ ok: false, failure: failVisible("package-index-missing", "등록된 제작 패키지가 없습니다(index.json 없음).", undefined, 1) }),
      loadPackage: async () => Promise.reject(new Error("unused")),
    };
    const { unmount } = render(
      <MockLabProvider store={store}>
        <PackagePanel loader={failing} />
      </MockLabProvider>,
    );
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toMatch(/등록된 제작 패키지가 없습니다/u);
    expect(store.events.some((event) => event.type === "failure" && event.failure.code === "package-index-missing")).toBe(true);
    unmount();

    const store2 = createMockLabStore();
    render(
      <MockLabProvider store={store2}>
        <PackagePanel loader={fsLoader(async () => "f".repeat(64))} />
      </MockLabProvider>,
    );
    await screen.findByText("Avatar Orion · Authored Toon");
    fireEvent.click(screen.getByRole("button", { name: "Avatar Orion · Authored Toon 불러오기" }));
    await screen.findByRole("alert", undefined, { timeout: 15000 });
    expect(screen.getByRole("alert").textContent).toMatch(/GLB SHA-256이 manifest와 다릅니다/u);
    expect(store2.dispatched.filter((command) => command.type === "source/set")).toEqual([]);
    expect(screen.queryByRole("table")).toBeNull();
  }, 30000);
});
