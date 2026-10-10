export interface Company {
  id: string;
  canonical_name: string;
  slug: string;
  website_domain: string | null;
}

export interface LayoffEvent {
  id: string;
  company_id: string;
  event_slug: string;
  date_announced: string | null;
  notice_date: string | null;
  effective_date: string | null;
  employees_affected: number | null;
  employee_count_text: string | null;
  locations: string[] | null;
  departments: string[] | null;
  roles: string[] | null;
  reason_provided: string | null;
  summary: string;
  status: 'published' | 'verified';
  confidence: number;
  source_count: number;
  created_at: string;
  company?: Company; // Joined data
  sources?: Source[]; // Joined data
}

export interface Source {
  id: string;
  publisher: string;
  url: string;
  title: string;
  published_at: string | null;
}