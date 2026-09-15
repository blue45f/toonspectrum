import { createHash } from "node:crypto";

import type {
  ProductionProjectAggregate,
  RevisionRef,
} from "@toonspectrum/core/production";

export interface ProductionCalendarEvent {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly url: string;
  readonly googleCalendarUrl: string;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}export function sha256Digest(value: string | Buffer | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function projectUrl(
  aggregate: ProductionProjectAggregate,
  publicOrigin: string | null,
): string {
  const path = `/production/projects/${encodeURIComponent(
    aggregate.projectId,
  )}/overview`;
  return publicOrigin ? `${publicOrigin}${path}` : path;
}

function oneHourAfter(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() + 60 * 60 * 1_000).toISOString();
}

function compactUtcDate(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/u, "Z");
}

function calendarTemplateUrl(input: {
  readonly title: string;
  readonly description: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly url: string;
}): string {  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${compactUtcDate(input.startsAt)}/${compactUtcDate(
      input.endsAt,
    )}`,
    details: `${input.description}\n\n${input.url}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildProductionCalendarEvents(
  aggregate: ProductionProjectAggregate,
  publicOrigin: string | null,
): readonly ProductionCalendarEvent[] {
  const url = projectUrl(aggregate, publicOrigin);
  const rows: Array<
    Omit<ProductionCalendarEvent, "endsAt" | "googleCalendarUrl">
  > = [];
  for (const handoff of aggregate.handoffs) {
    if (
      !handoff.dueAt
      || ["superseded", "cancelled"].includes(handoff.status)
    ) continue;
    rows.push({
      key: `handoff:${handoff.id}`,
      title: `[${aggregate.title}] ${handoff.episodeId} 인수인계`,
      description: `Story → Art 인수인계 마감 · 상태 ${handoff.status}`,
      startsAt: handoff.dueAt,
      url,
    });
  }  for (const task of aggregate.tasks) {
    if (
      !task.dueAt
      || ["done", "cancelled", "out-of-scope"].includes(task.status)
    ) continue;
    rows.push({
      key: `task:${task.id}`,
      title: `[${aggregate.title}] ${task.title}`,
      description: `제작 작업 마감 · ${task.processKey} · 상태 ${task.status}`,
      startsAt: task.dueAt,
      url,
    });
  }
  for (const milestone of aggregate.contractMilestones) {
    if (
      !milestone.dueAt
      || ["paid", "cancelled"].includes(milestone.status)
    ) continue;
    rows.push({
      key: `milestone:${milestone.id}`,
      title: `[${aggregate.title}] 계약 마일스톤 · ${milestone.title}`,
      description: `계약 마일스톤 ${milestone.sequence} · 상태 ${milestone.status}`,
      startsAt: milestone.dueAt,
      url,
    });
  }
  for (const invoice of aggregate.invoices) {
    if (
      !invoice.dueAt
      || ["settled", "void"].includes(invoice.status)
    ) continue;    rows.push({
      key: `invoice:${invoice.id}`,
      title: `[${aggregate.title}] 청구서 지급 기한`,
      description: `${invoice.amountMinor.toLocaleString("en-US")} ${invoice.currency} · 상태 ${invoice.status}`,
      startsAt: invoice.dueAt,
      url,
    });
  }
  return Object.freeze(
    rows
      .sort(
        (left, right) => left.startsAt.localeCompare(right.startsAt)
          || left.key.localeCompare(right.key),
      )
      .map((row) => {
        const endsAt = oneHourAfter(row.startsAt);
        return Object.freeze({
          ...row,
          endsAt,
          googleCalendarUrl: calendarTemplateUrl({ ...row, endsAt }),
        });
      }),
  );
}

function icsEscape(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n");
}function foldIcsLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 73) return line;
  const segments: string[] = [];
  let current = "";
  for (const character of line) {
    const next = `${current}${character}`;
    if (Buffer.byteLength(next, "utf8") > 73) {
      segments.push(current);
      current = character;
    } else {
      current = next;
    }
  }
  if (current) segments.push(current);
  return segments.join("\r\n ");
}

