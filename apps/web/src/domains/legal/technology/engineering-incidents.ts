import type { EngineeringTroubleshootingCase as FieldIncident } from "./engineering-field-notes-content";
import type { EngineeringEvidence, EngineeringStatus, LocalizedText } from "./engineering-story-content";
import type { EngineeringTroubleshootingCase as ArchiveIncident } from "./engineering-story-deep-dive-content";

/**
 * 장애 기록 두 묶음(회귀 계약형·잘못된 가설형)을 같은 모양으로 맞춘다.
 * 원본 데이터 형식은 그대로 두고, 화면에서만 공통 행(row)으로 변환한다.
 */

export type RowTone = "bad" | "warn" | "neutral" | "accent" | "good" | "cool";

export interface IncidentRow {
  readonly key: string;
  readonly label: LocalizedText;
  readonly tone: RowTone;
  readonly text: LocalizedText;
}

export interface IncidentView {
  readonly id: string;
  readonly status: EngineeringStatus;
  readonly area?: LocalizedText;
  readonly title: LocalizedText;
  readonly rows: readonly IncidentRow[];
  readonly evidence: readonly EngineeringEvidence[];
}

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export function fromFieldIncident(item: FieldIncident): IncidentView {
  return {
    id: item.id,
    status: item.status,
    title: item.title,
    rows: [
      { key: "symptom", label: t("증상", "Symptom"), tone: "bad", text: item.symptom },
      { key: "cause", label: t("근본 원인", "Root cause"), tone: "neutral", text: item.rootCause },
      { key: "fix", label: t("수정", "Fix"), tone: "accent", text: item.fix },
      { key: "prevention", label: t("재발 방지", "Prevention"), tone: "good", text: item.prevention },
    ],
    evidence: item.evidence,
  };
}

export function fromArchiveIncident(item: ArchiveIncident): IncidentView {
  return {
    id: item.id,
    status: item.status,
    area: item.area,
    title: item.title,
    rows: [
      { key: "symptom", label: t("증상", "Symptom"), tone: "bad", text: item.symptom },
      { key: "wrong-turn", label: t("잘못된 접근", "Wrong turn"), tone: "warn", text: item.wrongTurn },
      { key: "cause", label: t("실제 원인", "Root cause"), tone: "neutral", text: item.rootCause },
      { key: "resolution", label: t("해결", "Resolution"), tone: "accent", text: item.resolution },
      { key: "regression", label: t("회귀 검사", "Regression"), tone: "good", text: item.regression },
      { key: "lesson", label: t("재사용 교훈", "Transferable lesson"), tone: "cool", text: item.lesson },
    ],
    evidence: item.evidence,
  };
}

