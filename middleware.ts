import { NextRequest, NextResponse } from 'next/server';

const ADMIN_COOKIE = 'grc_admin_session';
const ADMIN_COOKIE_VALUE = 'authenticated';

const protectedPagePaths = ['/admin', '/blasting', '/list'];
const protectedApiPaths = [
  '/api/blast/email',
  '/api/blast/history',
  '/api/blast/people',
];

const isProtectedPath = (request: NextRequest) => {
  const { pathname } = request.nextUrl;

  if (protectedPagePaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return true;
  }

  if (protectedApiPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return true;
  }

  return pathname === '/api/surveys' && request.method === 'GET';
};

export function middleware(request: NextRequest) {
  if (!isProtectedPath(request)) {
    return NextResponse.next();
  }

  const isLoggedIn = request.cookies.get(ADMIN_COOKIE)?.value === ADMIN_COOKIE_VALUE;

  if (isLoggedIn) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Admin wajib login.' }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*', '/blasting/:path*', '/list/:path*', '/api/surveys', '/api/blast/:path*'],
};
