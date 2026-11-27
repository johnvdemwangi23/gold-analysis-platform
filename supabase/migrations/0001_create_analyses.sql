-- Stores each transcript analysis so it can be reopened later.
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  source text not null,
  source_url text,
  transcript text not null,
  analysis jsonb not null,
  bias text not null check (bias in ('bullish', 'bearish', 'neutral', 'mixed')),
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  headline text not null
);

create index if not exists analyses_created_at_idx
  on public.analyses (created_at desc);

-- Row level security on with no policies: the public (anon) key cannot read or
-- write this table. Only the server, using the service role key, can.
alter table public.analyses enable row level security;
