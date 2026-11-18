import type { APIRoute } from 'astro';
import { exchangeAndFetchProfile, isConfigured, isProvider } from '../../../lib/auth/providers';
import { readOAuthCookies } from '../../../lib/auth/oauth-cookies';
import { upsertUser } from '../../../lib/auth/users';
import { createSession, setSessionCookie } from '../../../lib/auth/session';
import { safeNext, u } from '../../../lib/url';

export const GET: APIRoute = async ({ params, url, cookies, redirect }) => {
  const provider = params.provider;
  if (!isProvider(provider) || !isConfigured(provider)) return new Response('unknown provider', { status: 404 });

  const fail = (reason: string) => redirect(`${u('/login')}?error=${encodeURIComponent(reason)}`);
  const saved = readOAuthCookies(cookies);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (url.searchParams.get('error')) return fail(url.searchParams.get('error')!);
  if (!code || !state || !saved.state || state !== saved.state || !saved.verifier) return fail('state-mismatch');

  try {
    const profile = await exchangeAndFetchProfile(provider, code, saved.verifier);
    const user = await upsertUser(provider, profile);
    const { token, expiresAt } = await createSession(user.id);
    setSessionCookie(cookies, token, expiresAt);
  } catch (err) {
    console.error(`[auth] ${provider} callback failed`, err);
    return fail('exchange-failed');
  }
  return redirect(safeNext(saved.next));
};
