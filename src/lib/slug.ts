/** Pure (client-safe) slug helpers. */
export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'auth', 'login', 'logout', 'emoji', 'media', 'avatar', 'rss.xml', 'feed.json',
  'new', 'edit', 'search', 'tags', 'about', '_astro', 'favicon.svg', 'favicon.ico', 'robots.txt',
]);

export function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'untitled'
  );
}

export const isValidSlug = (s: string) =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 80 && !RESERVED_SLUGS.has(s);
