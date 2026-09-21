import { z } from "zod";
import { studioWorldManifestSchema } from "@toonspectrum/studio-project-model/world-publication";

// Only Web imports/exports a reusable package. Keep its metadata out of shared Studio runtime closure.
const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/iu);
const label = z.string().trim().min(1).max(160);

/** Portable data only. The author statement is a claim, never a verified license grant. */
export const studioWorldTemplatePackageSchema = z.object({
  contract: z.literal("studio-world-template-package-v1"), packageId: id,
  packageVersion: z.string().regex(/^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$/u),
  title: label, description: z.string().trim().max(2000), createdAt: z.iso.datetime({ offset: true }),
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/u),
  rights: z.object({ author: label, statement: z.string().trim().min(1).max(4000),
    sourceUrl: z.string().max(2048).url().refine((value) => {
      const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password;
    }).optional() }).strict(),
  manifest: studioWorldManifestSchema,
}).strict().superRefine((value, ctx) => {
  if (!value.manifest.assetIntegrity) ctx.addIssue({ code: "custom", message: "Reusable packages require exact image digests" });
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 2 * 1024 * 1024 + 8192) ctx.addIssue({ code: "custom", message: "World package exceeds budget" });
});
export type StudioWorldTemplatePackage = z.infer<typeof studioWorldTemplatePackageSchema>;
