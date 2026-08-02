/**
 * Studio 3D Rights BOM (Bill of Materials)
 *
 * 3D 에셋의 원본 출처, 저작권, 라이선스, 사용 범위, 파생 이력을
 * 추적하는 Rights BOM(Bill of Materials) 레지스트리입니다.
 *
 * 설계서 참조: §1.4 #7, §8 라이선스·상용 배포·Rights BOM
 */

export type LicenseType =
  | "CC0"
  | "CC-BY-4.0"
  | "CC-BY-SA-4.0"
  | "CC-BY-NC-4.0"
  | "MIT"
  | "Apache-2.0"
  | "LGPL-2.1"
  | "GPL-3.0"
  | "proprietary"
  | "custom"
  | "unknown";

export type UsageScope =
  | "personal"
  | "commercial"
  | "editorial"
  | "education"
  | "internal-only";

export interface RightsRecord {
  assetId: string;
  assetName: string;
  sourceUrl?: string;
  creator: string;
  license: LicenseType;
  usageScope: UsageScope[];
  attributionRequired: boolean;
  attributionText?: string;
  expiresAt?: string;  // ISO date
  modificationAllowed: boolean;
  redistributionAllowed: boolean;
  importDate: string;  // ISO date
  importSourceFormat: string;
  derivedFrom?: string; // parent assetId
  notes?: string;
}

export type RightsValidationSeverity = "error" | "warning" | "info";

export interface RightsValidationResult {
  assetId: string;
  severity: RightsValidationSeverity;
  code: string;
  message: string;
}

export class Studio3DRightsBOM {
  private records: Map<string, RightsRecord> = new Map();

  public addRecord(record: RightsRecord): void {
    this.records.set(record.assetId, record);
  }

  public getRecord(assetId: string): RightsRecord | undefined {
    return this.records.get(assetId);
  }

  public removeRecord(assetId: string): boolean {
    return this.records.delete(assetId);
  }

  public getAllRecords(): RightsRecord[] {
    return [...this.records.values()];
  }

  /**
   * 상용 출판 시 라이선스 호환성을 검증합니다.
   */
  public validateForCommercialPublish(): RightsValidationResult[] {
    const results: RightsValidationResult[] = [];

    for (const record of this.records.values()) {
      // GPL 라이선스 에셋은 상용 웹툰 출판에 제한
      if (record.license === "GPL-3.0") {
        results.push({
          assetId: record.assetId,
          severity: "error",
          code: "GPL_COMMERCIAL_CONFLICT",
          message: `에셋 "${record.assetName}"은(는) GPL-3.0 라이선스로, 상용 출판 시 소스 공개 의무가 발생합니다.`,
        });
      }

      // NC (비상업) 라이선스 에셋의 상용 사용 경고
      if (record.license === "CC-BY-NC-4.0" && record.usageScope.includes("commercial")) {
        results.push({
          assetId: record.assetId,
          severity: "error",
          code: "NC_COMMERCIAL_CONFLICT",
          message: `에셋 "${record.assetName}"은(는) CC-BY-NC 라이선스이며 상용 사용이 금지됩니다.`,
        });
      }

      // 라이선스 미확인 에셋 경고
      if (record.license === "unknown") {
        results.push({
          assetId: record.assetId,
          severity: "warning",
          code: "LICENSE_UNKNOWN",
          message: `에셋 "${record.assetName}"의 라이선스가 확인되지 않았습니다. 출판 전 확인이 필요합니다.`,
        });
      }

      // 만료된 라이선스 확인
      if (record.expiresAt) {
        const expiry = new Date(record.expiresAt);
        if (expiry <= new Date()) {
          results.push({
            assetId: record.assetId,
            severity: "error",
            code: "LICENSE_EXPIRED",
            message: `에셋 "${record.assetName}"의 라이선스가 ${record.expiresAt}에 만료되었습니다.`,
          });
        }
      }

      // 저작자 표기 필수 에셋 안내
      if (record.attributionRequired && !record.attributionText) {
        results.push({
          assetId: record.assetId,
          severity: "warning",
          code: "ATTRIBUTION_MISSING",
          message: `에셋 "${record.assetName}"은(는) 저작자 표기가 필수이지만 표기 텍스트가 비어 있습니다.`,
        });
      }
    }

    return results;
  }

  /**
   * 에셋 파생 이력 체인을 조회합니다.
   */
  public getDerivationChain(assetId: string): RightsRecord[] {
    const chain: RightsRecord[] = [];
    let current = this.records.get(assetId);
    const visited = new Set<string>();
    while (current && !visited.has(current.assetId)) {
      chain.push(current);
      visited.add(current.assetId);
      if (current.derivedFrom) {
        current = this.records.get(current.derivedFrom);
      } else {
        break;
      }
    }
    return chain;
  }

  /**
   * BOM 요약 보고서를 생성합니다.
   */
  public generateSummaryReport(): {
    totalAssets: number;
    byLicense: Record<string, number>;
    attributionRequired: number;
    commercialBlocked: number;
  } {
    const byLicense: Record<string, number> = {};
    let attributionRequired = 0;
    let commercialBlocked = 0;

    for (const record of this.records.values()) {
      byLicense[record.license] = (byLicense[record.license] ?? 0) + 1;
      if (record.attributionRequired) attributionRequired++;
      if (record.license === "GPL-3.0" || record.license === "CC-BY-NC-4.0") {
        commercialBlocked++;
      }
    }

    return {
      totalAssets: this.records.size,
      byLicense,
      attributionRequired,
      commercialBlocked,
    };
  }

  public serializeToJSON(): string {
    return JSON.stringify([...this.records.values()], null, 2);
  }

  public loadFromJSON(json: string): void {
    const parsed = JSON.parse(json) as RightsRecord[];
    this.records.clear();
    for (const r of parsed) {
      this.records.set(r.assetId, r);
    }
  }
}
