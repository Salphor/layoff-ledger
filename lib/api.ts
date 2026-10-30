import { cache } from 'react';
import { supabase } from './supabase/client';
import { LayoffEvent, Company, Source, DirectoryCompany } from './types';
import { assignEventSlugs, eventHref, eventSortTime, slugDate } from './site';

const PUBLIC_STATUSES = ['published', 'verified'];

// Company IDs are sent in the request URL, so a few hundred UUIDs in one
// request makes the URL too long and the request fails. Fetch in small chunks.
const ID_CHUNK = 100;

async function getCompaniesByIds(ids: string[]): Promise<Record<string, Company>> {
  const map: Record<string, Company> = {};
  const starts: number[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) starts.push(i);

  // Up to 6 requests at a time (the A-Z directory can need dozens).
  for (let g = 0; g < starts.length; g += 6) {
    await Promise.all(
      starts.slice(g, g + 6).map(async (i) => {
        const chunk = ids.slice(i, i + ID_CHUNK);
        const { data, error } = await supabase
          .from('companies')
          .select('*')
          .in('id', chunk);
        if (error) {
          console.error('[getCompaniesByIds] query failed for chunk starting at', i, error);
          return;
        }
        for (const c of (data || []) as Company[]) map[c.id] = c;
      })
    );
  }
  return map;
}

