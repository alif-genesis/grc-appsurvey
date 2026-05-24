import { NextRequest, NextResponse } from 'next/server';

const ADMIN_COOKIE = 'grc_admin_session';

const protectedPagePaths = ['/admin', '/blasting', '/control', '/list', '/monitoring'];
const protectedApiPaths = [
  '/api/blast/email',
  '/api/blast/history',
  '/api/blast/people',
  '/api/debug/supabase',
  '/api/survey-campaigns',
];
const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' https://genetikasolusibisnis.co.id https://upload.wikimedia.org data:",
    "connect-src 'self'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
  ].join('; '),
};

const withSecurityHeaders = (response: NextResponse) => {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
};

const isProtectedPath = (request: NextRequest) => {
  const { pathname } = request.nextUrl;

  if (protectedPagePaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return true;
  }

  if (protectedApiPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return true;
  }

  if ((pathname === '/api/services' || pathname.startsWith('/api/services/')) && request.method !== 'GET') {
    return true;
  }

  return (pathname === '/api/surveys' || pathname.startsWith('/api/surveys/')) && request.method === 'GET';
};

const isCrossSiteMutation = (request: NextRequest) => {
  if (!mutatingMethods.has(request.method)) return false;
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).host !== request.nextUrl.host;
  } catch {
    return true;
  }
};

export function proxy(request: NextRequest) {
  if (isCrossSiteMutation(request)) {
    return withSecurityHeaders(NextResponse.json({ error: 'Request ditolak.' }, { status: 403 }));
  }

  if (!isProtectedPath(request)) {
    return withSecurityHeaders(NextResponse.next());
  }

  const adminSessionSecret = process.env.ADMIN_SESSION_SECRET || '';
  const isLoggedIn = Boolean(adminSessionSecret)
    && request.cookies.get(ADMIN_COOKIE)?.value === adminSessionSecret;

  if (isLoggedIn) {
    return withSecurityHeaders(NextResponse.next());
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return withSecurityHeaders(NextResponse.json({ error: 'Admin wajib login.' }, { status: 401 }));
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('next', '/control');
  return withSecurityHeaders(NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
