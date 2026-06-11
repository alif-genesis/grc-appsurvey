const isGithubPages = process.env.GITHUB_PAGES === 'true';
const basePath = isGithubPages ? '/grc-appsurvey' : '';

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=15552000',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
  trailingSlash: true,
  basePath,
  assetPrefix: basePath,
  experimental: {
    sri: {
      algorithm: 'sha384',
    },
  },
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
