import {
  PUBLIC_ORIGIN as RAW_ORIGIN,
  ADMIN_GITHUB_IDS,
  ADMIN_HCA_IDS,
} from 'astro:env/server';
import { u } from './url';
import type { User } from './db/schema';

export const PUBLIC_ORIGIN = RAW_ORIGIN.replace(/\/+$/, '');
export const IS_HTTPS = PUBLIC_ORIGIN.startsWith('https://');
export const MAIN_SITE = 'https://alexradu.co';

/** Absolute URL from the *public* origin (never the http:// the container sees). */
export const abs = (path = '/') => `${PUBLIC_ORIGIN}${u(path)}`;

const list = (s: string) =>
  new Set(
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  );
const adminGithub = list(ADMIN_GITHUB_IDS);
const adminHca = list(ADMIN_HCA_IDS);

export function isAdmin(user: Pick<User, 'provider' | 'providerUserId'> | null | undefined): boolean {
  if (!user) return false;
  if (user.provider === 'github') return adminGithub.has(user.providerUserId);
  if (user.provider === 'hca') return adminHca.has(user.providerUserId);
  return false;
}
