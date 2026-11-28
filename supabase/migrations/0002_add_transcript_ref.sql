-- Gives every saved transcript a random reference such as GT-7K3M9Q.
-- Pattern: GT- plus 6 characters from A-Z (no I, L, O) and 2-9.
alter table public.analyses add column if not exists ref text;

-- Existing rows get a reference too (made from random characters).
update public.analyses
set ref = 'GT-' || (
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), ''
  )
  from generate_series(1, 6)
  where analyses.id is not null
)
where ref is null;

create unique index if not exists analyses_ref_idx on public.analyses (ref);

alter table public.analyses
  drop constraint if exists analyses_ref_format;
alter table public.analyses
  add constraint analyses_ref_format
  check (ref is null or ref ~ '^GT-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$');
