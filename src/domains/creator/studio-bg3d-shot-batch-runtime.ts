/**
 * User-triggered runtime for durable 3D shot production.
 *
 * Keep this module behind one analyzable dynamic import. Opening the interactive 3D editor should
 * not eagerly load archive verification, IndexedDB recovery, PSD, contact-sheet, or ZIP workers.
 */

export {
  STUDIO_BG3D_SHOT_BATCH_APP_IMPLEMENTATION_PROFILE_V1,
  STUDIO_BG3D_SHOT_BATCH_MAX_IMAGE_BYTES,
  STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES,
  buildStudioBg3dShotBatchArchive,
  projectStudioBg3dShotBatchPlanForPublicArchive,
} from "./studio-bg3d-shot-batch";
export { commitStudioBg3dShotBatchDownload } from "./studio-bg3d-shot-batch-download-gate";
export {
  STUDIO_BG3D_SHOT_BATCH_LT_PIPELINE_V1,
  STUDIO_BG3D_SHOT_BATCH_PNG_ENCODING_V1,
  STUDIO_BG3D_SHOT_BATCH_PSD_ENCODING_V1,
  createStudioBg3dShotBatchPlan,
} from "./studio-bg3d-shot-batch-plan";
export {
  studioBg3dShotBatchQueueCompletedCount,
  waitForStudioBg3dBatchDocumentVisible,
} from "./studio-bg3d-shot-batch-queue";
export {
  STUDIO_BG3D_SHOT_BATCH_RECOVERY_AUTHORIZATION_RECEIPT_MAX_TTL_MS,
  StudioBg3dShotBatchRecoveryError,
  createStudioBg3dShotBatchRecoveryStore,
} from "./studio-bg3d-shot-batch-recovery-store";
export {
  buildStudioBg3dShotBatchArchiveInWorker,
  isStudioBg3dShotBatchWorkerUnavailableError,
} from "./studio-bg3d-shot-batch-worker-client";
export { buildStudioBg3dShotContactSheetsInWorker } from "./studio-bg3d-shot-contact-sheet-worker-client";
export { admitStudioBg3dShotPsdLayers } from "./studio-bg3d-shot-psd-contract";
export { buildStudioBg3dShotLayeredPsdInWorker } from "./studio-bg3d-shot-psd-worker-client";
