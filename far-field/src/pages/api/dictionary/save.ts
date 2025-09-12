import type { APIRoute } from 'astro';
import { getSessionFromRequest } from '../../../lib/session';

export const POST: APIRoute = async ({ request, redirect }) => {
  const sess = getSessionFromRequest(request);
  if (!sess) return redirect('/api/auth/login');
  const form = await request.formData();
  const guildId = String(form.get('guildId') || '');
  const word = String(form.get('word') || '');
  const pronunciation = String(form.get('pronunciation') || '');
  if (!guildId || !word || !pronunciation) return new Response('Bad Request', { status: 400 });
  // TODO: ここで内部APIへ反映
  return redirect('/dashboard/dictionary');
};
