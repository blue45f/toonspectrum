import type { StudioLayerColor, StudioLayerKind, StudioLayerRole } from "./studio-layer-navigator";
import type { StudioLayerSmartView } from "./studio-layer-smart-views";

export type StudioLayerQueryState =
  | "visible"
  | "hidden"
  | "locked"
  | "unlocked"
  | "masked"
  | "unmasked"
  | "mask-enabled"
  | "mask-disabled"
  | "reference"
  | "alpha-locked"
  | "ai"
  | "clipped"
  | "animated"
  | "grouped"
  | "ungrouped"
  | "role"
  | "no-role"
  | "color"
  | "no-color"
  | "text"
  | "no-text"
  | "default-name"
  | "unknown-kind"
  | "zero-opacity"
  | "orphan-group"
  | "editable"
  | "attention"
  | "output"
  | "unclassified"
  | "advanced";

export type StudioLayerQueryTerm =
  | { kind: "text"; value: string; negated: boolean; raw: string }
  | { kind: "name"; value: string; negated: boolean; raw: string }
  | { kind: "content"; value: string; negated: boolean; raw: string }
  | { kind: "id"; value: string; negated: boolean; raw: string }
  | { kind: "group"; value: string | null; negated: boolean; raw: string }
  | {
      kind: "layer-kind";
      values: readonly Exclude<StudioLayerKind, "all">[];
      negated: boolean;
      raw: string;
    }
  | { kind: "role"; values: readonly (StudioLayerRole | "none")[]; negated: boolean; raw: string }
  | { kind: "color"; values: readonly (StudioLayerColor | "none")[]; negated: boolean; raw: string }
  | { kind: "state"; values: readonly StudioLayerQueryState[]; negated: boolean; raw: string }
  | { kind: "smart"; values: readonly Exclude<StudioLayerSmartView, "all">[]; negated: boolean; raw: string }
  | {
      kind: "opacity";
      operator: "=" | "!=" | "<" | "<=" | ">" | ">=";
      value: number;
      negated: boolean;
      raw: string;
    }
  | { kind: "invalid"; negated: false; raw: string };

export interface StudioLayerQueryDiagnostic {
  token: string;
  code: "unterminated-quote" | "unknown-value" | "invalid-opacity" | "empty-value";
  message: string;
}

export interface StudioLayerQueryPlan {
  terms: readonly StudioLayerQueryTerm[];
  diagnostics: readonly StudioLayerQueryDiagnostic[];
}
