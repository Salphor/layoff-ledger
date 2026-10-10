import { supabase } from './supabase/client';
import { LayoffEvent, Company } from './types';

const PUBLIC_STATUSES = ['published', 'verified'];

export async function getLatestLayoffs(limit = 50): Promise<LayoffEvent[]> {
  const { data: events, error } = await supabase
    .from('layoff_events')
    .select('*')
    .in('status', PUBLIC_STATUSES)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  if (!events || events.length === 0) return [];

  const companyIds = Array.from(new Set(events.map(e => e.company_id).filter(Boolean)));
  let companiesMap: Record<string, Company> = {};
  
  if (companyIds.length > 0) {
    const { data: companies } = await supabase
      .from('companies')
      .select('*')
      .in('id', companyIds);

    if (companies) {
      companiesMap = companies.reduce((acc, c) => {
        acc[c.id] = c;
        return acc;
      }, {} as Record<string, Company>);
    }
  }

  const fullEvents = events.map(e => ({
    ...e,
    company: companiesMap[e.company_id] || null
  })) as LayoffEvent[];

  return fullEvents.sort((a, b) => {
    const dateA = new Date(a.date_announced || a.notice_date || a.created_at).getTime();
    const dateB = new Date(b.date_announced || b.notice_date || b.created_at).getTime();
    return dateB - dateA;
  });
}

export async function getCompanyBySlug(slug: string): Promise<Company | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) return null;
  return data;
}

export async function getCompanyEvents(companyId: string): Promise<LayoffEvent[]> {
  const { data: events, error } = await supabase
    .from('layoff_events')
    .select('*')
    .eq('company_id', companyId)
    .in('status', PUBLIC_STATUSES)
    .order('created_at', { ascending: false });

  if (error || !events || events.length === 0) return [];

  return events.map(event => ({
    ...event,
    sources: []
  })) as LayoffEvent[];
}

export async function getRadarStats() {
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