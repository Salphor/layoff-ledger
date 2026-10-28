-- Run in Supabase: SQL Editor. Read-only; changes nothing.

-- 1) How many WARN sources we have per state, and how recent they are.
select source_key, count(*) as sources, min(published_at) as oldest, max(published_at) as newest
from public.sources
where source_key like 'warn-%'
group by source_key
order by source_key;

-- 2) The column names each state's rows actually arrived with (one example per state).
select distinct on (source_key) source_key, jsonb_object_keys_list
from (
  select source_key, id,
         (select array_agg(k) from jsonb_object_keys(metadata->'raw_row') as k) as jsonb_object_keys_list
  from public.sources
  where source_key like 'warn-%' and metadata ? 'raw_row'
) t
order by source_key, id desc;
