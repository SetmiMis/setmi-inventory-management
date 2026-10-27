import type { NextConfig } from "next";

// Content-Security-Policy. Not the nonce version: nonces need every page to be rendered on each request, which
// does not work with Cache Components / partial prerendering (see the Next.js CSP guide). So scripts and styles
// allow 'unsafe-inline' (Next.js writes small inline scripts), and the protection comes from everything else:
// no other script host, no framing, no plugins, forms and links to the base only post to this site, and the browser
// may only talk to this site and to the Supabase project (API and file Storage).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseHost = /^https:\/\/[a-z0-9.-]+$/i.test(supabaseUrl.replace(/\/$/, "")) ? supabaseUrl.replace(/\/$/, "") : "";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${supabaseHost}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseHost} ${supabaseHost.replace("https://", "wss://")}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  /* config options here */
  poweredByHeader: false, // do not tell strangers which framework runs the site
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Default is 1 MB. The Excel import accepts files up to 3 MB; 4 MB leaves room for form overhead
    // and stays under Vercel's ~4.5 MB request limit.
    serverActions: { bodySizeLimit: "4mb" },
  },
  // Safe browser-protection headers. The Content-Security-Policy is built above; see docs/DEPLOYMENT.md section 7.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
