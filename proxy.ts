import { NextRequest, NextResponse } from 'next/server';

const ADMIN_COOKIE = 'grc_admin_session';

const protectedPagePaths = ['/admin', '/blasting', '/control', '/list', '/monitoring', '/work-units'];
const protectedApiPaths = [
  '/api/blast/email',
  '/api/blast/history',
  '/api/blast/people',
  '/api/blast/reset',
  '/api/blast/senders',
  '/api/debug/supabase',
  '/api/survey-campaigns',
];
const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const generateNonce = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const buildContentSecurityPolicy = (nonce: string) => [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' https://genetikasolusibisnis.co.id https://upload.wikimedia.org data:",
  "connect-src 'self'",
  "form-action 'self'",
  `script-src 'self' 'nonce-${nonce}'`,
  `style-src 'self' 'nonce-${nonce}'`,
  "style-src-attr 'none'",
  "upgrade-insecure-requests",
].join('; ');

const buildSecurityHeaders = (nonce: string) => ({
  'Strict-Transport-Security': 'max-age=15552000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': buildContentSecurityPolicy(nonce),
});

const withSecurityHeaders = (response: NextResponse, nonce: string) => {
  Object.entries(buildSecurityHeaders(nonce)).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
};

const withStaticCacheHeaders = (request: NextRequest, response: NextResponse) => {
  const { pathname } = request.nextUrl;
  if (pathname === '/genesis-logo.svg' || pathname.startsWith('/fonts/') || pathname.startsWith('/images/')) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
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

  if ((pathname === '/api/work-units' || pathname.startsWith('/api/work-units/')) && request.method !== 'GET') {
    return true;
  }

  return (pathname === '/api/surveys' || pathname.startsWith('/api/surveys/')) && request.method === 'GET';
};

const isCrossSiteMutation = (request: NextRequest) => {
  if (!mutatingMethods.has(request.method)) return false;
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    const originHost = new URL(origin).host;
    const allowedHosts = new Set([
      request.nextUrl.host,
      request.headers.get('host') || '',
      request.headers.get('x-forwarded-host') || '',
      process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).host : '',
    ].filter(Boolean));

    return !allowedHosts.has(originHost);
  } catch {
    return true;
  }
};

export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', buildContentSecurityPolicy(nonce));

  if (isCrossSiteMutation(request)) {
    return withSecurityHeaders(NextResponse.json({ error: 'Request ditolak.' }, { status: 403 }), nonce);
  }

  if (!isProtectedPath(request)) {
    return withStaticCacheHeaders(request, withSecurityHeaders(NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    }), nonce));
  }

  const adminSessionSecret = process.env.ADMIN_SESSION_SECRET || '';
  const isLoggedIn = Boolean(adminSessionSecret)
    && request.cookies.get(ADMIN_COOKIE)?.value === adminSessionSecret;

  if (isLoggedIn) {
    return withStaticCacheHeaders(request, withSecurityHeaders(NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    }), nonce));
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return withSecurityHeaders(NextResponse.json({ error: 'Admin wajib login.' }, { status: 401 }), nonce);
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('next', '/control');
  return withSecurityHeaders(NextResponse.redirect(loginUrl), nonce);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
