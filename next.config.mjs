/** @type {import('next').NextConfig} */
const nextConfig = {
  // The development indicator is a local helper, not part of the product, and it overlaps the first
  // compact navigation item at 320px. Keeping it off also keeps the documentation captures free of
  // development-only chrome.
  devIndicators: false,
  async rewrites() {
    return [{
      source: '/api/v1/:path*',
      destination: 'http://localhost:3001/api/v1/:path*',
    }];
  },
};

export default nextConfig;
