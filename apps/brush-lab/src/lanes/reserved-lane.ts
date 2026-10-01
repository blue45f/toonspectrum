import { InvalidStateError, LaneUnavailableError } from "../engine/core/errors";

import { emptyLaneStats, unavailableReport } from "./lane";

import type {
  BrushEngineLane,
  DabBatchReceipt,
  LaneCapabilityReport,
  LaneDescriptor,
  LaneEnvironment,
  LaneId,
  LaneInit,
  LaneKind,
  LaneStats,
  StrokeReceipt,
} from "./lane";
import type { LabImage, RawSample } from "../engine/core/types";
import type { BrushProgram } from "../engine/presets/program-schema";

/**
 * 예약(reserved) 레인 스텁. 구현 파일이 아직 없는 레인 ID가 레지스트리에서 빠지지 않게 하고
 * probe는 구조화된 `not-implemented`를 돌려준다(throw 없음). init 이후 호출은 모두 오류다(무음 대체 없음).
 * 구현이 들어오면 레지스트리 항목의 `create`·`status`만 바꾼다.
 */
export class ReservedLane implements BrushEngineLane {
  readonly status = "reserved" as const;
  readonly engineVersion = "reserved";

  constructor(
    readonly id: LaneId,
    readonly label: string,
    readonly kind: LaneKind,
  ) {}

  async probe(_env: LaneEnvironment): Promise<LaneCapabilityReport> {
    return unavailableReport(this.id, ["not-implemented"]);
  }

  async init(_env: LaneEnvironment, _config: LaneInit): Promise<void> {
    throw new LaneUnavailableError("not-implemented", `${this.id}: 예약 레인(미구현)`, { laneId: this.id });
  }

  beginStroke(_program: BrushProgram, _seed: number): void {
    throw new InvalidStateError(`${this.id}: 예약 레인은 beginStroke를 지원하지 않는다`);
  }

  addSamples(_samples: readonly RawSample[]): DabBatchReceipt {
    throw new InvalidStateError(`${this.id}: 예약 레인은 addSamples를 지원하지 않는다`);
  }

  async endStroke(): Promise<StrokeReceipt> {
    throw new InvalidStateError(`${this.id}: 예약 레인은 endStroke를 지원하지 않는다`);
  }

  async readback(): Promise<LabImage> {
    throw new InvalidStateError(`${this.id}: 예약 레인은 readback을 지원하지 않는다`);
  }

  async readbackLinear(): Promise<Float32Array | null> {
    throw new InvalidStateError(`${this.id}: 예약 레인은 readbackLinear를 지원하지 않는다`);
  }

  stats(): LaneStats {
    return emptyLaneStats();
  }

  dispose(): void {
    // 보유 자원 없음.
  }
}

export function reservedDescriptor(id: LaneId, label: string, kind: LaneKind, note: string): LaneDescriptor {
  return {
    id,
    label,
    kind,
    status: "reserved",
    nodeVerification: `probe not-implemented 경로만(${note})`,
    browserVerification: "—",
    create: () => new ReservedLane(id, label, kind),
  };
}
