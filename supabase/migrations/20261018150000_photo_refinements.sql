-- Manual refinement of a background-removed photo. The cutout (cutout_path) stays
-- the untouched base; mask_path holds what was erased by hand, and refined_path
-- the result that is displayed. Both exist together, and only on top of a cutout.
alter table public.product_images
  add column refined_path text unique,
  add column mask_path text unique,
  add constraint product_images_refinement_complete check ((refined_path is null) = (mask_path is null)),
  add constraint product_images_refinement_needs_cutout check (refined_path is null or cutout_path is not null);
