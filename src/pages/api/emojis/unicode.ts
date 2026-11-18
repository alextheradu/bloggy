import type { APIRoute } from 'astro';
import { unicodeRowsGz, unicodeRowsJson } from '../../../lib/emoji/unicode';
import { jsonBlob } from '../../../lib/http';

// GET /blog/api/emojis/unicode: [char, "shortcodes", group, label][] from emojibase (iamcal shortcodes)
const etag = `"u-${unicodeRowsJson.length.toString(36)}"`;
export const GET: APIRoute = ({ request }) =>
  jsonBlob(request, { json: unicodeRowsJson, gz: unicodeRowsGz(), etag }, 'public, max-age=604800, immutable');
