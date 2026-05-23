import { NextRequest, NextResponse } from 'next/server';

const ADMIN_COOKIE = 'grc_admin_session';
const ADMIN_COOKIE_VALUE = 'authenticated';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as {
    username?: string;
    password?: string;
  };

  if (body.username !== ADMIN_USERNAME || body.password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Username atau password salah.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, ADMIN_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });

  return response;
}
