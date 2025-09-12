import type { APIRoute } from 'astro';
import { clearSessionCookie } from '../../../lib/session';

export const GET: APIRoute = async () => {
  return new Response(null, {
    status: 302,
    headers: {
      'Set-Cookie': clearSessionCookie(),
      Location: '/'
    }
  });
};
