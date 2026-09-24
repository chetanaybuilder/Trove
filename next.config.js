/** Static export is deliberate: FastAPI becomes the sole production server. */
const nextConfig = {
  output: process.env.NODE_ENV === "production" ? "export" : undefined,
  images: { unoptimized: true },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/api/:path*",
      },
    ];
  },
};
module.exports = nextConfig;