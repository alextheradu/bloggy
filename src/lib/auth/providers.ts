import { GitHub, OAuth2Client, CodeChallengeMethod, generateCodeVerifier, generateState } from 'arctic';
import {
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  HCA_CLIENT_ID,
  HCA_CLIENT_SECRET,
} from 'astro:env/server';
import { PUBLIC_ORIGIN } from '../config';
import { u } from '../url';

export type ProviderId = 'github' | 'hca';

export interface ProviderProfile {
  providerUserId: string;
  username: string | null;
  name: string;
  avatarUrl: string | null;
}

export const callbackUrl = (p: ProviderId) => `${PUBLIC_ORIGIN}${u(`/auth/callback/${p}`)}`;

const HCA = {
  authorize: 'https://auth.hackclub.com/oauth/authorize',
  token: 'https://auth.hackclub.com/oauth/token',
  me: 'https://auth.hackclub.com/api/v1/me',
  // community-app scopes per auth.hackclub.com/docs/oauth-guide
  scopes: ['openid', 'profile', 'email', 'name', 'slack_id'],
};

export function isConfigured(p: ProviderId): boolean {
  return p === 'github' ? !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) : !!(HCA_CLIENT_ID && HCA_CLIENT_SECRET);
}

export function isProvider(p: string | undefined): p is ProviderId {
  return p === 'github' || p === 'hca';
}

/** Build the authorization URL. `codeVerifier` is only used by HCA (PKCE). */
export function createAuthUrl(p: ProviderId): { url: URL; state: string; codeVerifier: string } {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  if (p === 'github') {
    const gh = new GitHub(GITHUB_CLIENT_ID!, GITHUB_CLIENT_SECRET!, callbackUrl('github'));
    // no scopes: public profile (id, login, name, avatar) is all we need
    return { url: gh.createAuthorizationURL(state, []), state, codeVerifier };
  }
  const client = new OAuth2Client(HCA_CLIENT_ID!, HCA_CLIENT_SECRET!, callbackUrl('hca'));
  const url = client.createAuthorizationURLWithPKCE(
    HCA.authorize,
    state,
    CodeChallengeMethod.S256,
    codeVerifier,
    HCA.scopes,
  );
  return { url, state, codeVerifier };
}

/** Exchange the code and fetch a normalized profile. Throws on failure. */
export async function exchangeAndFetchProfile(
  p: ProviderId,
  code: string,
  codeVerifier: string,
): Promise<ProviderProfile> {
  if (p === 'github') {
    const gh = new GitHub(GITHUB_CLIENT_ID!, GITHUB_CLIENT_SECRET!, callbackUrl('github'));
    const tokens = await gh.validateAuthorizationCode(code);
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokens.accessToken()}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'blog-oauth',
      },
    });
    if (!res.ok) throw new Error(`github /user ${res.status}`);
    const gu = (await res.json()) as { id: number; login: string; name: string | null; avatar_url: string | null };
    return {
      providerUserId: String(gu.id),
      username: gu.login,
      name: gu.name || gu.login,
      avatarUrl: gu.avatar_url,
    };
  }

  // Hack Club Auth: token endpoint with client_secret_post (+ PKCE verifier).
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackUrl('hca'),
    client_id: HCA_CLIENT_ID!,
    client_secret: HCA_CLIENT_SECRET!,
    code_verifier: codeVerifier,
  });
  const tokenRes = await fetch(HCA.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  if (!tokenRes.ok) throw new Error(`hca token ${tokenRes.status}: ${await tokenRes.text()}`);
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) throw new Error('hca token: no access_token');

  const meRes = await fetch(HCA.me, { headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' } });
  if (!meRes.ok) throw new Error(`hca /me ${meRes.status}`);
  const { identity } = (await meRes.json()) as {
    identity: {
      id: string;
      first_name?: string | null;
      last_name?: string | null;
      primary_email?: string | null;
      slack_id?: string | null;
    };
  };
  if (!identity?.id) throw new Error('hca /me: no identity id');
  const name =
    [identity.first_name, identity.last_name].filter(Boolean).join(' ').trim() ||
    identity.primary_email?.split('@')[0] ||
    'hack clubber';
  return {
    providerUserId: identity.id,
    username: identity.slack_id ?? null,
    name,
    // Slack avatars live on slack-edge (blocked on school networks), so we
    // proxy them through /blog/avatar/<slack_id> instead of linking directly.
    avatarUrl: identity.slack_id ? u(`/avatar/${encodeURIComponent(identity.slack_id)}`) : null,
  };
}
