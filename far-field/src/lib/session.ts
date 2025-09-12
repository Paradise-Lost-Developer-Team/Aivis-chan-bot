// Lightweight cookie-based session helpers for Astro endpoints and pages
export type Session = {
  id: string;
  username: string;
  avatar?: string;
  premium?: boolean;
};

export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  cookieHeader.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = decodeURIComponent(pair.slice(idx + 1).trim());
    out[k] = v;
  });
  return out;
}

export function getSessionFromRequest(req: Request): Session | null {
  const cookies = parseCookies(req.headers.get('cookie'));
  const raw = cookies['sess'];
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.id === 'string' && typeof obj.username === 'string') {
      return obj as Session;
    }
  } catch { /* noop */ }
  return null;
}

export function makeSessionCookie(sess: Session, opts?: { maxAgeSec?: number }): string {
  const v = JSON.stringify(sess);
  const parts = [
    `sess=${encodeURIComponent(v)}`,
    'Path=/'
  ];
  const maxAge = opts?.maxAgeSec ?? 60 * 60 * 24 * 7; // 7 days
  parts.push(`Max-Age=${maxAge}`);
  parts.push('HttpOnly');
  parts.push('SameSite=Lax');
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(): string {
  return 'sess=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' + (process.env.NODE_ENV === 'production' ? '; Secure' : '');
}
