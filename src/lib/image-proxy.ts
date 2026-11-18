import { getObject, objectResponse, putObject } from './s3';

/**
 * Serve a remote image from our own domain, caching the bytes in the bucket.
 * The browser never talks to slack-edge.com (blocked on school networks).
 */

const MAX_BYTES = 8 * 1024 * 1024;
const inflight = new Map<string, Promise<{ bytes: Uint8Array; type: string } | null>>();

async function download(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'blog-image-proxy' } });
  if (!res.ok) return null;
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!/^image\/(png|jpe?g|gif|webp|avif)$/.test(type)) return null; // no svg: same-origin xss risk
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;
  return { bytes, type };
}

export interface ProxyOptions {
  key: string;
  request: Request;
  cacheControl: string;
  /** upstream url if already known (cheap); mismatching cached objects are refetched */
  knownUrl?: string | null;
  /** resolve upstream url when nothing usable is cached (may hit the network) */
  resolve: () => Promise<string | null>;
  /** treat cached copies older than this as stale (ms); default: never */
  maxAgeMs?: number;
}

export async function proxyImage(o: ProxyOptions): Promise<Response> {
  // The bucket is only a cache: if it's unreachable (bad endpoint, RustFS
  // down) serve straight from upstream instead of 500ing every image.
  const cached = await getObject(o.key).catch((err) => {
    console.warn('[proxy] cache read failed, serving upstream', o.key, err?.message);
    return null;
  });
  if (cached) {
    const src = cached.metadata['source-url'];
    const fetchedAt = Number(cached.metadata['fetched-at'] || 0);
    const urlOk = !o.knownUrl || o.knownUrl === src;
    const ageOk = !o.maxAgeMs || Date.now() - fetchedAt < o.maxAgeMs;
    if (urlOk && ageOk) return objectResponse(cached, o.request, o.cacheControl);
    cached.body.cancel().catch(() => {});
  }

  let p = inflight.get(o.key);
  if (!p) {
    p = (async () => {
      const url = o.knownUrl ?? (await o.resolve());
      if (!url) return null;
      const img = await download(url);
      if (img) {
        await putObject(o.key, img.bytes, img.type, { 'source-url': url, 'fetched-at': String(Date.now()) }).catch(
          (err) => console.warn('[proxy] cache write failed', o.key, err?.message),
        );
      }
      return img;
    })().finally(() => inflight.delete(o.key));
    inflight.set(o.key, p);
  }

  const img = await p.catch(() => null);
  if (!img) {
    return new Response('not found', {
      status: 404,
      headers: { 'Cache-Control': 'public, max-age=300', 'Content-Type': 'text/plain' },
    });
  }
  return new Response(img.bytes as BodyInit, {
    headers: {
      'Content-Type': img.type,
      'Content-Length': String(img.bytes.byteLength),
      'Cache-Control': o.cacheControl,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
