-- Customer-facing catalogues (PDF / web page) built from the product list.
-- Shared by the whole team: any approved staff member can create and edit them.

create table public.catalogues (
  id uuid primary key default gen_random_uuid(),
  -- Internal name (only staff see it); `title` / `subtitle` are printed on the catalogue.
  name text not null default '' check (char_length(name) <= 120),
  title text not null default '' check (char_length(title) <= 200),
  subtitle text not null default '' check (char_length(subtitle) <= 400),
  layout text not null default 'grid' check (layout in ('grid', 'feature')),
  show_cover boolean not null default true,
  show_prices boolean not null default true,
  show_colours boolean not null default true,
  hide_sold_out boolean not null default true,
  -- Chosen products, in no particular order. null = every priced product in stock.
  -- Ids of deleted products are ignored when the catalogue is built.
  product_ids uuid[],
  -- Editor filters, kept so the list looks the same next time.
  department text not null default 'All' check (department in ('All', 'Clothing', 'Shoes')),
  colour_filter text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid()
);
create index catalogues_created_idx on public.catalogues (created_at);

create trigger catalogues_set_updated_at before update on public.catalogues
  for each row execute function public.set_updated_at();

alter table public.catalogues enable row level security;

create policy "Staff read catalogues" on public.catalogues for select to authenticated using (public.is_staff());
create policy "Staff write catalogues" on public.catalogues for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
