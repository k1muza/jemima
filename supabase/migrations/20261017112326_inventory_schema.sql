-- Jemima's Designs inventory schema (spec §4, §8, §11).
--
-- Model: product → variants (colour + style) × sizes → inventory_skus (one row per
-- variant+size, holding quantity_on_hand). Every quantity change goes through
-- adjust_stock(), which updates the SKU and appends a stock_movements row in one
-- transaction. Money is integer cents (USD). Costs live in their own table so
-- staff without cost access never receive them.

-- ───────────────────────────── Types ─────────────────────────────

create type public.app_role as enum ('owner', 'staff', 'pending');
create type public.product_category as enum ('Clothing', 'Shoes');
create type public.product_status as enum ('draft', 'active', 'archived');
create type public.colour_status as enum ('detected', 'needs_review', 'corrected', 'unavailable');
create type public.movement_reason as enum ('initial_stock', 'restock', 'correction', 'damage', 'other');

-- ───────────────────────────── Roles & profiles ─────────────────────────────

alter table public.profiles
  add column email text,
  add column role public.app_role not null default 'pending',
  add column can_view_costs boolean not null default false,
  add column can_edit_prices boolean not null default false;

-- Existing accounts: copy emails, and make the earliest account the owner.
update public.profiles p set email = u.email from auth.users u where u.id = p.id;
update public.profiles
  set role = 'owner', can_view_costs = true, can_edit_prices = true
  where id = (select id from public.profiles order by created_at limit 1);

-- Permission helpers. SECURITY DEFINER so policies can read profiles without recursion.
create function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and role in ('owner', 'staff')
  );
$$;

create function public.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'owner');
$$;

create function public.can_view_costs()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and (role = 'owner' or (role = 'staff' and can_view_costs))
  );
$$;

create function public.can_edit_prices()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and (role = 'owner' or (role = 'staff' and can_edit_prices))
  );
$$;

-- Invitations: an account signing up with an invited email becomes staff.
create table public.staff_invites (
  email text primary key check (email ~ '^\S+@\S+\.\S+$'),
  name text not null check (char_length(trim(name)) between 1 and 120),
  can_view_costs boolean not null default false,
  can_edit_prices boolean not null default false,
  invited_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  -- Price editing implies cost visibility.
  check (not can_edit_prices or can_view_costs)
);
create unique index staff_invites_email_lower_key on public.staff_invites (lower(email));

-- Sign-up: first account → owner; invited email → staff with the invite's permissions;
-- anyone else → pending (no data access until the owner grants it).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  has_owner boolean;
  invite public.staff_invites;
begin
  select exists (select 1 from public.profiles where role = 'owner') into has_owner;
  select * into invite from public.staff_invites where lower(email) = lower(new.email);

  insert into public.profiles (id, full_name, avatar_url, email, role, can_view_costs, can_edit_prices)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), invite.name),
    new.raw_user_meta_data ->> 'avatar_url',
    new.email,
    case when not has_owner then 'owner'::public.app_role
         when invite.email is not null then 'staff'::public.app_role
         else 'pending'::public.app_role end,
    not has_owner or coalesce(invite.can_view_costs, false),
    not has_owner or coalesce(invite.can_edit_prices, false)
  );

  if invite.email is not null then
    delete from public.staff_invites where lower(email) = lower(new.email);
  end if;
  return new;
end;
$$;

-- Only the owner may change roles/permissions; the owner role can't be removed.
create function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.role, new.can_view_costs, new.can_edit_prices, new.email)
     is distinct from (old.role, old.can_view_costs, old.can_edit_prices, old.email)
     and not public.is_owner() then
    raise exception 'Only the owner can change roles and permissions' using errcode = '42501';
  end if;
  if old.role = 'owner' and new.role <> 'owner' then
    raise exception 'The owner role cannot be removed' using errcode = '42501';
  end if;
  if new.role <> 'owner' and new.can_edit_prices and not new.can_view_costs then
    new.can_view_costs := true;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

drop policy "Users can view their own profile" on public.profiles;
drop policy "Users can update their own profile" on public.profiles;

