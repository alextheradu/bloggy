import type { AstroCookies } from 'astro';
import { IS_HTTPS } from '../config';
import { u } from '../url';

const PATH = () => u('/auth');
const opts = () => ({ httpOnly: true, secure: IS_HTTPS, sameSite: 'lax' as const, path: PATH(), maxAge: 600 });

export function setOAuthCookies(cookies: AstroCookies, v: { state: string; verifier: string; next: string }) {
  cookies.set('oauth_state', v.state, opts());
  cookies.set('oauth_verifier', v.verifier, opts());
  cookies.set('oauth_next', v.next, opts());
}

export function readOAuthCookies(cookies: AstroCookies) {
  const r = {
    state: cookies.get('oauth_state')?.value ?? null,
    verifier: cookies.get('oauth_verifier')?.value ?? null,
    next: cookies.get('oauth_next')?.value ?? null,
  };
  for (const k of ['oauth_state', 'oauth_verifier', 'oauth_next']) cookies.delete(k, { path: PATH() });
  return r;
}
