const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

const PRIVATE_RANGE_PATTERNS = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
];

/**
 * Detects whether the provided RPC URL points to a local development node.
 * Treats empty/undefined values, localhost, loopback, and private LAN IPs as local.
 */
export function isLocalRpc(url?: string | null): boolean {
  if (!url || url.trim() === "") {
    return true;
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname?.toLowerCase();
    if (!hostname) {
      return true;
    }

    if (LOCAL_HOSTNAMES.has(hostname)) {
      return true;
    }

    if (hostname.endsWith(".local")) {
      return true;
    }

    return PRIVATE_RANGE_PATTERNS.some((pattern) => pattern.test(hostname));
  } catch {
    // Fall back to simple substring detection for malformed URLs
    const lowered = url.toLowerCase();
    return lowered.includes("localhost") || lowered.includes("127.0.0.1");
  }
}


