import fs from 'node:fs';
const file = 'src/domains/creator/live/studio-live-retained-media-overlay.ts';
let text = fs.readFileSync(file, 'utf8');
function replace(before, after) {
  if (text.split(before).length !== 2) throw new Error(`Expected exactly one reviewed anchor: ${before.slice(0, 120)}`);
  text = text.replace(before, after);
}
replace('import { paintStudioLiveRetainedRoundStroke } from "./studio-live-retained-stroke-paint";',
'import { paintStudioLiveRetainedRoundStroke } from "./studio-live-retained-stroke-paint";\nimport { StudioLiveTransientTip } from "./studio-live-transient-tip";');
replace('  pencilProgram?: StudioLivePencilPaintCommand[];','  pencilProgram?: StudioLivePencilPaintCommand[];\n  /** Only the moving caps; these are never appended to the durable pigment program. */\n  pencilTip?: StudioLivePencilPaintCommand[];');
replace('  private active: ActiveRetainedStroke | null = null;', '  private active: ActiveRetainedStroke | null = null;\n  private readonly pencilTip = new StudioLiveTransientTip();');
replace('    this.activeCanvas = canvases?.activeCanvas ?? null;', '    this.pencilTip.discard(true);\n    this.activeCanvas = canvases?.activeCanvas ?? null;');
const start = text.indexOf('  private paintPencilSuffix(');
const body = text.indexOf('    try {\n', start);
text = text.slice(0, body) + text.slice(body).replace('    try {\n', '    try {\n      if (target === this.activeContext && this.activeCanvas) {\n        this.pencilTip.restore(this.activeCanvas, context);\n      }\n      active.pencilTip = [];\n');
replace('            if (cap.role === "end" && !finalize) continue;', `            if (cap.role === "end" && !finalize) {
              if (target === this.activeContext) {
                const rung = studioPencilRibbonAlphaBucket(Math.min(
                  1, pass.opacityScale * Math.sqrt(cap.opacityScale * cap.flowScale),
                ));
                if (rung > 0) active.pencilTip!.push({
                  kind: "fill", coordinates: cap.points, color: element.stroke,
                  alpha: inherited * (element.opacity ?? 1)
                    * (rung / STUDIO_PENCIL_RIBBON_ALPHA_BUCKET_COUNT),
                });
              }
              continue;
            }`);
replace('      active.paintedSourceSegments = curve.segments.length;\n      active.paintedPencilMarks = Math.max(active.paintedPencilMarks, paintedCells + 1);',
`      if (!finalize && target === this.activeContext) this.showPencilTip(active, context);
      active.paintedSourceSegments = curve.segments.length;
      active.paintedPencilMarks = Math.max(active.paintedPencilMarks, paintedCells + 1);`);
replace('      this.replayPencilProgram(this.active.pencilProgram, this.activeContext);\n      return;',
`      this.replayPencilProgram(this.active.pencilProgram, this.activeContext);
      const context = this.prepared(this.activeContext);
      if (context) {
        try { this.showPencilTip(this.active, context); } finally { context.restore(); }
      }
      return;`);
replace('  private replayPencilProgram(\n', `  private showPencilTip(active: ActiveRetainedStroke, context: CanvasRenderingContext2D): void {
    const canvas = this.activeCanvas;
    const commands = active.pencilTip;
    if (!canvas || !commands?.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const command of commands) {
      if (command.kind !== "fill") continue;
      for (let i = 0; i + 1 < command.coordinates.length; i += 2) {
        const x = command.coordinates[i]!;
        const y = command.coordinates[i + 1]!;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
    this.pencilTip.show(canvas, context, { minX, minY, maxX, maxY }, () => {
      paintStudioLivePencilProgram(context, commands);
    });
  }

  private replayPencilProgram(
`);
replace('  private resetActiveState(): void {\n    this.clearCapRepaintWake();',
'  private resetActiveState(): void {\n    this.pencilTip.discard(true);\n    this.clearCapRepaintWake();');
replace('  private clearActiveRect(): void {\n    this.clearCanvas(this.activeContext, this.activeCanvas);',
'  private clearActiveRect(): void {\n    this.pencilTip.discard();\n    this.clearCanvas(this.activeContext, this.activeCanvas);');
fs.writeFileSync(file, text);
console.log('Applied exact reviewed moving-tip integration anchors');
