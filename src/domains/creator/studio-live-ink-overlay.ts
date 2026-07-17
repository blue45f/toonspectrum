/**
 * Incremental live-ink overlay (canvas2d).
 *
 * 라이브 획을 매 프레임 전체 폴리라인으로 다시 그리는 대신(스트로크가 길어질수록 프레임당
 * O(N)) 새로 확정된 세그먼트만 뷰포트 크기 표면에 누적한다 — 포인트당 O(1). 라이브 프리뷰
 * 백킹은 DPR 을 캡해 필레이트를 아낀다.
 *
 * 픽셀 규약은 Konva Default(pen/marker) 경로와 동일한 중점 이차곡선 + 정점 필압 폭 공식을
 * 사용한다. thinning(최소 간격)도 processFreehandPoints 와 같은 규약이라 커밋 시 시각 차가
 * 세그먼트 반 개 수준을 넘지 않는다. 지우개(destination-out)와 라쏘 필(내부 채움 미리보기)은
 * 이 오버레이 대상이 아니다 — 각각 메인 레이어/Konva 초안 경로가 담당한다.
 *
 * 커밋 지연 파이프라인과 짝을 이룬다: end() 된 획은 settled 목록으로 넘어가 React 동기화가
 * 일어날 때까지 표면에 남고(replay 포함), 동기화가 커밋을 마치면 dropSettled()/clear() 로
 * 정리된다. 그래서 연속 스트로크 사이에 커밋 렌더를 기다리는 빈 프레임이 없다.
 */

export interface StudioLiveInkSurface {
  /** 스케일된 문서 안에서 표면의 CSS 배치(px). planStudioWebGpuViewportSurface.surface 와 동일. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** 문서 픽셀 → CSS 픽셀 배율(effScale). */
  readonly documentScale: number;
  /** 좌우 반전 시 문서 x 재사상에 필요한 문서 논리 폭. */
  readonly documentWidth: number;
  readonly flipX: boolean;
}

export interface StudioLiveInkStrokeStyle {
  readonly color: string;
  /** 문서 픽셀 기준 기본 획 굵기. */
  readonly strokeWidthDoc: number;
  readonly opacity: number;
  /** thinning 최소 간격(문서 px) — strokeRenderDistance(el.sampleSpacing)와 동일 값. */
  readonly minDistanceDoc: number;
}

interface SettledLiveInkStroke {
  readonly style: StudioLiveInkStrokeStyle;
  readonly xs: readonly number[];
  readonly ys: readonly number[];
  readonly ps: readonly number[];
}

/** 라이브 프리뷰 백킹 DPR 캡 — 커밋 화질은 그대로 두고 미리보기 필레이트만 아낀다. */
const LIVE_INK_MAX_DPR = 1.5;

function pressureWidthDoc(strokeWidthDoc: number, pressure: number): number {
  const p = Math.min(1, Math.max(0, pressure));
  return Math.max(0.5, strokeWidthDoc * (0.3 + p * 1.4));
}

export class StudioLiveInkOverlayRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private surface: StudioLiveInkSurface | null = null;
  private dpr = 1;
  private style: StudioLiveInkStrokeStyle | null = null;
  /** thinning 을 통과해 유지된 문서 좌표 점들(재생용). */
  private keptX: number[] = [];
  private keptY: number[] = [];
  private keptP: number[] = [];
  /**
   * 가장 최근에 소비한 원본 샘플. 라이브 thinning 에서 너무 가까워 건너뛴 점도 pointerup
   * 끝점일 수 있으므로 별도로 기억했다가 end() 에서 최종 kept 점으로 승격한다.
   */
  private latestSourceX = 0;
  private latestSourceY = 0;
  private latestSourceP = 0.5;
  /** 원본 draft.points 에서 이미 소비한 포인트 수(중복 append 방지). */
  private consumedSourcePoints = 0;
  private active = false;
  /** 펜을 뗐지만 React 커밋 동기화 전이라 표면에 유지 중인 획들. */
  private settled: SettledLiveInkStroke[] = [];

  attach(canvas: HTMLCanvasElement | null): void {
    this.canvas = canvas;
    this.context = canvas?.getContext("2d") ?? null;
    this.applySurface();
    if (this.active || this.settled.length > 0) this.replay();
  }

  setSurface(surface: StudioLiveInkSurface | null): void {
    const previous = this.surface;
    this.surface = surface;
    const changed =
      !previous || !surface ||
      previous.left !== surface.left || previous.top !== surface.top ||
      previous.width !== surface.width || previous.height !== surface.height ||
      previous.documentScale !== surface.documentScale ||
      previous.documentWidth !== surface.documentWidth ||
      previous.flipX !== surface.flipX;
    if (!changed) return;
    this.applySurface();
    if (this.active || this.settled.length > 0) this.replay();
  }

  get isActive(): boolean {
    return this.active;
  }

  get hasSettledStrokes(): boolean {
    return this.settled.length > 0;
  }

  begin(style: StudioLiveInkStrokeStyle, x: number, y: number, pressure: number): boolean {
    if (!this.context || !this.surface) return false;
    this.style = style;
    this.keptX = [x];
    this.keptY = [y];
    this.keptP = [pressure];
    this.latestSourceX = x;
    this.latestSourceY = y;
    this.latestSourceP = pressure;
    this.consumedSourcePoints = 1;
    this.active = true;
    // settled 잉크는 유지한다 — 커밋 동기화 전의 연속 스트로크가 서로를 지우지 않는다.
    this.drawDot(style, x, y, pressure);
    return true;
  }

  /**
   * draft 의 원본 points/pressures 에서 아직 소비하지 않은 접미사만 증분으로 그린다.
   * 호출 측은 델타를 계산할 필요가 없다 — 렌더러가 소비 오프셋을 기억한다.
   */
  appendFrom(points: readonly number[], pressures: readonly number[] | undefined): void {
    if (!this.active || !this.context || !this.style) return;
    const total = Math.floor(points.length / 2);
    for (let index = this.consumedSourcePoints; index < total; index += 1) {
      const x = points[index * 2]!;
      const y = points[index * 2 + 1]!;
      const pressure = pressures?.[index] ?? 0.5;
      this.latestSourceX = x;
      this.latestSourceY = y;
      this.latestSourceP = pressure;
      this.appendPoint(x, y, pressure);
    }
    this.consumedSourcePoints = Math.max(this.consumedSourcePoints, total);
  }

  /** 획 종료 — 잉크와 재생 데이터는 커밋 동기화(dropSettled/clear)까지 표면에 유지된다. */
  end(): void {
    if (this.active && this.style && this.keptX.length > 0) {
      const lastIndex = this.keptX.length - 1;
      // processFreehandPoints 와 같은 "마지막 원본 점은 항상 보존" 계약. 마지막 포인터 샘플이
      // thinning 간격보다 가까워 appendPoint 에서 생략됐더라도 펜을 놓은 정확한 곳까지 채운다.
      if (
        this.keptX[lastIndex] !== this.latestSourceX ||
        this.keptY[lastIndex] !== this.latestSourceY
      ) {
        this.keptX.push(this.latestSourceX);
        this.keptY.push(this.latestSourceY);
        this.keptP.push(this.latestSourceP);
        this.drawLatestPiece();
      }
      // 새 점이 도착할 때는 이전 중점까지만 확정한다. pointerup 에서 마지막 중점→원시 끝점
      // 반쪽을 별도 곡선으로 더해야 이미 그린 prefix 를 고치지 않고도 실제 끝점까지 도달한다.
      this.drawTerminalCap();
      this.settled.push({
        style: this.style,
        xs: this.keptX,
        ys: this.keptY,
        ps: this.keptP,
      });
    }
    this.active = false;
    this.style = null;
    this.keptX = [];
    this.keptY = [];
    this.keptP = [];
    this.latestSourceX = 0;
    this.latestSourceY = 0;
    this.latestSourceP = 0.5;
    this.consumedSourcePoints = 0;
  }

  /** 커밋이 반영된 settled 획의 재생 데이터만 버린다(픽셀은 그대로 — 클리어는 별도 예약). */
  dropSettled(): void {
    this.settled = [];
  }

  clear(): void {
    this.active = false;
    this.style = null;
    this.keptX = [];
    this.keptY = [];
    this.keptP = [];
    this.latestSourceX = 0;
    this.latestSourceY = 0;
    this.latestSourceP = 0.5;
    this.consumedSourcePoints = 0;
    this.settled = [];
    this.clearRect();
  }

  private appendPoint(x: number, y: number, pressure: number): void {
    const n = this.keptX.length;
    const lastX = this.keptX[n - 1]!;
    const lastY = this.keptY[n - 1]!;
    const distance = Math.hypot(x - lastX, y - lastY);
    if (distance < (this.style?.minDistanceDoc ?? 0)) return;
    this.keptX.push(x);
    this.keptY.push(y);
    this.keptP.push(pressure);
    this.drawLatestPiece();
  }

  /** 마지막으로 추가된 점이 만든 이차곡선 조각 하나만 그린다 — 증분의 핵심. */
  private drawLatestPiece(): void {
    const style = this.style;
    if (!style) return;
    const context = this.prepared(style);
    if (!context) return;
    const n = this.keptX.length;
    if (n < 2) {
      context.restore();
      return;
    }
    const currentX = this.keptX[n - 1]!;
    const currentY = this.keptY[n - 1]!;
    const controlX = this.keptX[n - 2]!;
    const controlY = this.keptY[n - 2]!;
    const fromX = n >= 3 ? (this.keptX[n - 3]! + controlX) / 2 : controlX;
    const fromY = n >= 3 ? (this.keptY[n - 3]! + controlY) / 2 : controlY;
    const midX = (controlX + currentX) / 2;
    const midY = (controlY + currentY) / 2;
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.quadraticCurveTo(controlX, controlY, midX, midY);
    context.lineWidth = pressureWidthDoc(style.strokeWidthDoc, this.keptP[n - 1]!);
    context.stroke();
    context.restore();
  }

  /** 마지막 중점에서 마지막 원본 점까지 남은 반쪽을 prefix 수정 없이 닫는다. */
  private drawTerminalCap(): void {
    const style = this.style;
    const n = this.keptX.length;
    if (!style || n < 2) return;
    const context = this.prepared(style);
    if (!context) return;
    const previousX = this.keptX[n - 2]!;
    const previousY = this.keptY[n - 2]!;
    const lastX = this.keptX[n - 1]!;
    const lastY = this.keptY[n - 1]!;
    context.beginPath();
    context.moveTo((previousX + lastX) / 2, (previousY + lastY) / 2);
    context.quadraticCurveTo(lastX, lastY, lastX, lastY);
    context.lineWidth = pressureWidthDoc(style.strokeWidthDoc, this.keptP[n - 1]!);
    context.stroke();
    context.restore();
  }

  private drawDot(style: StudioLiveInkStrokeStyle, x: number, y: number, pressure: number): void {
    const context = this.prepared(style);
    if (!context) return;
    context.beginPath();
    context.arc(x, y, Math.max(0.35, pressureWidthDoc(style.strokeWidthDoc, pressure) / 2), 0, Math.PI * 2);
    context.fillStyle = style.color;
    context.fill();
    context.restore();
  }

  private drawStrokePath(
    style: StudioLiveInkStrokeStyle,
    xs: readonly number[],
    ys: readonly number[],
    ps: readonly number[],
    terminal: boolean
  ): void {
    if (xs.length === 0) return;
    this.drawDot(style, xs[0]!, ys[0]!, ps[0]!);
    const context = this.prepared(style);
    if (!context) return;
    let fromX = xs[0]!;
    let fromY = ys[0]!;
    for (let i = 1; i < xs.length; i += 1) {
      const controlX = xs[i - 1]!;
      const controlY = ys[i - 1]!;
      const currentX = xs[i]!;
      const currentY = ys[i]!;
      const midX = (controlX + currentX) / 2;
      const midY = (controlY + currentY) / 2;
      context.beginPath();
      context.moveTo(fromX, fromY);
      context.quadraticCurveTo(controlX, controlY, midX, midY);
      context.lineWidth = pressureWidthDoc(style.strokeWidthDoc, ps[i]!);
      context.stroke();
      fromX = midX;
      fromY = midY;
    }
    if (terminal && xs.length >= 2) {
      const lastIndex = xs.length - 1;
      const lastX = xs[lastIndex]!;
      const lastY = ys[lastIndex]!;
      context.beginPath();
      context.moveTo(fromX, fromY);
      context.quadraticCurveTo(lastX, lastY, lastX, lastY);
      context.lineWidth = pressureWidthDoc(style.strokeWidthDoc, ps[lastIndex]!);
      context.stroke();
    }
    context.restore();
  }

  /** 뷰포트 이동/줌/반전 등 표면 변화 시에만 전체 재생한다(빈도 낮음). */
  private replay(): void {
    this.clearRect();
    for (const stroke of this.settled) {
      this.drawStrokePath(stroke.style, stroke.xs, stroke.ys, stroke.ps, true);
    }
    const style = this.style;
    if (!this.active || !style) return;
    // 진행 중 획은 마지막 중점까지만 확정된 상태다. terminal cap 은 end() 에서만 추가한다.
    this.drawStrokePath(style, this.keptX, this.keptY, this.keptP, false);
  }

  /** save + 문서좌표 변환 + 공통 스트로크 상태를 세팅한 컨텍스트를 돌려준다(restore 는 호출측). */
  private prepared(style: StudioLiveInkStrokeStyle): CanvasRenderingContext2D | null {
    const context = this.context;
    const surface = this.surface;
    if (!context || !surface) return null;
    const k = this.dpr * surface.documentScale;
    context.save();
    if (surface.flipX) {
      context.setTransform(
        -k,
        0,
        0,
        k,
        (surface.documentWidth * surface.documentScale - surface.left) * this.dpr,
        -surface.top * this.dpr
      );
    } else {
      context.setTransform(k, 0, 0, k, -surface.left * this.dpr, -surface.top * this.dpr);
    }
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = style.color;
    context.globalAlpha = Math.min(1, Math.max(0, style.opacity));
    return context;
  }

  private applySurface(): void {
    const canvas = this.canvas;
    const surface = this.surface;
    if (!canvas || !surface) return;
    this.dpr = Math.min(
      LIVE_INK_MAX_DPR,
      typeof globalThis.devicePixelRatio === "number" && Number.isFinite(globalThis.devicePixelRatio)
        ? Math.max(1, globalThis.devicePixelRatio)
        : 1
    );
    const width = Math.max(1, Math.round(surface.width * this.dpr));
    const height = Math.max(1, Math.round(surface.height * this.dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }

  private clearRect(): void {
    const context = this.context;
    const canvas = this.canvas;
    if (!context || !canvas) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }
}
