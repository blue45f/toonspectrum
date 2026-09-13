import { studioDraftDocumentPathname } from "../studio-document-workspace";

/** A new identity, without the old work, project or collaboration room parameters. */
export function createStudioRecoveryNewDrawingHref(): string {
  return `${studioDraftDocumentPathname(crypto.randomUUID())}?workspace=draw`;
}


export type StudioRecoveryBlockedReason = "legacy-unversioned" | "work-mismatch" | "revision-mismatch" | null;

/** Keep the notice and a refused restore consistent without duplicate startup messages. */
export function studioRecoveryDescription(reason: StudioRecoveryBlockedReason): string {
  if (reason === "revision-mismatch") return "저장된 작품과 내용이 달라요. 덮어쓰지 않고 백업 파일로 보관해 주세요.";
  if (reason === "work-mismatch") return "다른 작품의 그림이에요. 덮어쓰지 않고 백업 파일로 보관해 주세요.";
  if (reason) return "안전하게 열 수 있는지 확인하지 못했어요. 먼저 백업 파일을 받아 주세요.";
  return "이 기기에 마지막으로 그리던 그림이 남아 있어요.";
}
