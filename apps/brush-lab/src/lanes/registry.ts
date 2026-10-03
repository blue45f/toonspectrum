import { CANVAS2D_LANE } from "./canvas2d-lane";
import { createCpuReferenceLane } from "./cpu-reference-lane";
import { HYBRID_LANE } from "./hybrid-lane";
import { createPlatformBaselineLane } from "./platform-baseline-lane";
import { WASM_CPU_LANE } from "./wasm-cpu-lane";
import { WEBGL2_INSTANCED_LANE } from "./webgl2-instanced-lane";
import { WEBGPU_COMPUTE_LANE } from "./webgpu-compute-lane";
import { WEBGPU_INSTANCED_LANE } from "./webgpu-instanced-lane";

import type { LaneDescriptor, LaneId, LaneKind, LaneStatus } from "./lane";

/**
 * 레인 레지스트리 — README 레인 상태 표의 단일 원천(`lanes/registry.test.ts`가 드리프트를 고정한다).
 * 상태 어휘: implemented | browser-verification-required | reserved.
 *
 * 기준선 3종(cpu-reference·platform-baseline은 bench, canvas2d는 engine-gpu)과 GPU·wasm 레인(engine-gpu)의
 * 디스크립터를 한 배열로 모은다. 구현 파일이 아직 없는 레인은 `reservedDescriptor`(reserved-lane.ts)로 등록해 probe가
 * `not-implemented`를 돌려주게 한다(현재 8개 레인 모두 구현돼 예약 항목은 없다). 구현이 올라오면 해당 항목만 그 파일의
 * 디스크립터로 바꾼다(ID·순서 유지). webgl2-instanced는 2026-10-01 engine-gpu 구현(`webgl2-instanced-lane.ts`)의 디스크립터로,
 * wasm-cpu(`wasm-cpu-lane.ts`)와 wasm-gpu-hybrid(`hybrid-lane.ts`)도 같은 날 구현으로 교체했다.
 * 표 열(Node·브라우저 검증)을 바꾸면 README 표를 `laneStatusTableMarkdown()`으로 다시 만든다.
 */
export const LANE_REGISTRY: readonly LaneDescriptor[] = [
  {
    id: "cpu-reference",
    label: "CPU 참조(Sumi StrokePipeline + Surface)",
    kind: "baseline",
    status: "implemented",
    nodeVerification: "전체(9 fixture 픽셀 해시·결정성·addSamples 분할 = 일괄·dispose 오류)",
    browserVerification: "선택",
    create: createCpuReferenceLane,
  },
  {
    id: "platform-baseline",
    label: "현행 서비스 기준선(studio-brush-platform)",
    kind: "baseline",
    status: "implemented",
    nodeVerification: "픽셀 해시·결정성·cpu-reference 대비 IoU 범위·even-odd 래스터 오라클",
    browserVerification: "선택",
    create: () => createPlatformBaselineLane(),
  },
  CANVAS2D_LANE,
  WEBGPU_COMPUTE_LANE,
  WEBGPU_INSTANCED_LANE,
  WEBGL2_INSTANCED_LANE,
  WASM_CPU_LANE,
  HYBRID_LANE,
];

export const LANE_IDS_ORDERED: readonly LaneId[] = LANE_REGISTRY.map((d) => d.id);

/** 레지스트리 조회. 없는 ID는 RangeError(무음 기본값 없음). */
export function laneById(id: LaneId): LaneDescriptor {
  const found = LANE_REGISTRY.find((d) => d.id === id);
  if (!found) throw new RangeError(`laneById: unknown lane '${id}'`);
  return found;
}

