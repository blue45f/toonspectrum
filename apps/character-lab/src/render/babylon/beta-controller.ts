/**
 * 베타 기능 컨트롤러: NodeMaterial 툰 · IBL Shadows · OpenPBR · 투영 페인트의 요청·능력 확인·자원 수명·상태 보고를 한곳에서 맡는다.
 * 엔진 본체(`character-engine.ts`)는 이 컨트롤러에 `BetaHost`(장면·리그·셰이딩 읽기)를 주고, 재질을 고를 때와 렌더 루프에서 훅만 부른다.
 *
 * 원칙(ADR-0018 계열)
 * - 기본은 전부 꺼짐. 켜기 전에 능력을 확인하고 `supported=false`면 켜지 않는다 — 요청해도 `unavailable` + 한글 사유만 남고 다른 경로로 **자동 대체하지 않는다**.
 * - 무거운 모듈(NodeMaterial 블록·OpenPBR·IBL Shadows 파이프라인)은 **동적 import**로 켤 때만 받는다(엔진 청크 분리 유지).
 * - 모드 불일치(툰 전용 기능을 PBR 모드에서 켠 경우 등)는 오류가 아니라 "대기"(status off + 사유)다. 모드가 맞으면 다시 적용된다.
 * - 토글을 끄거나 모드·소스가 바뀌면 만든 재질·파이프라인·렌더러를 전부 해제한다(누수 없음, 테스트가 장면 객체 수로 확인).
 * - 해제·생성은 `queue`로 직렬화한다(빠른 연타에도 자원이 겹쳐 남지 않게).
 */
import { describeDetail } from "../../contracts";
import { betaActive, betaFailed, betaOff, betaUnsupported, betaWaiting, createBetaReport } from "../beta-features";
import { waitUntilReady } from "../material-readiness";

import { iblShadowsSupport, openPbrSupport } from "./beta-support";
import { createProjectionPainter, projectionPaintSupport } from "./projection-paint";

import type { ShadingMode } from "../../contracts";
import type { BetaFeatureId, BetaFeatureReport, BetaFeatureState } from "../beta-features";
import type { OpenPbrParams } from "../openpbr-mapping";
import type { ProjectionPaintPort } from "../projection-paint";
import type { ReadbackLane } from "../readback";
import type { ToonParams } from "../toon-reference";
import type { CharacterRig, RigPart } from "./character-rig";
import type { IblShadowsBinding } from "./lighting/ibl-shadows";
import type { NodeToon, NodeToonTextures } from "./materials/node-toon-material";
import type { ProjectionPainter } from "./projection-paint";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** 컨트롤러가 엔진 본체에서 읽는 것들 */
export interface BetaHost {
  readonly scene: Scene;
  readonly engine: AbstractEngine;
  readonly lane: ReadbackLane;
  readonly camera: Camera;
  readonly sssAvailable: boolean;
  shadingMode(): ShadingMode;
  /** IBL을 쓰는 중이고 환경 텍스처가 있는지 */
  iblUsable(): boolean;
  rig(): CharacterRig | null;
  toonParams(part: RigPart, rig: CharacterRig): ToonParams;
  toonTextures(part: RigPart): NodeToonTextures;
  openPbrParams(part: RigPart): OpenPbrParams;
  /** OpenPBR baseColorTexture로 쓸 알베도(패키지 알베도·입 안 마스크). 없으면 null. */
  openPbrAlbedoTexture(part: RigPart): BaseTexture | null;
  /** 베타 재질이 만들어지거나 해제되어 엔진이 모드별 재질을 다시 끼워야 할 때 */
  materialsChanged(): void;
  now(): number;
  /**
   * 새 베타 재질이 `isReady`가 될 때까지 기다리는 상한(ms). 0이면 기다리지 않는다(NullEngine은 컴파일하지 않는다).
   * 준비되지 않은 재질을 메시에 끼우면 Babylon이 그 메시를 그리지 않아 캐릭터가 사라지므로(OpenPBR은 외부 노이즈 텍스처를 못 받으면 영원히 미준비),
   * 준비된 뒤에만 끼우고 시간 안에 안 되면 `unavailable` + 사유로 보고하고 해제한다.
   */
  readonly materialReadyTimeoutMs: number;
}

/** 무거운 모듈 로더(테스트가 가짜를 주입할 수 있다) */
export interface BetaLoaders {
  nodeToon(): Promise<typeof import("./materials/node-toon-material")>;
  openPbr(): Promise<typeof import("./materials/openpbr-material")>;
  iblShadows(): Promise<typeof import("./lighting/ibl-shadows")>;
}

