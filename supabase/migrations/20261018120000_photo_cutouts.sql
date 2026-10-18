-- Opt-in background removal: a processed copy (transparent PNG) stored beside the
-- original, which is never overwritten. show_cutout records which version to display.
alter table public.product_images
  add column cutout_path text unique,
  add column show_cutout boolean not null default false,
  add constraint product_images_cutout_shown_needs_file check (not show_cutout or cutout_path is not null);
