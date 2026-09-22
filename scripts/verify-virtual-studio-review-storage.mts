import { mkdir } from "node:fs/promises";
import path from "node:path";

import { withStudioReviewLocalStorage } from "./studio-review-local-storage-runtime.mjs";
import { verifyStudioReviewHost } from "./verify-virtual-studio-review-host.mts";

import type { StudioReviewLocalStorage } from "./studio-review-storage-acceptance";

const output = path.resolve(process.env.STUDIO_QA_OUTPUT ?? ".qa/virtual-studio-review-storage");
await mkdir(output, { recursive: true });
await withStudioReviewLocalStorage(process.env, output, (storage: StudioReviewLocalStorage) =>
  verifyStudioReviewHost({ ...process.env, STUDIO_QA_OUTPUT: output }, storage));
