import type { APIRoute } from 'astro';
import { SESSION_COOKIE, clearSessionCookie, invalidateSession } from '../../lib/auth/session';
import { safeNext } from '../../lib/url';

// POST only (origin-checked in middleware) so a stray <img src> can't log you out.
export const POST: APIRoute = async ({ cookies, url, redirect, request }) => {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSession(token).catch(() => {});
  clearSessionCookie(cookies);
  if ((request.headers.get('accept') ?? '').includes('application/json')) return Response.json({ ok: true });
  return redirect(safeNext(url.searchParams.get('next')), 303);
};
