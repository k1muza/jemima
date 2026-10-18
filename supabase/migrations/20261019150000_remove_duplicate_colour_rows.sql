-- Remove duplicate colour rows left behind by "Its own colour".
--
-- Moving a photo into its own colour row used to leave the row it came from in
-- place, even with no photos and no stock, so repeated clicks piled up identical
-- rows ("Chocolate" five times). The app now drops such a row as the photo
-- leaves; this clears the ones already saved.
--
-- A row is removed only when all of these hold:
--   * another row of the same product has the same colour name and style
--     (ignoring case and surrounding spaces),
--   * no photo belongs to it,
--   * it holds no stock (so no write-off is logged and no units disappear),
--   * it isn't the one row kept from its group: rows with photos or stock are
--     kept first, then the earliest.
-- Stock history keeps its copied names; its link to the row is set to null.

with ranked as (
  select
    v.id,
    exists (select 1 from public.product_images i where i.variant_id = v.id) as has_photo,
    coalesce((select sum(k.quantity_on_hand) from public.inventory_skus k where k.variant_id = v.id), 0) > 0 as has_stock,
    row_number() over (
      partition by v.product_id, lower(trim(v.colour_name)), lower(trim(v.style_label))
      order by
        exists (select 1 from public.product_images i where i.variant_id = v.id) desc,
        coalesce((select sum(k.quantity_on_hand) from public.inventory_skus k where k.variant_id = v.id), 0) desc,
        v.sort_order,
        v.created_at,
        v.id
    ) as rank
  from public.product_variants v
)
delete from public.product_variants v
using ranked r
where v.id = r.id
  and r.rank > 1
  and not r.has_photo
  and not r.has_stock;
