import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // Ignore React Native dependencies that MetaMask SDK tries to import
    // These are only needed for React Native apps, not web apps
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        '@react-native-async-storage/async-storage': false,
        'react-native': false,
      };
      
      // Ignore these modules completely
      config.resolve.alias = {
        ...config.resolve.alias,
        '@react-native-async-storage/async-storage': false,
        'react-native': false,
      };
    }
    
    return config;
  },
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
              // Allow loading wallet/token icons from common CDNs
              "img-src 'self' data: blob: https://raw.githubusercontent.com https://cdn.jsdelivr.net https://upload.wikimedia.org https://walletconnect.com",
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
