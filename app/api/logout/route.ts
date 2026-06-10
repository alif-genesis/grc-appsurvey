import { NextRequest, NextResponse } from 'next/server';
import { getPublicRedirectUrl } from '../../request-url';

const ADMIN_COOKIE = 'grc_admin_session';

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(getPublicRedirectUrl(request, '/'));
  response.cookies.delete(ADMIN_COOKIE);
  return response;
}

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ADMIN_COOKIE);
  return response;
}
