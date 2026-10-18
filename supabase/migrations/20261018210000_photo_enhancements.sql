-- Opt-in enhancement (Cloudinary e_improve) of a photo's displayed version. Each
-- version keeps its enhanced copy beside it, never replacing it: enhanced_path for
-- the original, cutout_enhanced_path / refined_enhanced_path for the background-
-- removed and hand-refined versions (both transparent PNGs). show_enhanced records
-- whether the current version is shown enhanced, so undoing never reprocesses.
alter table public.product_images
  add column enhanced_path text unique,
  add column cutout_enhanced_path text unique,
  add column refined_enhanced_path text unique,
  add column show_enhanced boolean not null default false,
  add constraint product_images_cutout_enhanced_needs_cutout check (cutout_enhanced_path is null or cutout_path is not null),
  add constraint product_images_refined_enhanced_needs_refined check (refined_enhanced_path is null or refined_path is not null);
