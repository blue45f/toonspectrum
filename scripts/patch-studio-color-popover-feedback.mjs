import { readFile, writeFile } from "node:fs/promises";

const target = "apps/web/src/domains/creator/StudioColorPopover.tsx";
let source = await readFile(target, "utf8");

function replaceOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: source pattern not found`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: source pattern is ambiguous`);
  }
  source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

replaceOnce(
  "lucide imports",
  String.raw`import { Check, Copy, Pipette, Plus, X } from "lucide-react";`,
  String.raw`import { Check, Copy, Pipette, Plus, TriangleAlert, X } from "lucide-react";`,
);

replaceOnce(
  "copy feedback import",
  String.raw`import { getProductStudioPaletteSqliteRepository } from "./studio-palette-sqlite-repository";`,
  String.raw`import { getProductStudioPaletteSqliteRepository } from "./studio-palette-sqlite-repository";
import { useStudioCopyFeedback } from "./use-studio-copy-feedback";`,
);

replaceOnce(
  "feedback state",
  String.raw`  const [initialColor] = useState(value);
  const [copied, setCopied] = useState(false);
  const [addedNotice, setAddedNotice] = useState<string | null>(null);`,
  String.raw`  const [initialColor] = useState(value);
  const [addedNotice, setAddedNotice] = useState<{
    kind: "saved" | "failed";
    message: string;
  } | null>(null);`,
);

replaceOnce(
  "feedback refs",
  String.raw`  const hexInputRef = useRef<HTMLInputElement>(null);`,
  String.raw`  const hexInputRef = useRef<HTMLInputElement>(null);
  const paletteSaveMountedRef = useRef(true);
  const paletteSaveRequestRef = useRef(0);
  const copyFeedback = useStudioCopyFeedback(1500);
  const copyStatus = copyFeedback.statusFor("color-hex");`,
);

replaceOnce(
  "save lifecycle guard",
  String.raw`  useEffect(() => {
    setHexDraft(value);
  }, [value]);`,
  String.raw`  useEffect(() => {
    setHexDraft(value);
  }, [value]);

  useEffect(() => {
    paletteSaveMountedRef.current = true;
    return () => {
      paletteSaveMountedRef.current = false;
      paletteSaveRequestRef.current += 1;
    };
  }, []);`,
);

replaceOnce(
  "copy and save handlers",
  String.raw`  const handleCopyHex = () => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  const handleSavePaletteToLibrary = async (name: string, colors: string[]) => {
    try {
      const repo = getProductStudioPaletteSqliteRepository();
      const newPalette: StudioNamedPalette = createPalette(name, colors);
      await repo.save(newPalette);
      setAddedNotice("팔레트 라이브러리에 저장됨!");
      setTimeout(() => setAddedNotice(null), 2000);
    } catch {
      setAddedNotice("저장 완료");
      setTimeout(() => setAddedNotice(null), 2000);
    }
  };`,
  String.raw`  const handleCopyHex = () => {
    copyFeedback.copy("color-hex", value);
  };

  const handleSavePaletteToLibrary = async (name: string, colors: string[]) => {
    const request = paletteSaveRequestRef.current + 1;
    paletteSaveRequestRef.current = request;
    setAddedNotice(null);

    try {
      const repo = getProductStudioPaletteSqliteRepository();
      const newPalette: StudioNamedPalette = createPalette(name, colors);
      await repo.save(newPalette);
      if (!paletteSaveMountedRef.current || paletteSaveRequestRef.current !== request) return;
      setAddedNotice({
        kind: "saved",
        message: "팔레트 라이브러리에 저장됐어요.",
      });
    } catch {
      if (!paletteSaveMountedRef.current || paletteSaveRequestRef.current !== request) return;
      setAddedNotice({
        kind: "failed",
        message: "팔레트 저장에 실패했어요. 다시 시도해 주세요.",
      });
    }
  };`,
);

replaceOnce(
  "copy button feedback",
  String.raw`            <button
              type="button"
              aria-label="색상 코드 복사"
              onClick={handleCopyHex}
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-card/80 text-fg-2 hover:bg-raised hover:text-fg active:scale-95 shadow-sm transition-transform"
            >
              {copied ? <Check className="size-3.5 text-good" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            </button>`,
  String.raw`            <button
              type="button"
              aria-label={
                copyStatus === "copied"
                  ? "색상 코드 복사 완료"
                  : copyStatus === "failed"
                    ? "색상 코드 복사 실패"
                    : "색상 코드 복사"
              }
              onClick={handleCopyHex}
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-card/80 text-fg-2 hover:bg-raised hover:text-fg active:scale-95 shadow-sm transition-transform"
            >
              {copyStatus === "copied" ? (
                <Check className="size-3.5 text-good" aria-hidden />
              ) : copyStatus === "failed" ? (
                <TriangleAlert className="size-3.5 text-bad" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
            </button>`,
);

replaceOnce(
  "save notice feedback",
  String.raw`          {addedNotice && (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-good/15 border border-good/30 px-2.5 py-1 text-[0.62rem] font-semibold text-good">
              <Check className="size-3" aria-hidden /> {addedNotice}
            </div>
          )}`,
  String.raw`          {addedNotice && (
            <div
              role="status"
              aria-live="polite"
              className={cx(
                "mt-2 flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.62rem] font-semibold",
                addedNotice.kind === "saved"
                  ? "border-good/30 bg-good/15 text-good"
                  : "border-bad/30 bg-bad/15 text-bad"
              )}
            >
              {addedNotice.kind === "saved" ? (
                <Check className="size-3" aria-hidden />
              ) : (
                <TriangleAlert className="size-3" aria-hidden />
              )}
              <span>{addedNotice.message}</span>
            </div>
          )}`,
);

await writeFile(target, source, "utf8");
console.log(`Patched ${target}`);
