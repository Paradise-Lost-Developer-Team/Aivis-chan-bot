import type { APIRoute } from 'astro';
import { getSessionFromRequest } from '../../../lib/session';

export const POST: APIRoute = async ({ request, redirect }) => {
  const sess = getSessionFromRequest(request);
  if (!sess) return redirect('/api/auth/login');
  const form = await request.formData();
  // TODO: 内部APIへ保存
  return redirect('/dashboard/auto-join');
};
