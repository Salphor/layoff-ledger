-- 002_event_articles.sql
-- Adds AI-generated "article" content to layoff events and a safe, public
-- view of each event's source links. Run once in the Supabase SQL editor.

-- 1. Article storage on layoff_events -------------------------------------
alter table public.layoff_events
  add column if not exists article jsonb,
  add column if not exists article_generated_at timestamptz,
  add column if not exists article_source_count integer not null default 0,
  add column if not exists article_attempts integer not null default 0;

-- 2. Public view of source links for published/verified events ------------
-- Exposes only what the website needs (publisher, title, URL, date) and keeps
-- the raw `metadata` column on `sources` private.
create or replace view public.event_source_links as
select
  es.layoff_event_id,
  s.id                         as source_id,
  s.source_key,
  s.publisher,
  s.title,
  s.url,
  s.published_at,
  s.metadata ->> 'state'       as warn_state
from public.event_sources es
join public.sources s        on s.id = es.source_id
join public.layoff_events e  on e.id = es.layoff_event_id
where e.status in ('published', 'verified');

grant select on public.event_source_links to anon, authenticated;
