export interface Company {
  id: string;
  canonical_name: string;
  slug: string;
  website_domain: string | null;
}

// One row of the public `event_source_links` view.
export interface Source {
  layoff_event_id: string;
  source_id: string;
  source_key: string | null;
  publisher: string | null;
  title: string | null;
  url: string | null;
  published_at: string | null;
  warn_state: string | null;
}

export interface LayoffEvent {
  id: string;
  company_id: string;
  event_slug: string;
  date_announced: string | null;
  announcement_date?: string | null; // alternate column name in some databases
  notice_date: string | null;
  effective_date: string | null;
  employees_affected: number | null;
  employee_count_text: string | null;
  locations: string[] | string | null;
  departments: string[] | string | null;
  roles: string[] | string | null;
  reason_provided: string | null;
  summary: string;
  status: 'published' | 'verified';
  confidence: number;
  source_count: number;
  created_at: string;
  company?: Company; // Joined data
  sources?: Source[]; // Joined data
  event_path?: string; // /companies/<company>/<event-slug>, added by the API
}

// One row per company on the A-Z directory.
export interface DirectoryCompany {
  id: string;
  name: string;
  slug: string;
  events: number;
  latest: string | null; // ISO date of the newest public event
  workers: number; // sum of disclosed worker counts
}