create policy "Profiles: read own, owner reads all"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id or public.is_owner());

create policy "Profiles: update own, owner updates all"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id or public.is_owner())
  with check ((select auth.uid()) = id or public.is_owner());

-- ───────────────────────────── Shop settings ─────────────────────────────

create table public.shop_settings (
  id boolean primary key default true check (id), -- single row
  shop_name text not null default 'Jemima''s Designs' check (char_length(shop_name) <= 120),
  low_stock_threshold integer not null default 3 check (low_stock_threshold between 0 and 99),
  require_note_for_corrections boolean not null default false,
  auto_detect_colours boolean not null default true,
  max_photo_mb integer not null default 15 check (max_photo_mb between 1 and 50),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.shop_settings default values;

create table public.size_templates (
  category public.product_category primary key,
  sizes text[] not null check (cardinality(sizes) between 1 and 40),
  updated_at timestamptz not null default now()
);
insert into public.size_templates (category, sizes) values
  ('Clothing', array['XS', 'S', 'M', 'L', 'XL', 'XXL']),
  ('Shoes', array['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46']);

create table public.product_types (
  category public.product_category not null,
  name text not null check (char_length(trim(name)) between 1 and 60),
  sort_order integer not null default 0,
  primary key (category, name)
);
insert into public.product_types (category, name, sort_order) values
  ('Clothing', 'Dresses', 0), ('Clothing', 'Tops', 1), ('Clothing', 'Shirts', 2), ('Clothing', 'Knitwear', 3),
  ('Clothing', 'Trousers', 4), ('Clothing', 'Skirts', 5), ('Clothing', 'Denim', 6), ('Clothing', 'Outerwear', 7),
  ('Shoes', 'Heels', 0), ('Shoes', 'Sneakers', 1), ('Shoes', 'Boots', 2), ('Shoes', 'Formal', 3),
  ('Shoes', 'Sandals', 4), ('Shoes', 'Sport', 5);

-- ───────────────────────────── Catalogue ─────────────────────────────

create sequence public.product_code_seq;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique default ('JD-' || lpad(nextval('public.product_code_seq')::text, 4, '0')),
  name text not null default '' check (char_length(name) <= 200),
  description text not null default '' check (char_length(description) <= 4000),
  category public.product_category not null default 'Clothing',
  type text not null default '' check (char_length(type) <= 60),
  sku text not null default '' check (char_length(sku) <= 40),
  status public.product_status not null default 'active',
  default_price_cents integer not null default 0 check (default_price_cents >= 0),
  low_stock_threshold integer check (low_stock_threshold between 0 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid()
);
create index products_status_created_idx on public.products (status, created_at desc);
create index products_sku_idx on public.products (upper(sku)) where sku <> '';

-- Unit cost, separated so row-level security can hide it from staff without cost access.
create table public.product_costs (
  product_id uuid primary key references public.products (id) on delete cascade,
  default_cost_cents integer not null default 0 check (default_cost_cents >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid()
);

create table public.product_sizes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 20),
  sort_order integer not null default 0
);
create unique index product_sizes_product_label_key on public.product_sizes (product_id, upper(label));

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  colour_name text not null default '' check (char_length(colour_name) <= 60),
  colour_hex text not null default '#9a948a' check (colour_hex ~ '^#[0-9a-fA-F]{6}$'),
  colour_status public.colour_status not null default 'detected',
  colour_detection_metadata jsonb not null default '{}'::jsonb,
  style_label text not null default '' check (char_length(style_label) <= 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index product_variants_product_idx on public.product_variants (product_id, sort_order);

-- One stocked item per variant + size (spec: InventorySKU). Quantity changes only via adjust_stock().
create table public.inventory_skus (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  size_id uuid not null references public.product_sizes (id) on delete cascade,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  cost_override_cents integer check (cost_override_cents >= 0),
  price_override_cents integer check (price_override_cents >= 0),
  low_stock_threshold_override integer check (low_stock_threshold_override between 0 and 99),
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (variant_id, size_id)
);
create index inventory_skus_size_idx on public.inventory_skus (size_id);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  storage_path text not null unique,
  detected_hex text check (detected_hex ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0, -- 0 = cover
  width integer,
  height integer,
  mime_type text,
  file_size integer,
  uploaded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);
create index product_images_variant_idx on public.product_images (variant_id);

-- Append-only stock history. Names are copied in so history stays readable after deletions.
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(), -- client-supplied: doubles as the idempotency key
  sku_id uuid references public.inventory_skus (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_name text not null default '',
  colour_name text not null default '',
  style_label text not null default '',
  size_label text not null,
  delta integer not null check (delta <> 0),
  quantity_before integer not null check (quantity_before >= 0),
  quantity_after integer not null check (quantity_after >= 0),
  reason public.movement_reason not null,
  note text not null default '' check (char_length(note) <= 500),
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text not null default '',
  created_at timestamptz not null default now(),
  check (quantity_after = quantity_before + delta)
);
create index stock_movements_created_idx on public.stock_movements (created_at desc);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index stock_movements_sku_idx on public.stock_movements (sku_id, created_at desc);

-- ───────────────────────────── Triggers ─────────────────────────────

create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger product_costs_set_updated_at before update on public.product_costs
  for each row execute function public.set_updated_at();
create trigger product_variants_set_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();
create trigger shop_settings_set_updated_at before update on public.shop_settings
  for each row execute function public.set_updated_at();

-- Every product gets a cost row; price changes need price permission.
create function public.products_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.product_costs (product_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger products_create_cost after insert on public.products
  for each row execute function public.products_after_insert();

create function public.guard_product_price()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.default_price_cents <> 0
      or tg_op = 'UPDATE' and new.default_price_cents is distinct from old.default_price_cents)
     and not public.can_edit_prices() then
    raise exception 'You don''t have permission to change prices' using errcode = '42501';
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
create trigger products_guard_price before insert or update on public.products
  for each row execute function public.guard_product_price();

-- Keep the variant × size grid complete: a new size or colour row gets its SKUs.
create function public.create_skus_for_variant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inventory_skus (variant_id, size_id)
  select new.id, s.id from public.product_sizes s where s.product_id = new.product_id
  on conflict do nothing;
  return new;
end;
$$;
create trigger product_variants_create_skus after insert on public.product_variants
  for each row execute function public.create_skus_for_variant();

create function public.create_skus_for_size()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inventory_skus (variant_id, size_id)
  select v.id, new.id from public.product_variants v where v.product_id = new.product_id
  on conflict do nothing;
  return new;
end;
$$;
create trigger product_sizes_create_skus after insert on public.product_sizes
  for each row execute function public.create_skus_for_size();

-- Removing a size or colour row that still holds stock records the write-off
-- (before the row goes, so names are kept), so stock never disappears silently.
-- Skipped when the whole product is being deleted (only allowed without history).
create function public.log_stock_write_off(p_variant_id uuid, p_size_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.stock_movements (
    sku_id, product_id, variant_id, product_name, colour_name, style_label, size_label,
    delta, quantity_before, quantity_after, reason, note, actor_id, actor_name
  )
  select k.id, p.id, v.id, p.name, v.colour_name, v.style_label, s.label,
         -k.quantity_on_hand, k.quantity_on_hand, 0, 'other', p_note, auth.uid(),
         coalesce((select coalesce(nullif(full_name, ''), email) from public.profiles where id = auth.uid()), '')
  from public.inventory_skus k
  join public.product_variants v on v.id = k.variant_id
  join public.product_sizes s on s.id = k.size_id
  join public.products p on p.id = v.product_id
  where k.quantity_on_hand > 0
    and (p_variant_id is null or k.variant_id = p_variant_id)
    and (p_size_id is null or k.size_id = p_size_id);
end;
$$;

create function public.product_variants_before_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_stock_write_off(old.id, null, 'Colour row removed');
  return old;
end;
$$;
create trigger product_variants_log_write_off before delete on public.product_variants
  for each row execute function public.product_variants_before_delete();

create function public.product_sizes_before_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_stock_write_off(null, old.id, 'Size removed');
  return old;
end;
$$;
create trigger product_sizes_log_write_off before delete on public.product_sizes
  for each row execute function public.product_sizes_before_delete();

-- ───────────────────────────── Functions (RPC) ─────────────────────────────

-- The only way to change a quantity. Atomic, rejects negative stock, idempotent on
-- p_movement_id, and with p_expected_before rejects a stale absolute edit (lost update).
create function public.adjust_stock(
  p_movement_id uuid,
  p_variant_id uuid,
  p_size_label text,
  p_delta integer,
  p_reason public.movement_reason,
  p_note text default '',
  p_expected_before integer default null
)
returns public.stock_movements
language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.stock_movements;
  v_variant public.product_variants;
  v_size public.product_sizes;
  v_sku public.inventory_skus;
  v_product public.products;
  v_note text := coalesce(trim(p_note), '');
  v_result public.stock_movements;
begin
  if not public.is_staff() then
    raise exception 'You don''t have access to stock' using errcode = '42501';
  end if;

  select * into v_existing from public.stock_movements where id = p_movement_id;
  if found then return v_existing; end if; -- retried request: already applied

  if p_delta is null or p_delta = 0 then
    raise exception 'Enter a whole number other than 0' using errcode = '22023';
  end if;
  if p_reason in ('correction', 'damage') and v_note = ''
     and (select require_note_for_corrections from public.shop_settings) then
    raise exception 'A note is required for corrections and damage' using errcode = '22023';
  end if;

  select * into v_variant from public.product_variants where id = p_variant_id;
  if not found then raise exception 'That colour no longer exists' using errcode = 'P0002'; end if;
  select * into v_size from public.product_sizes
    where product_id = v_variant.product_id and upper(label) = upper(trim(p_size_label));
  if not found then raise exception 'That size no longer exists' using errcode = 'P0002'; end if;

  select * into v_sku from public.inventory_skus
    where variant_id = v_variant.id and size_id = v_size.id
    for update;
  if not found then
    insert into public.inventory_skus (variant_id, size_id) values (v_variant.id, v_size.id)
    returning * into v_sku;
  end if;

  if p_expected_before is not null and v_sku.quantity_on_hand <> p_expected_before then
    raise exception 'Someone else changed this stock (now %). The latest numbers have been loaded.', v_sku.quantity_on_hand
      using errcode = '40001';
  end if;
  if v_sku.quantity_on_hand + p_delta < 0 then
    raise exception 'Only % in stock, so you can remove at most %.', v_sku.quantity_on_hand, v_sku.quantity_on_hand
      using errcode = '23514';
  end if;

  update public.inventory_skus
    set quantity_on_hand = quantity_on_hand + p_delta, version = version + 1, updated_at = now()
    where id = v_sku.id
    returning * into v_sku;

  select * into v_product from public.products where id = v_variant.product_id;
  update public.products set updated_at = now() where id = v_product.id;

  insert into public.stock_movements (
    id, sku_id, product_id, variant_id, product_name, colour_name, style_label, size_label,
    delta, quantity_before, quantity_after, reason, note, actor_id, actor_name
  ) values (
    p_movement_id, v_sku.id, v_product.id, v_variant.id, v_product.name, v_variant.colour_name,
    v_variant.style_label, v_size.label, p_delta, v_sku.quantity_on_hand - p_delta, v_sku.quantity_on_hand,
    p_reason, v_note, auth.uid(),
    coalesce((select coalesce(nullif(full_name, ''), email) from public.profiles where id = auth.uid()), '')
  )
  returning * into v_result;
  return v_result;
end;
$$;

-- Switch category: sizes follow the category's template; matching sizes keep their stock.
create function public.set_product_category(p_product_id uuid, p_category public.product_category)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  tmpl text[];
begin
  select sizes into tmpl from public.size_templates where category = p_category;
  update public.products set category = p_category where id = p_product_id;
  delete from public.product_sizes
    where product_id = p_product_id
      and upper(label) <> all (select upper(x) from unnest(tmpl) as x);
  insert into public.product_sizes (product_id, label, sort_order)
    select p_product_id, t.label, t.ord - 1 from unnest(tmpl) with ordinality as t(label, ord)
    on conflict (product_id, (upper(label))) do update set sort_order = excluded.sort_order;
end;
$$;

-- Delete a product, or archive it if it has stock history (history is never destroyed).
create function public.delete_or_archive_product(p_product_id uuid)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.stock_movements where product_id = p_product_id) then
    update public.products set status = 'archived' where id = p_product_id;
    return 'archived';
  end if;
  delete from public.products where id = p_product_id;
  return 'deleted';
end;
$$;

-- ───────────────────────────── Row-level security ─────────────────────────────

alter table public.staff_invites enable row level security;
alter table public.shop_settings enable row level security;
alter table public.size_templates enable row level security;
alter table public.product_types enable row level security;
alter table public.products enable row level security;
alter table public.product_costs enable row level security;
alter table public.product_sizes enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory_skus enable row level security;
alter table public.product_images enable row level security;
alter table public.stock_movements enable row level security;

-- Settings & reference data: staff read, owner writes.
create policy "Staff read settings" on public.shop_settings for select to authenticated using (public.is_staff());
create policy "Owner updates settings" on public.shop_settings for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy "Staff read size templates" on public.size_templates for select to authenticated using (public.is_staff());
create policy "Owner writes size templates" on public.size_templates for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy "Staff read product types" on public.product_types for select to authenticated using (public.is_staff());
create policy "Owner writes product types" on public.product_types for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy "Owner manages invites" on public.staff_invites for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Catalogue: staff create/edit; price changes are additionally guarded by trigger.
create policy "Staff read products" on public.products for select to authenticated using (public.is_staff());
create policy "Staff create products" on public.products for insert to authenticated with check (public.is_staff());
create policy "Staff update products" on public.products for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "Staff delete products" on public.products for delete to authenticated using (public.is_staff());

create policy "Cost viewers read costs" on public.product_costs for select to authenticated using (public.can_view_costs());
create policy "Price editors update costs" on public.product_costs for update to authenticated
  using (public.can_edit_prices()) with check (public.can_edit_prices());

create policy "Staff read sizes" on public.product_sizes for select to authenticated using (public.is_staff());
create policy "Staff write sizes" on public.product_sizes for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "Staff read variants" on public.product_variants for select to authenticated using (public.is_staff());
create policy "Staff write variants" on public.product_variants for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Quantities are read-only to clients; adjust_stock() is the only writer.
create policy "Staff read stock" on public.inventory_skus for select to authenticated using (public.is_staff());

create policy "Staff read images" on public.product_images for select to authenticated using (public.is_staff());
create policy "Staff write images" on public.product_images for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- History: readable, never writable directly.
create policy "Staff read stock history" on public.stock_movements for select to authenticated using (public.is_staff());
revoke insert, update, delete, truncate on public.stock_movements from anon, authenticated;
revoke insert, update, delete, truncate on public.inventory_skus from anon, authenticated;

revoke execute on function public.log_stock_write_off(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.adjust_stock(uuid, uuid, text, integer, public.movement_reason, text, integer) from public, anon;
grant execute on function public.adjust_stock(uuid, uuid, text, integer, public.movement_reason, text, integer) to authenticated;
revoke execute on function public.set_product_category(uuid, public.product_category) from public, anon;
grant execute on function public.set_product_category(uuid, public.product_category) to authenticated;
revoke execute on function public.delete_or_archive_product(uuid) from public, anon;
grant execute on function public.delete_or_archive_product(uuid) to authenticated;

-- ───────────────────────────── Photo storage ─────────────────────────────

-- Private bucket; the app shows photos through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', false, 52428800, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Staff read product images"
  on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and public.is_staff());
create policy "Staff upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_staff());
create policy "Staff replace product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_staff());
create policy "Staff delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_staff());
