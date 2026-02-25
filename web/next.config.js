/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow development origins
  allowedDevOrigins: [
    "http://192.168.178.4:3000",
  ],

  // Exclude private_tiles from Turbopack's file tracing (58k+ PNG files causing slow builds)
  outputFileTracingIgnores: ["**/private_tiles/**"],

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
