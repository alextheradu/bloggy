import type { APIRoute } from 'astro';
import { listPublished } from '../lib/posts';
import { abs } from '../lib/config';

// /blog/feed.json — JSON Feed 1.1, so the portfolio can pull "latest posts".
export const GET: APIRoute = async () => {
  const posts = await listPublished(30);
  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'alex radu — blog',
    home_page_url: abs('/'),
    feed_url: abs('/feed.json'),
    description: 'notes, build logs and other things by alex radu.',
    authors: [{ name: 'alex radu', url: 'https://alexradu.co' }],
    language: 'en-US',
    items: posts.map((p) => ({
      id: abs(`/${p.slug}`),
      url: abs(`/${p.slug}`),
      title: p.title || 'untitled',
      summary: p.excerpt,
      content_text: p.excerpt,
      date_published: p.publishedAt?.toISOString(),
      _reading_minutes: p.readingMinutes,
    })),
  };
  return new Response(JSON.stringify(feed), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      // the portfolio fetches this cross-origin from the browser or server
      'Access-Control-Allow-Origin': '*',
    },
  });
};
