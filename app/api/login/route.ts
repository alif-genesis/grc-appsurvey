import { NextRequest, NextResponse } from 'next/server';

const ADMIN_COOKIE = 'grc_admin_session';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

const getClientKey = (request: NextRequest) => (
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  || request.headers.get('x-real-ip')
  || 'unknown'
);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as {
    username?: string;
    password?: string;
  };
  const clientKey = getClientKey(request);
  const now = Date.now();
  const currentAttempt = loginAttempts.get(clientKey);

  if (currentAttempt && currentAttempt.resetAt > now && currentAttempt.count >= LOGIN_MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan login. Coba lagi beberapa menit.' }, { status: 429 });
  }

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminSessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!adminPassword || !adminSessionSecret) {
    return NextResponse.json({ error: 'Konfigurasi login admin belum lengkap.' }, { status: 500 });
  }

  if (body.username !== adminUsername || body.password !== adminPassword) {
    const nextAttempt = currentAttempt && currentAttempt.resetAt > now
      ? { count: currentAttempt.count + 1, resetAt: currentAttempt.resetAt }
      : { count: 1, resetAt: now + LOGIN_WINDOW_MS };
    loginAttempts.set(clientKey, nextAttempt);
    return NextResponse.json({ error: 'Username atau password salah.' }, { status: 401 });
  }

  loginAttempts.delete(clientKey);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, adminSessionSecret, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });

  return response;
}