export const DEFAULT_BETA_LOADERS: BetaLoaders = {
  nodeToon: () => import("./materials/node-toon-material"),
  openPbr: () => import("./materials/openpbr-material"),
  iblShadows: () => import("./lighting/ibl-shadows"),
};

export interface BetaController {
  report(): BetaFeatureReport;
  set(id: BetaFeatureId, enabled: boolean): Promise<BetaFeatureState>;
  /** 모드·소스·IBL이 바뀐 뒤 자원을 요청과 맞춘다(비동기, 직렬화). */
  reconcile(): Promise<void>;
  /** 대기 중인 모든 작업이 끝날 때까지(테스트·종료 순서용) */
  settled(): Promise<void>;
  /** 툰 모드에서 이 파츠에 끼울 NodeMaterial(없으면 null = 기본 ShaderMaterial 툰) */
  nodeToonMaterial(part: RigPart): Material | null;
  /** PBR 모드에서 이 파츠에 끼울 OpenPBR(없으면 null = 기본 PBRMaterial) */
  openPbrMaterial(part: RigPart): Material | null;
  updateNodeToon(part: RigPart, params: ToonParams, textures: NodeToonTextures): void;
  updateOpenPbr(part: RigPart): void;
  /** 이 리그의 파츠에 딸린 베타 재질을 해제한다 */
  releaseRig(rig: CharacterRig): void;
  /** 소스·포즈·재질이 바뀌어 IBL 그림자 입력을 다시 맞춘다 */
  syncIblShadows(): void;
  markPoseChanged(): void;
  /** 렌더 루프 훅: IBL 그림자 재복셀화 등 */
  tick(): void;
  /** 투영 페인트 포트(켜져 있을 때만) */
  projectionPort(): ProjectionPaintPort | null;
  /** 진단: 지금 살아 있는 베타 자원 수 */
  resourceCounts(): { readonly nodeToons: number; readonly openPbrs: number; readonly iblShadows: boolean; readonly projection: boolean };
  dispose(): void;
}

interface NodeToonEntry {
  readonly toon: NodeToon;
  /** 그래프 빌드(코드 생성)가 끝나 메시에 끼워도 되는지 */
  built: boolean;
}

interface OpenPbrEntry {
  readonly material: Material;
  applyParams(): void;
}

/** 화면에 보이는 사유: Error는 메시지만(스택 제외), 그 밖의 값은 계약의 `describeDetail`. */
function failureText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return describeDetail(error) ?? "알 수 없는 오류";
}

