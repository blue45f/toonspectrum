-- Migration 0035: Add '3d-asset' resource kind to creator marketplace
--
-- Expands the kind CHECK constraint on creator_marketplace_resource to include '3d-asset'
-- for shareable 3D model, prop, and character assets (analogous to Clip Studio's 3D ASSETS).
-- The new kind uses the same delivery modes (procedural-recipe, builtin-ref) as 'asset'
-- and '3d-preset', with runtime 'studio-3d-asset-v1'.
--
-- This migration is safe to apply with zero downtime: it only relaxes an existing constraint.

ALTER TABLE "creator_marketplace_resource"
  DROP CONSTRAINT IF EXISTS "creator_marketplace_resource_kind_check";

ALTER TABLE "creator_marketplace_resource"
  ADD CONSTRAINT "creator_marketplace_resource_kind_check"
  CHECK ("kind" IN ('asset', 'brush', 'filter', 'palette', 'template', '3d-preset', '3d-asset'));
