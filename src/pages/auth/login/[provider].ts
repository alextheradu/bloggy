import type { APIRoute } from 'astro';
import { createAuthUrl, isConfigured, isProvider } from '../../../lib/auth/providers';
import { setOAuthCookies } from '../../../lib/auth/oauth-cookies';
import { safeNext, u } from '../../../lib/url';

export const GET: APIRoute = ({ params, url, cookies, redirect }) => {
  const provider = params.provider;
  if (!isProvider(provider)) return new Response('unknown provider', { status: 404 });
  if (!isConfigured(provider)) return redirect(`${u('/login')}?error=${provider}-not-configured`);

  const next = safeNext(url.searchParams.get('next'));
  const { url: authUrl, state, codeVerifier } = createAuthUrl(provider);
  setOAuthCookies(cookies, { state, verifier: codeVerifier, next });
  return redirect(authUrl.toString(), 302);
};
