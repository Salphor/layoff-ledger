export interface Company {
  id: string;
  canonical_name: string;
  slug: string;
  website_domain: string | null;
}

export interface EventArticle {
  version: number;
  headline: string;
  summary: string;
  key_points: string[];
  facts: {
    employees_affected: number | null;
    employee_count_text: string | null;
    announced_date: string | null;
    effective_date: string | null;
    locations: string[];
    departments: string[];
    roles: string[];
    reason_provided: string | null;
  };
  is_warn_notice: boolean;
  has_news_coverage: boolean;
  sources_reviewed: number;
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
  article?: EventArticle | null;
  article_generated_at?: string | null;
  company?: Company; // Joined data
  sources?: Source[]; // Joined data
}
