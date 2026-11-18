/** Send a precomputed JSON body, gzipped when the client accepts it, with ETag support. */
export function jsonBlob(
  request: Request,
  body: { json: string; gz: Buffer; etag: string },
  cacheControl: string,
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
    ETag: body.etag,
    Vary: 'Accept-Encoding',
  });
  if (request.headers.get('if-none-match') === body.etag) return new Response(null, { status: 304, headers });
  if (/\bgzip\b/.test(request.headers.get('accept-encoding') ?? '')) {
    headers.set('Content-Encoding', 'gzip');
    return new Response(body.gz as BodyInit, { headers });
  }
  return new Response(body.json, { headers });
}

export const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
