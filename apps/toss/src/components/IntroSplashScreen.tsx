import { useEffect, useRef, useState } from "react";

interface CutFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  alpha: number;
  scale: number;
  vx: number;
  vy: number;
  color: string;
}

export default function IntroSplashScreen() {
  const [isVisible, setIsVisible] = useState(true);
  const [isFading, setIsFading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setIsFading(true), 2000);
    const destroyTimer = setTimeout(() => setIsVisible(false), 2700);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(destroyTimer);
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const frames: CutFrame[] = [];
    const colors = [
      "rgba(249, 115, 22, ", // Orange
      "rgba(168, 85, 247, ", // Purple
      "rgba(234, 179, 8, ", // Yellow
    ];

    // Create comic cut frames
    for (let i = 0; i < 25; i++) {
      frames.push({
        x: Math.random() * width, // NOSONAR S2245 비암호화 용도(시각효과/ID 생성)
        y: Math.random() * height, // NOSONAR S2245 비암호화 용도(시각효과/ID 생성)
        w: Math.random() * 80 + 40, // NOSONAR S2245 비암호화 용도(시각효과/ID 생성)
        h: Math.random() * 110 + 60, // NOSONAR S2245 비암호화 용도(시각효과/ID 생성)
        alpha: Math.random() * 0.4 + 0.15, // NOSONAR S2245 비암호화 용도(시각효과/ID 생성)
        scale: Math.random() * 0.5 + 0.5, // NOSONAR S2245 비암호화 용도(시각효과/ID 생성)
        vx: (Math.random() - 0.5) * 0.8, // NOSONAR S2245 비암호화 용도(시각효과/ID 생성)
        vy: (Math.random() - 0.5) * 0.8, // NOSONAR S2245 비암호화 용도(시각효과/ID 생성)
        color: colors[Math.floor(Math.random() * colors.length)] ?? colors[0]!, // NOSONAR S2245 비암호화 용도(시각효과/ID 생성)
      });
    }

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    let frameCount = 0;
    const render = () => {
      frameCount++;
      ctx.fillStyle = "#0f0a1c"; // Deep purple dark theme
      ctx.fillRect(0, 0, width, height);

      // Draw frames
      frames.forEach((f) => {
        if (!f) return;
        f.x += f.vx;
        f.y += f.vy;

        // Wrap around boundaries
        if (f.x < -f.w) f.x = width;
        if (f.x > width) f.x = -f.w;
        if (f.y < -f.h) f.y = height;
        if (f.y > height) f.y = -f.h;

        const currentScale = f.scale + Math.sin(frameCount * 0.04) * 0.05;
        const curW = f.w * currentScale;
        const curH = f.h * currentScale;

        ctx.strokeStyle = f.color + f.alpha + ")";
        ctx.lineWidth = 2;
        ctx.strokeRect(f.x, f.y, curW, curH);

        // Comic diagonal line design within frame
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x + curW * 0.3, f.y);
        ctx.strokeStyle = f.color + f.alpha * 0.3 + ")";
        ctx.stroke();
      });

      // Main title - WEBTOON INDEX
      const text = "WEBTOON INDEX";
      ctx.font = "900 24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.letterSpacing = "5px";
      ctx.fillStyle = "#ffffff";

      // Shadow glow
      ctx.shadowBlur = 12;
      ctx.shadowColor = "rgba(249, 115, 22, 0.6)";

      const progress = Math.min(frameCount / 40, 1);
      const currentText = text.substring(0, Math.floor(text.length * progress));
      ctx.fillText(currentText, width / 2, height / 2);
      ctx.shadowBlur = 0;

      // Sub
      ctx.font = "500 10px monospace";
      ctx.letterSpacing = "2px";
      ctx.fillStyle = "rgba(249, 115, 22, 0.8)";
      ctx.fillText("TOSS IN-APP MINIWEB", width / 2, height / 2 + 32);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f0a1c",
        opacity: isFading ? 0 : 1,
        transition: "opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
        pointerEvents: isFading ? "none" : "auto",
      }}
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
