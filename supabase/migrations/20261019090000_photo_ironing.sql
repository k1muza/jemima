-- Non-destructive AI ironing. The original upload and every existing edit stay
-- untouched. The accepted generated asset is stored in Cloudinary; this row
-- records its durable URL and which version is currently active.
alter table public.product_images
  add column ironed_path text unique,
  add column show_ironed boolean not null default false,
  add constraint product_images_ironed_shown_needs_file check (not show_ironed or ironed_path is not null);
