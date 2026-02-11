/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow development origins
  allowedDevOrigins: [
    '188.245.42.178',
    'localhost',
    '127.0.0.1',
  ],

  // Enable static export for mobile builds
  ...(process.env.NEXT_PUBLIC_PLATFORM === 'mobile' && {
    output: 'export',
    images: {
      unoptimized: true, // Required for static export
    },
    // Disable features incompatible with static export
    trailingSlash: true,
  }),
};

module.exports = nextConfig;
