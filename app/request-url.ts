import type { NextRequest } from 'next/server';

const FALLBACK_PUBLIC_APP_URL = 'https://survey.genetikasolusibisnis.co.id';

export const isLocalHost = (hostname: string) => (
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0'
);

const getConfiguredPublicOrigin = () => {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || FALLBACK_PUBLIC_APP_URL;

  try {
    const url = new URL(configuredUrl);
    return isLocalHost(url.hostname) ? FALLBACK_PUBLIC_APP_URL : url.origin;
  } catch {
    return FALLBACK_PUBLIC_APP_URL;
  }
};

export const getRequestOrigin = (request: NextRequest) => {
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '');
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return new URL(request.url).origin;
};

export const getPublicRequestOrigin = (request: NextRequest) => {
  const requestOrigin = getRequestOrigin(request);

  try {
    const url = new URL(requestOrigin);
    return isLocalHost(url.hostname) ? getConfiguredPublicOrigin() : url.origin;
  } catch {
    return getConfiguredPublicOrigin();
  }
};

export const getPublicRedirectUrl = (request: NextRequest, path: string) => (
  new URL(path, getPublicRequestOrigin(request))
);
