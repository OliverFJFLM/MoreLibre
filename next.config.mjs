const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "example.org",
      },
      {
        protocol: "https",
        hostname: "ndl.go.jp",
      },
      {
        protocol: "https",
        hostname: "cover.openbd.jp",
      },
    ],
  },
};

export default nextConfig;
