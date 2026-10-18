-- Optional link to the product's item in the shop's WhatsApp Business catalogue.
-- Null = no link, so existing products are unaffected. Only the canonical form the app
-- stores is accepted (https://wa.me/p/<product id>/<phone number>; see
-- src/lib/inventory/whatsapp.ts), so malformed links and other domains are rejected here
-- whichever client writes them.
alter table public.products
  add column whatsapp_catalog_url text,
  add constraint products_whatsapp_catalog_url_format
    check (whatsapp_catalog_url ~ '^https://wa\.me/p/[0-9]{1,30}/[0-9]{6,15}$');
