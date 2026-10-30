-- 003_company_keys.sql
-- One company per employer: a matching key that ignores case, punctuation,
-- spaces, legal endings (Inc, LLC...) and parentheses. Filled by the collector
-- (collector/company_names.py). Safe to run more than once.
alter table public.companies add column if not exists name_key text;
create index if not exists companies_name_key_idx on public.companies (name_key);
