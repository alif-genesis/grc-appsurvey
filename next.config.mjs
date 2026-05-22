const isGithubPages = process.env.GITHUB_PAGES === 'true';
const basePath = isGithubPages ? '/grc-appsurvey' : '';

const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  basePath,
  assetPrefix: basePath,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
