import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/site';

/** Only genuinely public routes belong here. Authenticated shells are excluded
 *  by construction — see src/app/robots.ts. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
  ];
}