export async function getLatestLayoffs(limit = 50): Promise<LayoffEvent[]> {
  // Rank events by the date the layoff was announced, NOT by when our pipeline
  // happened to process them. Two queries because events without an
  // announcement date fall back to created_at; merging the two top-N lists
  // gives the exact overall top N.
  const [dated, undated] = await Promise.all([
    supabase
      .from('layoff_events')
      .select('*')
      .in('status', PUBLIC_STATUSES)
      .not('date_announced', 'is', null)
      .order('date_announced', { ascending: false })
      .limit(limit),
    supabase
      .from('layoff_events')
      .select('*')
      .in('status', PUBLIC_STATUSES)
      .is('date_announced', null)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  if (dated.error) throw dated.error;
  if (undated.error) throw undated.error;

  const events = [...(dated.data || []), ...(undated.data || [])]
    .sort((x, y) => eventSortTime(y) - eventSortTime(x))
    .slice(0, limit);
  if (events.length === 0) return [];

  const companyIds = Array.from(new Set(events.map(e => e.company_id).filter(Boolean)));
  const companiesMap = await getCompaniesByIds(companyIds);

  const slugs = await getEventSlugMap();

  return events.map(e => {
    const company = companiesMap[e.company_id] || null;
    return {
      ...e,
      company,
      event_path: eventHref(company, slugs[e.id]),
    };
  }) as LayoffEvent[];
}

export async function getCompanyBySlug(slug: string): Promise<Company | null> {
  // Try the slug as received and in decoded form (slugs can contain "(", ")" or "&").
  let decoded = slug;
  try { decoded = decodeURIComponent(slug); } catch {}
  const candidates = Array.from(new Set([slug, decoded]));

  // .limit(1) instead of .single(): .single() errors if two companies ever share a slug.
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .in('slug', candidates)
    .limit(1);

  if (error) {
    console.error('[getCompanyBySlug] query failed for slug', JSON.stringify(slug), error);
    return null;
  }
  if (!data || data.length === 0) {
    console.error('[getCompanyBySlug] no company found for slug', JSON.stringify(slug));
    return null;
  }
  return data[0] as Company;
}

// Source links for a set of events, from the public `event_source_links` view
// (created by db/migrations/002_event_articles.sql).
async function getSourcesForEvents(eventIds: string[]): Promise<Record<string, Source[]>> {
  if (eventIds.length === 0) return {};
  const byEvent: Record<string, Source[]> = {};
  for (let i = 0; i < eventIds.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from('event_source_links')
      .select('*')
      .in('layoff_event_id', eventIds.slice(i, i + ID_CHUNK));

    if (error) {
      console.error('[getSourcesForEvents] query failed', error);
      continue;
    }
    for (const row of (data || []) as Source[]) {
      (byEvent[row.layoff_event_id] ||= []).push(row);
    }
  }
  return byEvent;
}

// All public events for a company, newest first, each with its source links.
export async function getCompanyEvents(companyId: string): Promise<LayoffEvent[]> {
  const { data: events, error } = await supabase
    .from('layoff_events')
    .select('*')
    .eq('company_id', companyId)
    .in('status', PUBLIC_STATUSES);

  if (error) {
    console.error('[getCompanyEvents] query failed for company', companyId, error);
    return [];
  }
  if (!events || events.length === 0) {
    console.error('[getCompanyEvents] no published events for company', companyId);
    return [];
  }

  const sorted = [...events].sort((a, b) => eventSortTime(b) - eventSortTime(a));
  const sourcesByEvent = await getSourcesForEvents(sorted.map((e) => e.id));

  return sorted.map((event) => ({
    ...event,
    sources: sourcesByEvent[event.id] || [],
  })) as LayoffEvent[];
}

export async function getSiteStats() {
  // Supabase returns at most 1,000 rows per request, so summing worker counts
  // from a single query undercounted once there were more events. The event
  // index below is read in pages and already includes the counts.
  const index = await getEventIndex();
  const employeesAffected = index.reduce(
    (acc, e) => acc + (e.employees_affected && e.employees_affected > 0 ? e.employees_affected : 0),
    0
  );

  return {
    eventsTracked: index.length,
    employeesAffected,
  };
}

// ---------------------------------------------------------------------------
// Lightweight index of every public event (no summaries), used to build
// event URLs and the A-Z company directory. Supabase returns at most 1,000
// rows per request, so read it in pages.

interface IndexRow {
  id: string;
  company_id: string;
  date_announced: string | null;
  notice_date: string | null;
  created_at: string;
  employees_affected: number | null;
  locations: string[] | string | null;
}

const PAGE = 1000;

export const getEventIndex = cache(async (): Promise<IndexRow[]> => {
  const rows: IndexRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('layoff_events')
      .select('id,company_id,date_announced,notice_date,created_at,employees_affected,locations')
      .in('status', PUBLIC_STATUSES)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('[getEventIndex] query failed at row', from, error);
      break;
    }
    rows.push(...((data || []) as IndexRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
});

// event id -> event slug ("october-2026"), computed per company.
export const getEventSlugMap = cache(async (): Promise<Record<string, string>> => {
  const byCompany = new Map<string, IndexRow[]>();
  for (const r of await getEventIndex()) {
    if (!r.company_id) continue;
    const list = byCompany.get(r.company_id) || [];
    list.push(r);
    byCompany.set(r.company_id, list);
  }
  const out: Record<string, string> = {};
  byCompany.forEach((list) => Object.assign(out, assignEventSlugs(list)));
  return out;
});

// Every company with at least one public event, A-Z.
export async function getCompanyDirectory(): Promise<DirectoryCompany[]> {
  const stats = new Map<string, { events: number; latest: number; workers: number }>();
  for (const r of await getEventIndex()) {
    if (!r.company_id) continue;
    const s = stats.get(r.company_id) || { events: 0, latest: 0, workers: 0 };
    s.events += 1;
    const t = slugDate(r).getTime();
    if (!isNaN(t) && t > s.latest) s.latest = t;
    s.workers += r.employees_affected && r.employees_affected > 0 ? r.employees_affected : 0;
    stats.set(r.company_id, s);
  }
  if (stats.size === 0) return [];

  const companies = await getCompaniesByIds(Array.from(stats.keys()));
  const out: DirectoryCompany[] = [];
  stats.forEach((s, id) => {
    const c = companies[id];
    if (!c?.slug || !c.canonical_name) return;
    out.push({
      id,
      name: c.canonical_name,
      slug: c.slug,
      events: s.events,
      latest: s.latest ? new Date(s.latest).toISOString() : null,
      workers: s.workers,
    });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }));
}
