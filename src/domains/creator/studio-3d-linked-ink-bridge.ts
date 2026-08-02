/**
 * Studio 3D Linked Ink Bridge
 *
 * 3D 오브젝트의 edge/face와 2D 만화 선화(ink stroke) 사이의
 * provenance(출처) 연결을 관리하는 Live 2D↔3D Bridge 엔진입니다.
 *
 * 설계서 참조: §4.11 Linked 2D↔3D Bridge, §1.4 핵심 연결 #4~#6
 */

export type RegenerationPolicy = "follow-3d" | "screen-space" | "freeze";

export interface LinkedInkAnchor {
  sourceNodeId: string;
  sourcePrimitiveId?: string;
  faceId?: string;
  edgeId?: string;
  barycentric?: [number, number, number];
  objectLocalPoint?: [number, number, number];
  cameraId: string;
  sourceRevision: string;
}

export interface StrokeDelta {
  offsetPixels: [number, number][];
  thicknessScale: number;
  smoothingLevel: number;
}

export interface LinkedInkStroke {
  id: string;
  anchors: LinkedInkAnchor[];
  authoredDelta: StrokeDelta;
  regenerationPolicy: RegenerationPolicy;
  confidence: number;
}

export class Studio3DLinkedInkBridge {
  private strokes: Map<string, LinkedInkStroke> = new Map();
  private nextId = 1;

  /**
   * 새 Linked Ink 스트로크를 등록합니다.
   * 3D 엣지/페이스 출처 정보와 작가 보정 delta를 함께 저장합니다.
   */
  public registerStroke(
    anchors: LinkedInkAnchor[],
    policy: RegenerationPolicy = "follow-3d",
    authoredDelta?: StrokeDelta,
  ): LinkedInkStroke {
    const id = `ink-${this.nextId++}`;
    const stroke: LinkedInkStroke = {
      id,
      anchors,
      authoredDelta: authoredDelta ?? { offsetPixels: [], thicknessScale: 1, smoothingLevel: 0 },
      regenerationPolicy: policy,
      confidence: anchors.length > 0 ? 1.0 : 0,
    };
    this.strokes.set(id, stroke);
    return stroke;
  }

  /**
   * 3D 수정 발생 시 영향 받는 스트로크 목록을 반환합니다.
   */
  public findAffectedStrokes(modifiedNodeIds: string[]): LinkedInkStroke[] {
    const idSet = new Set(modifiedNodeIds);
    const affected: LinkedInkStroke[] = [];
    for (const stroke of this.strokes.values()) {
      if (stroke.regenerationPolicy === "freeze") continue;
      const isAffected = stroke.anchors.some((a) => idSet.has(a.sourceNodeId));
      if (isAffected) affected.push(stroke);
    }
    return affected;
  }

  /**
   * 스트로크의 재생성 정책을 변경합니다.
   */
  public setPolicy(strokeId: string, policy: RegenerationPolicy): boolean {
    const stroke = this.strokes.get(strokeId);
    if (!stroke) return false;
    stroke.regenerationPolicy = policy;
    return true;
  }

  /**
   * 3D topology 변경 후 스트로크의 신뢰도를 재평가합니다.
   * 신뢰도가 낮은 경우 사용자에게 수동 확인 UI를 제공합니다.
   */
  public reevaluateConfidence(strokeId: string, validNodeIds: Set<string>): number {
    const stroke = this.strokes.get(strokeId);
    if (!stroke) return 0;

    const totalAnchors = stroke.anchors.length;
    if (totalAnchors === 0) {
      stroke.confidence = 0;
      return 0;
    }
    const validCount = stroke.anchors.filter((a) => validNodeIds.has(a.sourceNodeId)).length;
    stroke.confidence = Math.round((validCount / totalAnchors) * 100) / 100;
    return stroke.confidence;
  }

  /**
   * 스트로크를 동결하여 3D와의 연결을 끊습니다.
   */
  public freezeStroke(strokeId: string): boolean {
    return this.setPolicy(strokeId, "freeze");
  }

  /**
   * 신뢰도가 임계값 미만인 스트로크 목록을 반환합니다.
   */
  public getLowConfidenceStrokes(threshold = 0.5): LinkedInkStroke[] {
    return [...this.strokes.values()].filter((s) => s.confidence < threshold && s.regenerationPolicy !== "freeze");
  }

  public getStroke(id: string): LinkedInkStroke | undefined {
    return this.strokes.get(id);
  }

  public getAllStrokes(): LinkedInkStroke[] {
    return [...this.strokes.values()];
  }

  public removeStroke(id: string): boolean {
    return this.strokes.delete(id);
  }
}
