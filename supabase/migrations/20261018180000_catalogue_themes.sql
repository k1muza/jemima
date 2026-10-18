-- The catalogue's visual design, independent of its page layout (grid / one per page).
alter table public.catalogues
  add column theme text not null default 'classic'
    check (theme in ('classic', 'atelier', 'lookbook', 'boutique'));
