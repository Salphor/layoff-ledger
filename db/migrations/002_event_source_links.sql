-- 002_event_source_links.sql
-- Public view of each published event's source links for the website.
-- Exposes only publisher, title, URL and date; raw scraper metadata stays private.
-- Safe to run more than once.
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
