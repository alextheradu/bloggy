import type { APIRoute } from 'astro';
import { putObject } from '../../../lib/s3';
import { bad } from '../../../lib/http';
import { u } from '../../../lib/url';

const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};
const MAX = 15 * 1024 * 1024;

// POST multipart { file } -> { url: "/blog/media/uploads/YYYY/MM/<rand>.<ext>" }
export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad('expected multipart form');
  }
  const file = form.get('file');
  if (!(file instanceof File)) return bad('missing file');
  const ext = TYPES[file.type];
  if (!ext) return bad('png, jpg, gif, webp or avif only'); // no svg (served same-origin)
  if (file.size > MAX) return bad('max 15 MB', 413);

  const now = new Date();
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const key = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${rand}.${ext}`;
  await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type, undefined, 'public, max-age=31536000, immutable');
  return Response.json({ url: u(`/media/${key}`), key }, { status: 201 });
};
