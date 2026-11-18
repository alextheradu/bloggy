import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  NoSuchKey,
  NoSuchBucket,
  BucketAlreadyExists,
  BucketAlreadyOwnedByYou,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { S3_ACCESS_KEY, S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_SECRET_KEY } from 'astro:env/server';

// Generic S3 API: works with RustFS / Garage / R2 / etc. by env vars alone.
const g = globalThis as unknown as { __blogS3?: S3Client };
export const s3 = (g.__blogS3 ??= new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
}));
export const bucket = S3_BUCKET;

export interface StoredObject {
  body: ReadableStream;
  contentType: string;
  contentLength?: number;
  etag?: string;
  metadata: Record<string, string>;
}

const isNotFound = (err: unknown) =>
  err instanceof NoSuchKey ||
  (err instanceof S3ServiceException && (err.$metadata.httpStatusCode === 404 || err.name === 'NotFound'));

export async function getObject(key: string): Promise<StoredObject | null> {
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!out.Body) return null;
    return {
      body: out.Body.transformToWebStream(),
      contentType: out.ContentType || 'application/octet-stream',
      contentLength: out.ContentLength,
      etag: out.ETag,
      metadata: out.Metadata ?? {},
    };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function getObjectBytes(key: string): Promise<Uint8Array | null> {
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return out.Body ? await out.Body.transformToByteArray() : null;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function putObject(
  key: string,
  body: Uint8Array | string,
  contentType: string,
  metadata?: Record<string, string>,
  cacheControl?: string,
) {
  const put = () =>
    s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
        CacheControl: cacheControl,
      }),
    );
  try {
    await put();
  } catch (err) {
    // Fresh server (dev or a new Dokploy volume): create the bucket once, retry.
    if (!(err instanceof NoSuchBucket || (err instanceof S3ServiceException && err.name === 'NoSuchBucket'))) throw err;
    await ensureBucket();
    await put();
  }
}

let creating: Promise<void> | null = null;
function ensureBucket(): Promise<void> {
  return (creating ??= s3
    .send(new CreateBucketCommand({ Bucket: bucket }))
    .then(() => console.log(`[s3] created bucket "${bucket}"`))
    .catch((err) => {
      if (err instanceof BucketAlreadyOwnedByYou || err instanceof BucketAlreadyExists) return;
      throw err;
    })
    .finally(() => {
      creating = null;
    }));
}

export async function s3Healthy(): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch (err) {
    // HeadBucket has no body, so a missing bucket surfaces as a bare 404.
    if (!(err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404)) return false;
    try {
      await ensureBucket();
      return true;
    } catch {
      return false;
    }
  }
}

/** Stream a stored object as an HTTP response, honouring If-None-Match. */
export function objectResponse(obj: StoredObject, request: Request, cacheControl: string): Response {
  const headers = new Headers({
    'Content-Type': obj.contentType,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
  });
  if (obj.etag) headers.set('ETag', obj.etag);
  if (obj.etag && request.headers.get('if-none-match') === obj.etag) {
    obj.body.cancel().catch(() => {});
    return new Response(null, { status: 304, headers });
  }
  if (obj.contentLength != null) headers.set('Content-Length', String(obj.contentLength));
  return new Response(obj.body, { headers });
}
