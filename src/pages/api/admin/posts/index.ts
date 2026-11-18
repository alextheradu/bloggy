import type { APIRoute } from 'astro';
import { createDraft } from '../../../../lib/posts';
import { u } from '../../../../lib/url';

// POST /blog/api/admin/posts — new empty draft. Admin-only (middleware).
// Plain form posts get redirected straight into the editor.
export const POST: APIRoute = async ({ request, redirect }) => {
  const post = await createDraft();
  if ((request.headers.get('accept') ?? '').includes('application/json')) return Response.json(post, { status: 201 });
  return redirect(u(`/admin/edit/${post.id}`), 303);
};
