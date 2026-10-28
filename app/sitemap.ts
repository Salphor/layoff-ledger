import type { MetadataRoute } from 'next'
import { getCompanyDirectory, getEventIndex, getEventSlugMap } from '@/lib/api'
import { companyHref, SITE_URL } from '@/lib/site'

export const revalidate = 3600

// Lists every company page and every event page for search engines.
// Set NEXT_PUBLIC_SITE_URL to your real domain so these links are absolute.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [companies, index, slugs] = await Promise.all([getCompanyDirectory(), getEventIndex(), getEventSlugMap()])
  const companyById = new Map(companies.map((c) => [c.id, c]))

  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE_URL}/layoffs`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE_URL}/companies`, changeFrequency: 'daily', priority: 0.8 },
  ]
  for (const c of companies) {
    pages.push({ url: `${SITE_URL}${companyHref(c)}`, lastModified: c.latest || undefined, changeFrequency: 'weekly', priority: 0.6 })
  }
  for (const e of index) {
    const c = companyById.get(e.company_id)
    const slug = slugs[e.id]
    if (!c || !slug) continue
    pages.push({ url: `${SITE_URL}${companyHref(c)}/${encodeURIComponent(slug)}`, changeFrequency: 'monthly', priority: 0.7 })
  }
  return pages
}