export function createBetaController(host: BetaHost, loaders: BetaLoaders = DEFAULT_BETA_LOADERS): BetaController {
  const requested: Record<BetaFeatureId, boolean> = { nodeMaterialToon: false, iblShadows: false, openPbr: false, uvProjectionPaint: false };
  const failures: Partial<Record<BetaFeatureId, string>> = {};
  const nodeToons = new Map<RigPart, NodeToonEntry>();
  const openPbrs = new Map<RigPart, OpenPbrEntry>();
  let ibl: IblShadowsBinding | null = null;
  let projection: ProjectionPainter | null = null;
  let loading: BetaFeatureId | null = null;
  let disposed = false;
  let queue: Promise<void> = Promise.resolve();
  let nodeToonKit: Awaited<ReturnType<BetaLoaders["nodeToon"]>> | null = null;
  let openPbrKit: Awaited<ReturnType<BetaLoaders["openPbr"]>> | null = null;

  // ---- 능력 판정(요청과 무관하게 계산)
  const supportOf = (id: BetaFeatureId): { readonly supported: boolean; readonly reasonKo?: string } => {
    switch (id) {
      case "nodeMaterialToon":
        return { supported: true };
      case "openPbr":
        return openPbrSupport(host.engine);
      case "iblShadows":
        return iblShadowsSupport(host.engine);
      case "uvProjectionPaint":
        return projectionPaintSupport(host.engine, host.lane);
    }
  };

  // ---- 자원 해제
  const releaseNodeToons = (): void => {
    for (const entry of nodeToons.values()) entry.toon.dispose();
    nodeToons.clear();
  };
  const releaseOpenPbrs = (): void => {
    for (const holder of openPbrs.values()) holder.material.dispose(true, false);
    openPbrs.clear();
  };
  const releaseIbl = (): void => {
    ibl?.dispose();
    ibl = null;
  };
  const releaseProjection = (): void => {
    projection?.dispose();
    projection = null;
  };

  const wantNodeToon = (): boolean => requested.nodeMaterialToon && failures.nodeMaterialToon === undefined && host.shadingMode() === "toon";
  const wantOpenPbr = (): boolean => requested.openPbr && failures.openPbr === undefined && supportOf("openPbr").supported && host.shadingMode() === "pbr";
  const wantIbl = (): boolean => requested.iblShadows && failures.iblShadows === undefined && supportOf("iblShadows").supported && host.shadingMode() === "pbr" && host.iblUsable() && host.rig() !== null;
  const wantProjection = (): boolean => requested.uvProjectionPaint && failures.uvProjectionPaint === undefined && supportOf("uvProjectionPaint").supported;

  // ---- 생성
  /**
   * 베타 재질이 실제로 그려질 수 있을 때까지(셰이더 컴파일·외부 텍스처) 기다린다. 시간 안에 안 되면 throw.
   *
   * **진짜 메시가 아니라 숨긴 복제 메시로 검사한다.** 아직 끼우지 않은 재질에 `isReady(진짜 메시)`를 부르면 그 메시의 서브메시가 이전 재질(PBR)의 효과·defines를
   * 들고 있어 `isReady`가 **거짓 양성(true)** 으로 돌아온다 — 실브라우저 실측: 외부 노이즈 PNG를 못 받아 OpenPBR이 영원히 미준비인데도 8초 만에 "활성"으로 보고됐다.
   * 복제 메시는 서브메시 상태가 비어 있어 그 재질의 변종을 처음부터 컴파일·텍스처 확인한다(같은 defines면 컴파일 캐시를 같이 써 나중에 진짜 메시도 곧 준비된다).
   */
  const awaitMaterialsReady = async (rig: CharacterRig, label: string, materialOf: (part: RigPart) => Material | null): Promise<void> => {
    if (host.materialReadyTimeoutMs <= 0) return;
    const probes: Mesh[] = [];
    try {
      const checks: Array<() => boolean> = [];
      for (const part of rig.parts) {
        const material = materialOf(part);
        const mesh = part.meshes[0];
        if (!material || !mesh) continue;
        const probe = mesh.clone(`beta-probe:${part.id}`, null, true);
        probe.setEnabled(false);
        probe.material = material;
        probes.push(probe);
        checks.push(() => material.isReady(probe));
      }
      const result = await waitUntilReady(checks, { timeoutMs: host.materialReadyTimeoutMs });
      if (!result.ready) {
        throw new Error(`${label} 재질이 ${Math.round(host.materialReadyTimeoutMs / 1000)}초 안에 준비되지 않았습니다(미준비 ${result.pending}개). 셰이더 컴파일이 실패했거나 외부 텍스처를 받지 못했을 수 있습니다.`);
      }
    } finally {
      for (const probe of probes) probe.dispose(false, false);
    }
  };

  const ensureNodeToons = async (rig: CharacterRig): Promise<void> => {
    nodeToonKit ??= await loaders.nodeToon();
    const kit = nodeToonKit;
    const language = kit.nodeLanguageFor(host.engine.isWebGPU);
    const pending: Array<Promise<void>> = [];
    for (const part of rig.parts) {
      if (nodeToons.has(part)) continue;
      const toon = kit.createNodeToon(host.scene, language, `node-toon:${part.id}`);
      const entry: NodeToonEntry = { toon, built: false };
      nodeToons.set(part, entry);
      toon.material.backFaceCulling = part.pbr.backFaceCulling;
      toon.setParams(host.toonParams(part, rig));
      toon.setTextures(host.toonTextures(part));
      pending.push(
        toon.ready.then(() => {
          entry.built = true;
        }),
      );
    }
    await Promise.all(pending);
    await awaitMaterialsReady(rig, "NodeMaterial 툰", (part) => nodeToons.get(part)?.toon.material ?? null);
  };

  const ensureOpenPbrs = async (rig: CharacterRig): Promise<void> => {
    openPbrKit ??= await loaders.openPbr();
    const kit = openPbrKit;
    for (const part of rig.parts) {
      if (openPbrs.has(part)) continue;
      const params = host.openPbrParams(part);
      const material = kit.createOpenPbrMaterial(host.scene, `openpbr:${part.id}`, params);
      kit.setOpenPbrAlbedoTexture(material, host.openPbrAlbedoTexture(part));
      openPbrs.set(part, {
        material,
        applyParams: () => {
          kit.applyOpenPbrParams(material, host.openPbrParams(part));
          kit.setOpenPbrAlbedoTexture(material, host.openPbrAlbedoTexture(part));
        },
      });
    }
    await awaitMaterialsReady(rig, "OpenPBR", (part) => openPbrs.get(part)?.material ?? null);
  };

  const ensureIbl = async (): Promise<void> => {
    if (ibl && !ibl.disposed) return;
    const module = await loaders.iblShadows();
    ibl = module.createIblShadows({ scene: host.scene, camera: host.camera });
    syncIbl();
  };

  const ensureProjection = (): void => {
    projection ??= createProjectionPainter({ scene: host.scene, camera: host.camera, rig: () => host.rig() });
  };

  function syncIbl(): void {
    const rig = host.rig();
    if (!ibl || ibl.disposed || !rig) return;
    const casters: Mesh[] = [];
    const receivers: Material[] = [];
    for (const part of rig.parts) {
      if (part.forceHidden || !part.visible) continue;
      casters.push(...part.meshes);
      const active = openPbrs.get(part)?.material ?? part.pbr;
      receivers.push(active);
    }
    ibl.setCasters(casters);
    ibl.setReceivers(receivers);
  }

  // ---- 요청과 자원 맞추기(직렬)
  const doReconcile = async (): Promise<void> => {
    if (disposed) return;
    const rig = host.rig();
    let changed = false;

    // NodeMaterial 툰
    if (wantNodeToon() && rig) {
      if (nodeToons.size === 0 || rig.parts.some((part) => !nodeToons.has(part))) {
        loading = "nodeMaterialToon";
        try {
          await ensureNodeToons(rig);
          changed = true;
        } catch (error) {
          failures.nodeMaterialToon = `NodeMaterial 툰 그래프를 만들지 못했습니다(${failureText(error)}).`;
          releaseNodeToons();
          changed = true;
        } finally {
          loading = null;
        }
      }
    } else if (nodeToons.size > 0) {
      releaseNodeToons();
      changed = true;
    }

    // OpenPBR
    if (wantOpenPbr() && rig) {
      if (openPbrs.size === 0 || rig.parts.some((part) => !openPbrs.has(part))) {
        loading = "openPbr";
        try {
          await ensureOpenPbrs(rig);
          changed = true;
        } catch (error) {
          failures.openPbr = `OpenPBR 재질을 만들지 못했습니다(${failureText(error)}).`;
          releaseOpenPbrs();
          changed = true;
        } finally {
          loading = null;
        }
      }
    } else if (openPbrs.size > 0) {
      releaseOpenPbrs();
      changed = true;
    }

    // 재질이 바뀌면 엔진이 모드별 재질을 다시 끼운다(IBL 그림자 수신 재질 목록도 그 뒤에 맞춘다).
    if (changed) host.materialsChanged();

    // IBL Shadows
    if (wantIbl() && rig) {
      loading = "iblShadows";
      try {
        await ensureIbl();
        syncIbl();
      } catch (error) {
        failures.iblShadows = `IBL Shadows 파이프라인을 만들지 못했습니다(${failureText(error)}).`;
        releaseIbl();
      } finally {
        loading = null;
      }
    } else if (ibl) {
      releaseIbl();
    }

    // 투영 페인트
    if (wantProjection()) {
      loading = "uvProjectionPaint";
      try {
        ensureProjection();
      } catch (error) {
        failures.uvProjectionPaint = `투영 페인트를 준비하지 못했습니다(${failureText(error)}).`;
        releaseProjection();
      } finally {
        loading = null;
      }
    } else if (projection) {
      releaseProjection();
    }
  };

  const enqueue = (): Promise<void> => {
    const next = queue.then(doReconcile);
    queue = next.catch(() => undefined);
    return next;
  };

  // ---- 상태 보고
  const stateOf = (id: BetaFeatureId): BetaFeatureState => {
    const support = supportOf(id);
    const isRequested = requested[id];
    if (!support.supported) return betaUnsupported(support.reasonKo ?? "이 엔진에서는 지원하지 않습니다.", isRequested);
    if (!isRequested) {
      return betaOff(
        id === "nodeMaterialToon"
          ? "기본 ShaderMaterial 툰을 사용합니다."
          : id === "openPbr"
            ? "기본 PBRMaterial을 사용합니다."
            : id === "iblShadows"
              ? "복셀 IBL 그림자를 쓰지 않습니다."
              : "UV 원형 스탬프(CPU)로 칠합니다.",
      );
    }
    const failure = failures[id];
    if (failure !== undefined) return betaFailed(failure);
    const mode = host.shadingMode();
    switch (id) {
      case "nodeMaterialToon":
        if (mode !== "toon") return betaWaiting("툰 모드에서만 적용됩니다(현재 PBR).");
        if (loading === id || nodeToons.size === 0 || [...nodeToons.values()].some((entry) => !entry.built)) return betaWaiting("NodeMaterial 그래프를 만드는 중입니다.");
        return betaActive(`NodeMaterial 그래프 ${[...nodeToons.values()][0]?.toon.blockCount ?? 0}블록 · ${host.engine.isWebGPU ? "WGSL" : "GLSL"} · 파츠 ${nodeToons.size}개`);
      case "openPbr":
        if (mode !== "pbr") return betaWaiting("PBR 모드에서만 적용됩니다(현재 툰).");
        if (loading === id || openPbrs.size === 0) return betaWaiting("OpenPBR 재질을 만드는 중입니다.");
        return betaActive(`OpenPBRMaterial · 파츠 ${openPbrs.size}개 · 페인트 데칼 미지원`);
      case "iblShadows":
        if (mode !== "pbr") return betaWaiting("PBR·OpenPBR 모드에서만 적용됩니다(툰 재질은 IBL 그림자를 받지 못합니다).");
        if (!host.iblUsable()) return betaWaiting("IBL이 꺼져 있거나 환경 텍스처가 없어 적용하지 않습니다.");
        if (host.rig() === null) return betaWaiting("캐릭터 소스가 없습니다.");
        if (loading === id || ibl === null) return betaWaiting("IBL 그림자 파이프라인을 만드는 중입니다.");
        return betaActive(`복셀 IBL 그림자 · 재복셀화 ${ibl.voxelizations()}회${ibl.pipeline.isReady() ? "" : " · 준비 중(노이즈 텍스처·CDF 생성 대기)"}`);
      case "uvProjectionPaint":
        if (loading === id || projection === null) return betaWaiting("투영 페인트를 준비하는 중입니다.");
        return betaActive("드로잉 모드에서 투영 브러시를 씁니다(스트로크가 끝나면 GPU 결과를 레이어로 읽어 되돌리기 1단계로 기록)");
    }
  };

  return {
    report() {
      const partial: Partial<Record<BetaFeatureId, BetaFeatureState>> = {};
      for (const id of Object.keys(requested) as BetaFeatureId[]) partial[id] = stateOf(id);
      return createBetaReport(partial);
    },
    async set(id, enabled) {
      if (disposed) return stateOf(id);
      requested[id] = enabled;
      if (enabled) delete failures[id];
      if (enabled && !supportOf(id).supported) return stateOf(id); // 지원하지 않으면 켜지 않고 사유만 보고한다
      await enqueue();
      return stateOf(id);
    },
    reconcile: enqueue,
    settled: () => queue,
    nodeToonMaterial(part) {
      const entry = nodeToons.get(part);
      return host.shadingMode() === "toon" && wantNodeToon() && entry?.built ? entry.toon.material : null;
    },
    openPbrMaterial: (part) => (host.shadingMode() === "pbr" && wantOpenPbr() ? (openPbrs.get(part)?.material ?? null) : null),
    updateNodeToon(part, params, textures) {
      const entry = nodeToons.get(part);
      if (!entry) return;
      entry.toon.setParams(params);
      entry.toon.setTextures(textures);
    },
    updateOpenPbr(part) {
      openPbrs.get(part)?.applyParams();
    },
    releaseRig(rig) {
      for (const part of rig.parts) {
        const entry = nodeToons.get(part);
        if (entry) {
          entry.toon.dispose();
          nodeToons.delete(part);
        }
        const pbr = openPbrs.get(part);
        if (pbr) {
          pbr.material.dispose(true, false);
          openPbrs.delete(part);
        }
      }
      ibl?.setCasters([]);
      projection?.cancel();
    },
    syncIblShadows: syncIbl,
    markPoseChanged() {
      ibl?.markDirty();
    },
    tick() {
      ibl?.tick(host.now());
    },
    projectionPort() {
      return projection && stateOf("uvProjectionPaint").status === "active" ? projection : null;
    },
    resourceCounts: () => ({ nodeToons: nodeToons.size, openPbrs: openPbrs.size, iblShadows: ibl !== null && !ibl.disposed, projection: projection !== null }),
    dispose() {
      disposed = true;
      releaseNodeToons();
      releaseOpenPbrs();
      releaseIbl();
      releaseProjection();
    },
  };
}
