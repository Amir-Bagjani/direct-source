import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const backend = new URL(process.env.DJANGO_API_URL ?? "http://127.0.0.1:8000");
const protocol = backend.protocol === "https:" ? "https" : "http";

export default withNextIntl({
  reactCompiler: true,
  poweredByHeader: false,
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  images: {
    remotePatterns: [
      {
        protocol,
        hostname: backend.hostname,
        port: backend.port,
        pathname: "/**",
      },
    ],
  },
});
