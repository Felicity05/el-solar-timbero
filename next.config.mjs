/** @type {import('next').NextConfig} */
const nextConfig = {
  logging: {
    // Next 16 logs Server Function arguments by default in development.
    // Purchase credentials and attendee payloads must never enter those logs.
    serverFunctions: false,
    // Stripe can append a client secret to its return URL.
    incomingRequests: { ignore: [/\/ticket\/return/] },
  },
};

export default nextConfig;
