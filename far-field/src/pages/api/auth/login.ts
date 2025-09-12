import type { APIRoute } from 'astro';
import { makeSessionCookie } from '../../../lib/session';

// NOTE: 簡易スタブ。実際はDiscord OAuth2の認可コードフローに差し替え。
export const GET: APIRoute = async ({ request, redirect }) => {
  const url = new URL(request.url);
  const plan = url.searchParams.get('plan') || 'free';
  const premium = plan === 'premium';

  // ここでDiscordのOAuth2を使いユーザー情報を取得して埋める
  const sess = {
    id: 'mock-user-id',
    username: premium ? 'Premium User' : 'Free User',
    avatar: undefined,
    premium
  };
  return new Response(null, {
    status: 302,
    headers: {
      'Set-Cookie': makeSessionCookie(sess),
      Location: '/dashboard'
    }
  });
};