export function findLane(id: string): LaneDescriptor | null {
  return LANE_REGISTRY.find((d) => d.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* README 레인 상태 표                                                   */
/* ------------------------------------------------------------------ */

export interface LaneStatusRow {
  id: LaneId;
  kind: LaneKind;
  status: LaneStatus;
  nodeVerification: string;
  browserVerification: string;
}

export const LANE_STATUS_TABLE_HEADER = "| 레인 ID | 종류 | 상태 | Node 검증 | 브라우저 검증 |";

/** 표 셀에 담을 정규화(개행은 표 행을 깨므로 <br>로). 왕복(parse∘cell)의 목표값이 이것이다. */
function normalizeCell(text: string): string {
  return text.replace(/\r\n|\r|\n/g, "<br>").trim();
}

function cell(text: string): string {
  return normalizeCell(text)
    // 역슬래시를 먼저 이스케이프해야 뒤에 추가한 역슬래시가 재이스케이프되지 않는다.
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|");
}

/** 표 한 줄을 셀 단위로 나누면서 이스케이프를 동시에 푼다(단일 스캔이라 모호함이 없다). */
function splitMarkdownRow(cells: string): string[] {
  const out: string[] = [];
  let current = "";
  for (let i = 0; i < cells.length; i += 1) {
    const ch = cells[i];
    if (ch === "\\" && (cells[i + 1] === "|" || cells[i + 1] === "\\")) {
      current += cells[i + 1];
      i += 1;
      continue;
    }
    if (ch === "|") {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

/** README에 붙여 넣는 표(헤더·구분선·행). 행 순서는 레지스트리 순서다. */
export function laneStatusTableMarkdown(registry: readonly LaneDescriptor[] = LANE_REGISTRY): string {
  const lines = [LANE_STATUS_TABLE_HEADER, "| --- | --- | --- | --- | --- |"];
  for (const d of registry) {
    lines.push(
      `| ${d.id} | ${d.kind} | ${d.status} | ${cell(d.nodeVerification)} | ${cell(d.browserVerification)} |`,
    );
  }
  return lines.join("\n");
}

const LANE_ID_SET: ReadonlySet<string> = new Set(LANE_IDS_ORDERED);
const KIND_SET: ReadonlySet<string> = new Set<LaneKind>(["baseline", "candidate", "comparison"]);
const STATUS_SET: ReadonlySet<string> = new Set<LaneStatus>(["implemented", "browser-verification-required", "reserved"]);

/**
 * 마크다운에서 레인 상태 표 행을 읽는다(첫 셀이 LaneId인 행만). 종류·상태 어휘가 틀리면 RangeError.
 * 표가 없으면 빈 배열.
 */
export function parseLaneStatusTable(markdown: string): LaneStatusRow[] {
  const rows: LaneStatusRow[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const cells = splitMarkdownRow(line.slice(1, line.endsWith("|") ? -1 : undefined));
    const id = cells[0] ?? "";
    if (!LANE_ID_SET.has(id)) continue;
    const kind = cells[1] ?? "";
    const status = cells[2] ?? "";
    if (!KIND_SET.has(kind)) throw new RangeError(`parseLaneStatusTable: ${id} 종류 '${kind}'는 어휘 밖이다`);
    if (!STATUS_SET.has(status)) throw new RangeError(`parseLaneStatusTable: ${id} 상태 '${status}'는 어휘 밖이다`);
    rows.push({
      id: id as LaneId,
      kind: kind as LaneKind,
      status: status as LaneStatus,
      nodeVerification: cells[3] ?? "",
      browserVerification: cells[4] ?? "",
    });
  }
  return rows;
}

/** 레지스트리 ↔ 표 행 드리프트 목록(빈 배열 = 일치). */
export function laneTableDrift(rows: readonly LaneStatusRow[], registry: readonly LaneDescriptor[] = LANE_REGISTRY): string[] {
  const drift: string[] = [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const d of registry) {
    const row = byId.get(d.id);
    if (!row) {
      drift.push(`${d.id}: README 표에 행이 없다`);
      continue;
    }
    if (row.kind !== d.kind) drift.push(`${d.id}: 종류 ${row.kind} ≠ ${d.kind}`);
    if (row.status !== d.status) drift.push(`${d.id}: 상태 ${row.status} ≠ ${d.status}`);
    if (row.nodeVerification !== normalizeCell(d.nodeVerification)) drift.push(`${d.id}: Node 검증 열이 다르다`);
    if (row.browserVerification !== normalizeCell(d.browserVerification)) drift.push(`${d.id}: 브라우저 검증 열이 다르다`);
  }
  for (const r of rows) {
    if (!registry.some((d) => d.id === r.id)) drift.push(`${r.id}: 레지스트리에 없는 행`);
  }
  const order = rows.map((r) => r.id).filter((id) => registry.some((d) => d.id === id));
  const expected = registry.map((d) => d.id).filter((id) => byId.has(id));
  if (order.join(",") !== expected.join(",")) drift.push(`행 순서가 레지스트리 순서와 다르다: ${order.join(",")}`);
  return drift;
}
