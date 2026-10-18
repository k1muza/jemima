-- When a photo row last changed. Every file overwrite (rotate, cutout,
-- refinement, enhancement) also updates the row, so browsers use this to tell
-- when a saved signed link may point at an outdated file.
alter table public.product_images
  add column updated_at timestamptz not null default now();

create trigger product_images_set_updated_at before update on public.product_images
  for each row execute function public.set_updated_at();
