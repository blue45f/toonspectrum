import { flattenMetrics } from "../../bench/report/report-schema";

import type { BrushCertificationReport, ThresholdRule, Verdict } from "../../bench/report/report-schema";
import type { AbComparison } from "../state/bench-types";

export interface MetricsTableProps {
  reportA: BrushCertificationReport | null;
  reportB: BrushCertificationReport | null;
  comparison: AbComparison | null;
  laneA: string;
  laneB: string;
}

export function formatMetric(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(4);
}

function thresholdText(rule: ThresholdRule | undefined): string {
  return rule ? `${rule.op} ${rule.threshold}` : "—";
}

function VerdictCell({ verdict }: { verdict: Verdict | undefined }) {
  return <td className={verdict ? `lab-verdict-${verdict}` : undefined}>{verdict ?? "—"}</td>;
}

/** 지표·임계값·판정 표. 지표 키는 리포트의 `<group>.<key>` 평탄화 키를 그대로 쓴다. */
export function MetricsTable({ reportA, reportB, comparison, laneA, laneB }: MetricsTableProps) {
  const flatA = reportA ? flattenMetrics(reportA.metrics) : null;
  const flatB = reportB ? flattenMetrics(reportB.metrics) : null;
  const keys = Array.from(new Set([...Object.keys(flatA ?? {}), ...Object.keys(flatB ?? {})]));
  if (keys.length === 0 && !comparison) {
    return <p className="lab-muted">A/B를 실행하면 지표·임계값·판정이 여기에 표시된다.</p>;
  }
  const notes: { key: string; note: string; slot: "A" | "B" }[] = [];
  for (const [slot, report] of [
    ["A", reportA],
    ["B", reportB],
  ] as const) {
    if (!report) continue;
    for (const [key, note] of Object.entries(report.metricNotes)) notes.push({ key, note, slot });
  }
  const perfRows: { label: string; a: string; b: string }[] = comparison
    ? [
        { label: "dabs/s", a: formatMetric(comparison.perfA.dabsPerSecond), b: formatMetric(comparison.perfB.dabsPerSecond) },
        { label: "프레임 p50(ms)", a: formatMetric(comparison.perfA.frameP50Ms), b: formatMetric(comparison.perfB.frameP50Ms) },
        { label: "프레임 p95(ms)", a: formatMetric(comparison.perfA.frameP95Ms), b: formatMetric(comparison.perfB.frameP95Ms) },
        {
          label: "입력→제출 p95(ms)",
          a: formatMetric(comparison.perfA.inputToSubmitP95Ms),
          b: formatMetric(comparison.perfB.inputToSubmitP95Ms),
        },
        { label: "GPU 시간(ms)", a: formatMetric(comparison.perfA.gpuTimeMs), b: formatMetric(comparison.perfB.gpuTimeMs) },
        { label: "submit 수", a: formatMetric(comparison.perfA.submitCount), b: formatMetric(comparison.perfB.submitCount) },
      ]
    : [];
  return (
    <div className="lab-table-wrap">
      {keys.length > 0 ? (
        <table className="lab-table" aria-label="지표·임계값·판정">
          <caption className="lab-visually-hidden">레인별 지표 값과 임계값 판정</caption>
          <thead>
            <tr>
              <th scope="col">지표</th>
              <th scope="col">A ({laneA})</th>
              <th scope="col">B ({laneB})</th>
              <th scope="col">임계값</th>
              <th scope="col">판정 A</th>
              <th scope="col">판정 B</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const rule = reportA?.thresholds[key] ?? reportB?.thresholds[key];
              return (
                <tr key={key} data-testid={`lab-metric-${key}`}>
                  <th scope="row" className="lab-mono">
                    {key}
                  </th>
                  <td>{formatMetric(flatA?.[key])}</td>
                  <td>{formatMetric(flatB?.[key])}</td>
                  <td>{thresholdText(rule)}</td>
                  <VerdictCell verdict={reportA?.verdicts[key]} />
                  <VerdictCell verdict={reportB?.verdicts[key]} />
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      {comparison ? (
        <table className="lab-table" aria-label="A/B 비교">
          <caption className="lab-visually-hidden">A와 B의 픽셀·성능 비교</caption>
          <thead>
            <tr>
              <th scope="col">비교 항목</th>
              <th scope="col">A ({comparison.laneA})</th>
              <th scope="col">B ({comparison.laneB})</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">커버리지 IoU</th>
              <td colSpan={2}>{formatMetric(comparison.iou)}</td>
            </tr>
            <tr>
              <th scope="row">ΔE 평균 / p99 / 최대</th>
              <td colSpan={2}>
                {formatMetric(comparison.deltaE.mean)} / {formatMetric(comparison.deltaE.p99)} /{" "}
                {formatMetric(comparison.deltaE.max)}
              </td>
            </tr>
            <tr>
              <th scope="row">퍼지 불일치(δ48, 3×3) %</th>
              <td colSpan={2}>{formatMetric(comparison.fuzzyMismatchPct)}</td>
            </tr>
            <tr>
              <th scope="row">픽셀 해시 동일</th>
              <td colSpan={2} className={comparison.hashEqual ? "lab-verdict-PASS" : "lab-verdict-FAIL"}>
                {comparison.hashEqual ? "동일" : "다름"}
              </td>
            </tr>
            <tr>
              <th scope="row">픽셀 해시</th>
              <td className="lab-mono">{comparison.hashA}</td>
              <td className="lab-mono">{comparison.hashB}</td>
            </tr>
            {perfRows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{row.a}</td>
                <td>{row.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p>
        <strong>종합 판정</strong> — A:{" "}
        <span className={reportA ? `lab-verdict-${reportA.verdict}` : undefined} data-testid="lab-verdict-a">
          {reportA?.verdict ?? "—"}
        </span>{" "}
        · B:{" "}
        <span className={reportB ? `lab-verdict-${reportB.verdict}` : undefined} data-testid="lab-verdict-b">
          {reportB?.verdict ?? "—"}
        </span>
        <span className="lab-muted"> (FAIL이 하나라도 있으면 FAIL, 측정 불가는 UNAVAILABLE)</span>
      </p>
      {notes.length > 0 ? (
        <details>
          <summary>측정 불가 지표 사유 {notes.length}건</summary>
          <ul>
            {notes.map((n) => (
              <li key={`${n.slot}-${n.key}`}>
                [{n.slot}] <span className="lab-mono">{n.key}</span>: {n.note}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
