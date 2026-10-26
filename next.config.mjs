/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/check-in/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Permissions-Policy", value: "camera=(self)" },
        ],
      },
      {
        source: "/tickets/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
  logging: {
    // Next 16 logs Server Function arguments by default in development.
    // Purchase credentials and attendee payloads must never enter those logs.
    serverFunctions: false,
    // Stripe can append a client secret to its return URL.
    incomingRequests: { ignore: [/\/ticket\/return/, /\/tickets\//] },
  },
  allowedDevOrigins: ["192.168.4.210"],
};

export default nextConfig;
