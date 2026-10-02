import { InvalidStateError } from "../core/errors";

import {
  OIL_RECORD_BYTES,
  SHADER_STAGE,
  WET_BINDINGS,
  WET_FAMILIES,
  WET_KERNEL_BYTES,
} from "./layout";

import type { WetBindingName, WetFamilyName } from "./layout";

/**
 * 습식 파이프라인 가족의 바인드 그룹 레이아웃·파이프라인 레이아웃·바인드 그룹.
 *
 * 습식 커널은 확장 풀·스냅샷·종이·서브스텝 상수·유화 스크래치까지 바인딩해야 하는데, 기본 레이아웃(group 0/1/2)은 이미 storage 버퍼 8개로
 * 차 있다(`maxStorageBuffersPerShaderStage` 기본 8). 그래서 가족(`WET_FAMILIES`)마다 필요한 바인딩만 고른 **별도 레이아웃(group 3 신설)**을
 * 쓴다: dabs·bins·refs·strokePool·document 중 쓰지 않는 것은 바인딩하지 않는다. 같은 바인딩 집합을 가진 group은 레이아웃·바인드 그룹을 공유한다.
 * 바인딩이 없는 group은 빈 레이아웃(파이프라인 레이아웃의 자리 채움)이다.
 */

/** 4개 group 자리(0..3)의 바인드 그룹. 파이프라인이 쓰는 그룹은 전부 설정돼야 한다. */
export type WetGroups = readonly [GPUBindGroup, GPUBindGroup, GPUBindGroup, GPUBindGroup];

export type WetResources = Record<WetBindingName, GPUBindingResource>;

const GROUP_INDEXES = [0, 1, 2, 3] as const;

function entryOf(name: WetBindingName): GPUBindGroupLayoutEntry {
  const slot = WET_BINDINGS[name];
  const base = { binding: slot.binding, visibility: SHADER_STAGE.COMPUTE };
  switch (slot.kind) {
    case "uniform":
      return { ...base, buffer: { type: "uniform", minBindingSize: name === "wetKernel" ? WET_KERNEL_BYTES : 0 } };
    case "uniform-dynamic":
      // 유화 dab 레코드: dispatch마다 setBindGroup(2, group, [k·256])로 레코드를 고른다.
      return { ...base, buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: OIL_RECORD_BYTES } };
    case "storage-read":
      return { ...base, buffer: { type: "read-only-storage" } };
    case "storage-rw":
      return { ...base, buffer: { type: "storage" } };
    case "texture-2d":
      // 팁 아틀라스(r32float)와 종이(rgba32float)는 textureLoad로만 읽는다(필터 불필요).
      return { ...base, texture: { sampleType: "unfilterable-float", viewDimension: "2d" } };
    case "sampler":
      return { ...base, sampler: { type: "filtering" } };
    case "storage-texture-write-rgba8unorm":
      return { ...base, storageTexture: { access: "write-only", format: "rgba8unorm", viewDimension: "2d" } };
  }
}

/** 가족의 group `g` 바인딩 이름(binding 번호순). */
export function familyGroupBindings(family: WetFamilyName, group: number): WetBindingName[] {
  return (WET_FAMILIES[family] as readonly WetBindingName[])
    .filter((n) => WET_BINDINGS[n].group === group)
    .sort((a, b) => WET_BINDINGS[a].binding - WET_BINDINGS[b].binding);
}

/** 레이아웃·바인드 그룹 공유 키(같은 group·같은 바인딩 집합이면 같은 키). */
export function familyGroupKey(family: WetFamilyName, group: number): string {
  const names = familyGroupBindings(family, group);
  return names.length === 0 ? `g${group}-empty` : `g${group}-${names.join("+")}`;
}

/** 가족의 compute 스테이지 storage 버퍼 수(레이아웃 검증과 테스트가 쓴다). */
export function familyStorageBufferCount(family: WetFamilyName): number {
  return (WET_FAMILIES[family] as readonly WetBindingName[]).filter((n) => {
    const kind = WET_BINDINGS[n].kind;
    return kind === "storage-read" || kind === "storage-rw";
  }).length;
}

