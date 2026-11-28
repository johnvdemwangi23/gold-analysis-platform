-- Gold news: headlines gathered several times a day, with how each could move gold.
create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text not null,
  source text not null,
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  relevance integer not null default 0 check (relevance between 0 and 10),
  effect text not null default 'neutral' check (effect in ('positive', 'negative', 'neutral', 'mixed')),
  horizon text not null default 'both' check (horizon in ('short', 'long', 'both')),
  topics text[] not null default '{}',
  why text not null default ''
);

create index if not exists news_items_published_idx
  on public.news_items (published_at desc);
create index if not exists news_items_fetched_idx
  on public.news_items (fetched_at desc);

-- One row per collection run. Used to avoid running too often.
create table if not exists public.news_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  fetched integer not null default 0,
  added integer not null default 0,
  used_ai boolean not null default false,
  note text
);

create index if not exists news_runs_ran_at_idx
  on public.news_runs (ran_at desc);

-- Row level security on with no policies: only the server (service role key) can use these tables.
alter table public.news_items enable row level security;
alter table public.news_runs enable row level security;
