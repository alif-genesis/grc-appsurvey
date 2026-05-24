import { NextRequest, NextResponse } from 'next/server';

const ADMIN_COOKIE = 'grc_admin_session';

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.delete(ADMIN_COOKIE);
  return response;
}

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ADMIN_COOKIE);
  return response;
}