export class WetBindingSet {
  private readonly bgls = new Map<string, GPUBindGroupLayout>();
  private readonly pipelineLayouts = new Map<WetFamilyName, GPUPipelineLayout>();
  private readonly groupsByFamily = new Map<WetFamilyName, WetGroups>();

  constructor(
    private readonly device: GPUDevice,
    resources: WetResources,
  ) {
    for (const family of Object.keys(WET_FAMILIES) as WetFamilyName[]) {
      const layouts = GROUP_INDEXES.map((g) => this.layoutFor(family, g));
      this.pipelineLayouts.set(family, device.createPipelineLayout({ label: `sumi-wpl-${family}`, bindGroupLayouts: layouts }));
    }
    this.rebuildBindGroups(resources);
  }

  private layoutFor(family: WetFamilyName, group: number): GPUBindGroupLayout {
    const key = familyGroupKey(family, group);
    const hit = this.bgls.get(key);
    if (hit) return hit;
    const layout = this.device.createBindGroupLayout({
      label: `sumi-wbgl-${key}`,
      entries: familyGroupBindings(family, group).map(entryOf),
    });
    this.bgls.set(key, layout);
    return layout;
  }

  /** 가족의 파이프라인 레이아웃. */
  pipelineLayout(family: WetFamilyName): GPUPipelineLayout {
    const layout = this.pipelineLayouts.get(family);
    if (!layout) throw new InvalidStateError(`습식 가족 ${family}의 파이프라인 레이아웃이 없다`);
    return layout;
  }

  /** 가족의 group 0..3 바인드 그룹. */
  groups(family: WetFamilyName): WetGroups {
    const groups = this.groupsByFamily.get(family);
    if (!groups) throw new InvalidStateError(`습식 가족 ${family}의 바인드 그룹이 없다`);
    return groups;
  }

  /**
   * 바인드 그룹을 (다시) 만든다. 리소스(유화 스크래치·선형 표시 버퍼 같은 지연 생성 버퍼)가 바뀌면 호출한다.
   * 같은 group·바인딩 집합은 바인드 그룹을 공유한다.
   */
  rebuildBindGroups(resources: WetResources): void {
    const byKey = new Map<string, GPUBindGroup>();
    for (const family of Object.keys(WET_FAMILIES) as WetFamilyName[]) {
      const groups = GROUP_INDEXES.map((g) => {
        const key = familyGroupKey(family, g);
        const hit = byKey.get(key);
        if (hit) return hit;
        const group = this.device.createBindGroup({
          label: `sumi-wbg-${key}`,
          layout: this.layoutFor(family, g),
          entries: familyGroupBindings(family, g).map((n) => ({ binding: WET_BINDINGS[n].binding, resource: resources[n] })),
        });
        byKey.set(key, group);
        return group;
      });
      this.groupsByFamily.set(family, groups as unknown as WetGroups);
    }
  }
}

/**
 * compute pass 1개 안에서 group 0..3의 현재 바인드 그룹을 추적해 불필요한 `setBindGroup`을 줄인다.
 * 동적 오프셋이 있는 그룹은 항상 다시 설정한다. pass가 새로 시작되면 새 인스턴스를 만든다.
 */
export class PassBinder {
  private readonly current: (GPUBindGroup | null)[] = [null, null, null, null];

  constructor(private readonly pass: GPUComputePassEncoder) {}

  set(index: number, group: GPUBindGroup, offsets?: readonly number[]): void {
    if (offsets === undefined) {
      if (this.current[index] === group) return;
      this.pass.setBindGroup(index, group);
      this.current[index] = group;
      return;
    }
    this.pass.setBindGroup(index, group, offsets);
    this.current[index] = null;
  }

  /** 습식 가족의 group 0..3을 설정한다. `oilOffset`이 있으면 group 2(유화 dab 레코드)에 동적 오프셋으로 쓴다. */
  bindWet(groups: WetGroups, oilOffset?: number): void {
    for (const g of GROUP_INDEXES) {
      if (g === 2 && oilOffset !== undefined) this.set(2, groups[2], [oilOffset]);
      else this.set(g, groups[g]);
    }
  }
}
