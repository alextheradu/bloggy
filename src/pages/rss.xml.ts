import type { APIRoute } from 'astro';
import rss from '@astrojs/rss';
import { listPublished } from '../lib/posts';
import { abs } from '../lib/config';

// /blog/rss.xml — published posts only (unlisted stays out).
export const GET: APIRoute = async () => {
  const posts = await listPublished(50);
  const res = await rss({
    title: 'alex radu — blog',
    description: 'notes, build logs and other things by alex radu.',
    site: abs('/'),
    items: posts.map((p) => ({
      title: p.title || 'untitled',
      description: p.excerpt,
      link: abs(`/${p.slug}`),
      pubDate: p.publishedAt ?? new Date(),
    })),
    customData: '<language>en-us</language>',
  });
  res.headers.set('Cache-Control', 'public, max-age=300, s-maxage=600');
  return res;
};
