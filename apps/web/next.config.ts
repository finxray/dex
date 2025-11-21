import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Allow unsafe-eval for Web3 libraries (wagmi/viem) that require it
              // Note: This comes with security risks but is necessary for some blockchain libraries
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://fonts.cdnfonts.com",
              "style-src 'self' 'unsafe-inline' https://fonts.cdnfonts.com https://fonts.googleapis.com",
              "font-src 'self' https://fonts.cdnfonts.com https://fonts.gstatic.com data:",
              "img-src 'self' data: blob: https://raw.githubusercontent.com",
              // Allow connections to RPC endpoints and WebSocket connections for blockchain
              "connect-src 'self' https: wss: ws: http://localhost:* http://127.0.0.1:*",
              "frame-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
