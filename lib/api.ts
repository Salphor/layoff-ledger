import { supabase } from './supabase/client';
import { LayoffEvent, Company, Source } from './types';
import { eventSortTime } from './site';

const PUBLIC_STATUSES = ['published', 'verified'];

// Company IDs are sent in the request URL, so a few hundred UUIDs in one
// request makes the URL too long and the request fails. Fetch in small chunks.
const ID_CHUNK = 100;

async function getCompaniesByIds(ids: string[]): Promise<Record<string, Company>> {
  const map: Record<string, Company> = {};
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const { data, error } = await supabase.from('companies').select('*').in('id', chunk);
    if (error) {
      console.error('[getCompaniesByIds] query failed for chunk starting at', i, error);
      continue;
    }
    for (const c of (data || []) as Company[]) map[c.id] = c;
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

  return events.map(e => ({
    ...e,
    company: companiesMap[e.company_id] || null
  })) as LayoffEvent[];
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
  const { count: eventsCount } = await supabase
    .from('layoff_events')
    .select('*', { count: 'exact', head: true })
    .in('status', PUBLIC_STATUSES);

  const { data } = await supabase
    .from('layoff_events')
    .select('employees_affected')
    .in('status', PUBLIC_STATUSES)
    .not('employees_affected', 'is', null);

  const employeesAffected = data?.reduce((acc, curr) => acc + (curr.employees_affected || 0), 0) || 0;

  return {
    eventsTracked: eventsCount || 0,
    employeesAffected
  };
}