export function buildProductionCalendarIcs(
  aggregate: ProductionProjectAggregate,
  publicOrigin: string | null,
): string {
  const stamp = compactUtcDate(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "PRODID:-//ToonSpectrum//Production Co-Creator//KO",
    `X-WR-CALNAME:${icsEscape(aggregate.title)} 제작 일정`,
  ];  for (const event of buildProductionCalendarEvents(
    aggregate,
    publicOrigin,
  )) {
    const uidHash = sha256Digest(
      `${aggregate.projectId}:${event.key}`,
    ).slice(7, 39);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uidHash}@toonspectrum.production`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${compactUtcDate(event.startsAt)}`,
      `DTEND:${compactUtcDate(event.endsAt)}`,
      `SUMMARY:${icsEscape(event.title)}`,
      `DESCRIPTION:${icsEscape(event.description)}`,
      `URL:${icsEscape(event.url)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

function revisionIngredient(reference: RevisionRef) {
  return Object.freeze({
    title: reference.id,
    relationship: "parentOf",
    lineage: reference.lineage,
    revision: reference.revision,
    digest: reference.digest,
    createdAt: reference.createdAt,
  });
}export function buildProductionProvenanceManifest(
  aggregate: ProductionProjectAggregate,
) {
  const aggregateJson = canonicalJson(aggregate);
  const ingredients = [
    ...aggregate.episodes.flatMap((episode) => [
      episode.narrativeRevisionRef,
      episode.visualRevisionRef,
      episode.integratedRevisionRef,
    ]),
    ...aggregate.planningSnapshots.flatMap(
      (snapshot) => snapshot.sourceRevisionRefs,
    ),
  ].filter((entry): entry is RevisionRef => entry !== null);
  const uniqueIngredients = [
    ...new Map(
      ingredients.map((entry) => [
        `${entry.lineage}:${entry.id}:${entry.revision}`,
        entry,
      ]),
    ).values(),
  ].map(revisionIngredient);
  const rights = aggregate.rightsInterests.map((entry) => ({
    id: entry.id,
    type: entry.type,
    partyId: entry.partyId,
    status: entry.status,
    agreementRevisionRef: entry.agreementRevisionRef,
    evidenceRefs: entry.evidenceRefs,
  }));
  const aggregateDigest = sha256Digest(aggregateJson);
  return Object.freeze({    version: 1,
    trust: "hash-only",
    warning:
      "X.509 인증서로 서명되기 전에는 공개 신뢰 체인의 C2PA 서명이 아닙니다.",
    claimGenerator: "ToonSpectrum Production Co-Creator",
    claimGeneratorVersion: "1",
    projectId: aggregate.projectId,
    workId: aggregate.workId,
    title: aggregate.title,
    aggregateRevision: aggregate.revision,
    aggregateDigest,
    generatedAt: new Date().toISOString(),
    ingredients: Object.freeze(uniqueIngredients),
    assertions: Object.freeze({
      credits: aggregate.creditManifests,
      contributions: aggregate.contributions,
      rights,
      aiUse: rights.filter((entry) => entry.type.includes("ai-")),
      auditEventDigest: sha256Digest(
        canonicalJson(aggregate.auditEvents),
      ),
    }),
    c2paDraft: Object.freeze({
      claim_generator: "ToonSpectrum Production Co-Creator/1",
      title: aggregate.title,
      format: "application/json",
      ingredients: uniqueIngredients,
      assertions: [
        {
          label: "toonspectrum.production.aggregate",
          data: { digest: aggregateDigest },
        },        {
          label: "toonspectrum.production.rights",
          data: rights,
        },
      ],
    }),
  });
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildProductionTaxInvoiceCsv(
  aggregate: ProductionProjectAggregate,
): string {
  const header = [
    "invoiceId",
    "agreementId",
    "milestoneId",
    "issuerPartyId",
    "recipientPartyId",
    "amountMinor",
    "currency",
    "status",
    "issuedAt",
    "dueAt",
    "externalInvoiceRef",
    "issuanceMode",
  ];  const rows = aggregate.invoices.map((invoice) => [
    invoice.id,
    invoice.agreementId,
    invoice.milestoneId,
    invoice.issuerPartyId,
    invoice.recipientPartyId,
    invoice.amountMinor,
    invoice.currency,
    invoice.status,
    invoice.issuedAt,
    invoice.dueAt,
    invoice.externalInvoiceRef,
    "manual-export-not-issued",
  ]);
  return `\uFEFF${[header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")}\r\n`;
}

export function buildMailtoDraft(input: {
  readonly to: readonly string[];
  readonly cc?: readonly string[];
  readonly subject: string;
  readonly body: string;
}): string {
  const params = new URLSearchParams({
    subject: input.subject,
    body: input.body,
  });
  if (input.cc?.length) params.set("cc", input.cc.join(","));
  return `mailto:${input.to.map(encodeURIComponent).join(",")}?${params.toString()}`;
}export function buildGoogleRawMessage(input: {
  readonly to: readonly string[];
  readonly cc?: readonly string[];
  readonly subject: string;
  readonly body: string;
}): string {
  const subject = `=?UTF-8?B?${Buffer.from(
    input.subject,
    "utf8",
  ).toString("base64")}?=`;
  const lines = [
    `To: ${input.to.join(", ")}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(input.body, "utf8").toString("base64"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export const PRODUCTION_GOOGLE_DRIVE_ARTIFACTS = Object.freeze([
  "project-backup",
  "calendar-ics",
  "provenance-json",
  "tax-invoice-csv",
  "tax-invoice-sheet",
] as const);

export type ProductionGoogleDriveArtifact =
  (typeof PRODUCTION_GOOGLE_DRIVE_ARTIFACTS)[number];

export interface ProductionGeneratedFile {
  readonly artifact: ProductionGoogleDriveArtifact;
  readonly fileName: string;
  readonly sourceMimeType: string;
  readonly googleMimeType: string | null;
  readonly content: string;
  readonly digest: string;
}

export function buildProductionProjectBackup(
  aggregate: ProductionProjectAggregate,
) {
  const aggregateContent = canonicalJson(aggregate);
  return Object.freeze({
    version: 1,
    kind: "toonspectrum.production.project-backup",
    generatedAt: new Date().toISOString(),
    projectId: aggregate.projectId,
    workId: aggregate.workId,
    aggregateRevision: aggregate.revision,
    aggregateDigest: sha256Digest(aggregateContent),
    aggregate,
  });
}

export function buildProductionSigningPackage(
  aggregate: ProductionProjectAggregate,
) {
  const aggregateDigest = sha256Digest(canonicalJson(aggregate));
  const payload = {
    version: 1,
    kind: "toonspectrum.production.manual-signing-package",
    legalSignatureApplied: false,
    warning:
      "이 파일은 서명 대상과 해시를 정리한 수동 서명 보조 자료이며 전자서명 완료 증명이 아닙니다.",
    generatedAt: new Date().toISOString(),
    project: {
      projectId: aggregate.projectId,
      workId: aggregate.workId,
      title: aggregate.title,
      aggregateRevision: aggregate.revision,
      aggregateDigest,
    },
    parties: aggregate.parties,
    assignments: aggregate.assignments,
    agreements: aggregate.agreements,
    scopePackages: aggregate.scopePackages,
    scopePackageAddenda: aggregate.scopePackageAddenda,
    rightsInterests: aggregate.rightsInterests,
    compensationPlans: aggregate.compensationPlans,
    auditEventDigest: sha256Digest(canonicalJson(aggregate.auditEvents)),
    instructions: [
      "서명할 PDF와 이 JSON을 같은 폴더에 보관합니다.",
      "PDF의 SHA-256 해시를 서명 기록 또는 서명자 확인 메모에 남깁니다.",
      "각 서명자의 서명 시각·이메일·역할과 서명 완료 파일을 별도 증빙으로 보존합니다.",
      "법적 전자서명이 필요하면 자체 호스팅 Documenso 등 검토된 공급자를 사용합니다.",
    ],
  };
  return Object.freeze({
    ...payload,
    packageDigest: sha256Digest(canonicalJson(payload)),
  });
}

function driveFileName(
  aggregate: ProductionProjectAggregate,
  suffix: string,
): string {
  const projectId = aggregate.projectId.replace(/[^A-Za-z0-9._-]+/gu, "-");
  return `toonspectrum-production-${projectId}-${suffix}`;
}

export function buildProductionGoogleDriveArtifact(
  aggregate: ProductionProjectAggregate,
  artifact: ProductionGoogleDriveArtifact,
  publicOrigin: string | null,
): ProductionGeneratedFile {
  let fileName: string;
  let sourceMimeType: string;
  let googleMimeType: string | null = null;
  let content: string;

  switch (artifact) {
    case "project-backup":
      fileName = driveFileName(aggregate, "backup.json");
      sourceMimeType = "application/json";
      content = `${JSON.stringify(buildProductionProjectBackup(aggregate), null, 2)}\n`;
      break;
    case "calendar-ics":
      fileName = driveFileName(aggregate, "calendar.ics");
      sourceMimeType = "text/calendar";
      content = buildProductionCalendarIcs(aggregate, publicOrigin);
      break;
    case "provenance-json":
      fileName = driveFileName(aggregate, "provenance.json");
      sourceMimeType = "application/json";
      content = `${JSON.stringify(buildProductionProvenanceManifest(aggregate), null, 2)}\n`;
      break;
    case "tax-invoice-csv":
      fileName = driveFileName(aggregate, "tax-invoices.csv");
      sourceMimeType = "text/csv";
      content = buildProductionTaxInvoiceCsv(aggregate);
      break;
    case "tax-invoice-sheet":
      fileName = driveFileName(aggregate, "tax-invoices");
      sourceMimeType = "text/csv";
      googleMimeType = "application/vnd.google-apps.spreadsheet";
      content = buildProductionTaxInvoiceCsv(aggregate);
      break;
  }

  return Object.freeze({
    artifact,
    fileName,
    sourceMimeType,
    googleMimeType,
    content,
    digest: sha256Digest(content),
  });
}
