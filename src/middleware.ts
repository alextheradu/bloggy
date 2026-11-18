import { defineMiddleware } from 'astro:middleware';
import { PUBLIC_ORIGIN, isAdmin } from './lib/config';
import { SESSION_COOKIE, validateSession, setSessionCookie, clearSessionCookie } from './lib/auth/session';
import { u } from './lib/url';
import { getCustomEmojis } from './lib/emoji/cachet';

// Warm the ~15 MB Cachet emoji list at boot so the first picker/editor load is instant.
getCustomEmojis().catch((err) => console.warn('[cachet] warmup failed:', err?.message ?? err));

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF: Astro's checkOrigin is off (the container sees http:// behind
 * Cloudflare Flexible SSL while browsers are on https://), so every mutating
 * request must come from PUBLIC_ORIGIN. Sec-Fetch-Site is a browser-set
 * header pages can't forge, used as a fallback when Origin is absent.
 */
function originAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin) {
    if (origin === PUBLIC_ORIGIN) return true;
    // local dev on a different port than PUBLIC_ORIGIN says
    if (import.meta.env.DEV && origin === new URL(request.url).origin) return true;
    return false;
  }
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { request, cookies, url } = ctx;
  ctx.locals.user = null;
  ctx.locals.isAdmin = false;

  if (!SAFE_METHODS.has(request.method) && !originAllowed(request)) {
    return new Response('cross-origin request blocked', { status: 403 });
  }

  const path = url.pathname;
  // Static-ish routes don't need a DB round trip for the session.
  const needsSession = !/^\/blog\/(emoji|media|avatar|_astro)\//.test(path) && !path.endsWith('/api/health');

  if (needsSession) {
    const token = cookies.get(SESSION_COOKIE)?.value;
    if (token) {
      const res = await validateSession(token).catch((err) => {
        console.error('[session] lookup failed', err);
        return null;
      });
      if (res) {
        ctx.locals.user = res.user;
        ctx.locals.isAdmin = isAdmin(res.user);
        setSessionCookie(cookies, token, res.expiresAt);
      } else {
        clearSessionCookie(cookies);
      }
    }
  }

  const adminPage = path === u('/admin') || path.startsWith(u('/admin/'));
  const adminApi = path.startsWith(u('/api/admin/'));
  if ((adminPage || adminApi) && !ctx.locals.isAdmin) {
    if (adminApi) return Response.json({ error: 'forbidden' }, { status: ctx.locals.user ? 403 : 401 });
    if (!ctx.locals.user) return ctx.redirect(`${u('/login')}?next=${encodeURIComponent(path)}`);
    return new Response('not an admin', { status: 403 });
  }

  const response = await next();
  try {
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (!response.headers.has('X-Frame-Options')) response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  } catch {
    // immutable headers (e.g. Response.redirect) — nothing to add
  }
  return response;
});
